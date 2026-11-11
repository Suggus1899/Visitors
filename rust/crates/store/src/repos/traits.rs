//! Traits de repositorio: el dominio y los handlers trabajan solo
//! contra estas interfaces, sin saber si debajo hay SQLite o
//! PostgreSQL (documento, §3.1; variante C en §11.4).
//!
//! Cada trait cubre exactamente las funciones libres que la fase 2
//! expuso en su módulo (`users`, `visitors`, `visits`, `audit`,
//! `privacy`, `catalogs`, `search`): mismo nombre, mismos parámetros,
//! mismos códigos de error. Las funciones libres siguen existiendo
//! como implementación SQLite; los traits solo les ponen la interfaz
//! común por encima.
//!
//! Decisiones:
//! - **Async con `async_trait`**: la variante PostgreSQL es sqlx,
//!   que es async, y los handlers de Axum ya son async. Un trait
//!   síncrono obligaría a la variante PostgreSQL a bloquear un hilo
//!   del runtime (`block_on` dentro de `block_in_place`) en cada
//!   consulta; un trait async deja que cada motor use su mecanismo
//!   natural. La implementación SQLite ejecuta sus llamadas rusqlite
//!   síncronas en línea, como ya hacía la fase 3 (`session.rs`
//!   llamaba a `Store::read` desde el middleware async): son
//!   operaciones locales de un solo escritor, sub-milisegundo, y el
//!   `busy_timeout` de 5 s ya cubre la contención. Si el perfilado
//!   mostrara bloqueos, el paso es envolverlas en `spawn_blocking`
//!   con parámetros propios (hoy prestados), sin tocar los traits.
//! - **Un método = una operación atómica.** Cada método de escritura
//!   corre en su propia transacción dentro de la implementación
//!   (SQLite: `Store::tx_immediate`; PostgreSQL: `pool.begin()`).
//!   Las operaciones que la fase 2 ya agrupaba —`transition` (mutar
//!   + auditoría) y `cancel_subject` (diez pasos + auditoría)— siguen
//!     agrupadas dentro de un solo método, así que su atomicidad no
//!     cambia.
//! - **Operaciones compuestas: `UnitOfWork`.** El check-in de Go
//!   (bloqueo asesor + insertar el perfil si es nuevo + insertar la
//!   visita + auditoría, todo en una sola transacción) no cabe en un
//!   método de un solo repositorio, así que la fase 4 lo resuelve
//!   con el trait `UnitOfWork` de este módulo: cada operación
//!   compuesta es un método atómico en ambos motores (SQLite lo
//!   compone con las funciones libres dentro de `tx_immediate`;
//!   PostgreSQL abre una transacción y ejecuta el SQL en línea).
//!   Los handlers llaman a `Repositories::uow`, nunca a los
//!   repositorios sueltos para estas operaciones.
//! - **Parámetros prestados, como en la fase 2** (`&NewUser<'_>`,
//!   `&Actor`, ...): `async_trait` los admite y las firmas quedan
//!   idénticas a las funciones libres.
//! - **Errores**: los mismos códigos de dominio (`VISIT_NOT_FOUND`,
//!   `OPEN_VISIT_EXISTS`, `INVALID_VISIT_STATE`, `USER_NOT_FOUND`,
//!   `VISITOR_NOT_FOUND`, `ARCO_REQUEST_NOT_FOUND`,
//!   `INDEX_STATE_NOT_FOUND`). Un fallo del motor es
//!   `StoreError::Db` (SQLite) o `StoreError::Pg` (PostgreSQL);
//!   ambos se traducen a `INTERNAL_ERROR` en la capa HTTP.

use async_trait::async_trait;

use crate::error::StoreResult;
use crate::models::{
    ActivityLog, ArcoRequest, Department, IdentityIndexState, IntermittentLog, ReportRow,
    SearchIndexState, User, Visit, VisitPurpose, Visitor, VisitorEditHistory, VisitorSearchToken,
};
use crate::repos::audit::{AuditEntry, AuditFilter};
use crate::repos::privacy::{ArcoFilter, CancelAudit, NewArcoRequest};
use crate::repos::users::NewUser;
use crate::repos::visitors::{NewEditHistory, NewVisitor, VisitorFilter};
use crate::repos::visits::{NewVisit, Transition, TransitionCall, VisitFilter};
use crate::repos::Actor;

/// Cuentas de usuario (`Users`). Reproduce `queries.sql`: `FindUser`,
/// `FindUserByID`, `ListUsers`, `LoginSucceeded`, `LoginFailed`,
/// `SaveResetToken`, `ConsumeResetToken`, `ChangePassword`, `Logout`.
#[async_trait]
pub trait UserRepository: Send + Sync {
    /// `FindUser`: por nombre de usuario. Sin fila → `USER_NOT_FOUND`.
    async fn find_by_username(&self, username: &str) -> StoreResult<User>;
    /// `FindUserByID`: por id. Sin fila → `USER_NOT_FOUND`.
    async fn find_by_id(&self, id: i64) -> StoreResult<User>;
    /// `FindUserByResetToken`: por hash de token de recuperación.
    /// Sin fila → `USER_NOT_FOUND`.
    async fn find_by_reset_token(&self, token: &str) -> StoreResult<User>;
    /// `ListUsers`: todas las cuentas por id.
    async fn list_all(&self) -> StoreResult<Vec<User>>;
    /// Inserta una cuenta y devuelve su id.
    async fn insert(&self, user: &NewUser<'_>) -> StoreResult<i64>;
    /// `LoginSucceeded`: limpia intentos y bloqueo.
    async fn login_succeeded(&self, id: i64, now: &str) -> StoreResult<()>;
    /// `LoginFailed`: registra el intento y el bloqueo, si lo hay.
    async fn login_failed(
        &self,
        id: i64,
        attempts: i64,
        locked_until: Option<&str>,
        now: &str,
    ) -> StoreResult<()>;
    /// `SaveResetToken`: guarda el token solo si el correo y la
    /// versión de sesión coinciden. Devuelve las filas afectadas
    /// (0 = no coincide).
    async fn save_reset_token(
        &self,
        id: i64,
        token: &str,
        expiry: &str,
        email: &str,
        token_version: i64,
        now: &str,
    ) -> StoreResult<u64>;
    /// `ConsumeResetToken`: aplica la nueva contraseña y consume el
    /// token de un solo uso. Sin fila válida → `USER_NOT_FOUND`.
    async fn consume_reset_token(
        &self,
        token: &str,
        new_password_hash: &str,
        now: &str,
    ) -> StoreResult<User>;
    /// `ChangePassword`: cambia la contraseña propia y revoca
    /// sesiones (sube `tokenVersion`). Devuelve las filas afectadas
    /// (0 = la versión de sesión cambió entre tanto).
    async fn change_password(
        &self,
        id: i64,
        new_password_hash: &str,
        must_change_password: bool,
        token_version: i64,
        now: &str,
    ) -> StoreResult<u64>;
    /// `Logout`: revoca la sesión subiendo `tokenVersion`, solo si la
    /// versión coincide (y no está en el máximo de int32). Devuelve
    /// las filas afectadas (0 = la versión cambió entre tanto).
    async fn revoke_session(&self, id: i64, token_version: i64, now: &str) -> StoreResult<u64>;
    /// Limpia el token de recuperación de una cuenta (si el envío del
    /// correo falló, como hace Go en `forgotPassword`).
    async fn clear_reset_token(&self, id: i64, token: &str) -> StoreResult<()>;
    /// `UpdateUser` (panel root, fase 4): cambia nombre, correo (un
    /// `None` exterior lo deja; un `Some(None)` lo borra) y rol, y
    /// revoca sesiones. Devuelve las filas afectadas.
    async fn update_user(
        &self,
        id: i64,
        username: &str,
        email: Option<Option<&str>>,
        role: &str,
        now: &str,
    ) -> StoreResult<u64>;
    /// `DeleteUser` (panel root, fase 4): borra la cuenta. Devuelve
    /// las filas afectadas (0 = no existe).
    async fn delete_user(&self, id: i64) -> StoreResult<u64>;
}

/// Perfiles de visitante (`Visitors`) e historial de cambios
/// (`VisitorEditHistories`). Reproduce `FindVisitor`,
/// `FindVisitorByID` y las escrituras de `visits.go` y `visitors.go`.
#[async_trait]
pub trait VisitorRepository: Send + Sync {
    /// `FindVisitor`: por hash de cédula, solo no anonimizados.
    /// Sin fila → `VISITOR_NOT_FOUND`.
    async fn find_by_cedula(&self, cedula_hash: &str) -> StoreResult<Visitor>;
    /// `FindVisitorByID`: por id, incluya anonimizados (para
    /// trazabilidad). Sin fila → `VISITOR_NOT_FOUND`.
    async fn find_by_id(&self, id: i64) -> StoreResult<Visitor>;
    /// Inserta un perfil y devuelve su id.
    async fn insert(&self, visitor: &NewVisitor<'_>) -> StoreResult<i64>;
    /// Actualiza un perfil completo.
    async fn update(&self, visitor: &Visitor, now: &str) -> StoreResult<()>;
    /// Bloquea o desbloquea un perfil.
    async fn set_blocked(&self, id: i64, blocked: bool, now: &str) -> StoreResult<()>;
    /// Actualiza solo las fotos de un perfil.
    async fn update_photos(
        &self,
        id: i64,
        photo_data: Option<&[u8]>,
        id_photo_data: Option<&[u8]>,
        now: &str,
    ) -> StoreResult<()>;
    /// Empresas distintas, para el filtro de visitantes.
    async fn list_companies(&self) -> StoreResult<Vec<String>>;
    /// Empresas distintas con filtro de texto (`companies` de Go):
    /// solo perfiles no anonimizados, como mucho 100.
    async fn list_companies_filtered(&self, query: &str) -> StoreResult<Vec<String>>;
    /// Perfiles filtrados (`listVisitors` de Go), por id.
    async fn list_filtered(&self, filter: &VisitorFilter) -> StoreResult<Vec<Visitor>>;
    /// Total de perfiles del mismo filtro.
    async fn count_filtered(&self, filter: &VisitorFilter) -> StoreResult<i64>;
    /// Registra un cambio de perfil y devuelve su id.
    async fn insert_edit_history(&self, change: &NewEditHistory<'_>) -> StoreResult<i64>;
    /// Historial de un perfil, el más reciente primero.
    async fn list_edit_history_by_visitor(
        &self,
        visitor_id: i64,
    ) -> StoreResult<Vec<VisitorEditHistory>>;
    /// Historial de una visita, el más reciente primero.
    async fn list_edit_history_by_visit(
        &self,
        visit_id: i64,
    ) -> StoreResult<Vec<VisitorEditHistory>>;
}

/// Visitas (`Visits`) y salidas temporales (`IntermittentLogs`).
/// Reproduce `checkIn` (registro) y `transition` de `visits.go`, con
/// la máquina de estados de la línea base (§3).
#[async_trait]
pub trait VisitRepository: Send + Sync {
    /// `FindVisit`: por id. Sin fila → `VISIT_NOT_FOUND`.
    async fn find_by_id(&self, id: i64) -> StoreResult<Visit>;
    /// Registra una visita y devuelve su id. Si ya hay una visita
    /// abierta para la identidad, el índice parcial lo rechaza y se
    /// traduce a `OPEN_VISIT_EXISTS`, igual que Go traduce el 23505.
    async fn insert_checkin(&self, visit: &NewVisit<'_>) -> StoreResult<i64>;
    /// Visitas en un estado, con salida aún pendiente, ordenadas como
    /// en Go (`check_in_time, id`).
    async fn list_by_status(
        &self,
        status: &str,
        limit: i64,
        offset: i64,
    ) -> StoreResult<Vec<Visit>>;
    /// Visitas filtradas (`listVisits` de Go), con su total.
    async fn list_filtered(&self, filter: &VisitFilter) -> StoreResult<(Vec<Visit>, i64)>;
    /// Conteo por día local de Caracas (`calendar` de Go).
    async fn calendar_counts(
        &self,
        start: &str,
        end: &str,
        status: &str,
    ) -> StoreResult<Vec<(String, i64)>>;
    /// Filas agregadas de reportes (`reportVisits` de Go).
    async fn report_rows(&self, start: &str, end: &str) -> StoreResult<Vec<ReportRow>>;
    /// Visitas activas ahora mismo (`visitStats` de Go).
    async fn count_active(&self) -> StoreResult<i64>;
    /// Titulares distintos en un rango (`monthlyReport` de Go).
    async fn count_distinct_visitors(&self, start: &str, end: &str) -> StoreResult<i64>;
    /// Visitas activas desde hace demasiado (`alerts` de Go).
    async fn list_long_active(&self, before: &str) -> StoreResult<Vec<Visit>>;
    /// Últimas visitas de un visitante, por id o por hash de cédula
    /// (`getVisitor?history=true` de Go).
    async fn history_by_visitor(
        &self,
        visitor_id: i64,
        cedula_hash: &str,
        limit: i64,
    ) -> StoreResult<Vec<Visit>>;
    /// Visitas de un titular para el acceso ARCO (`subjectAccess` de
    /// Go): como `history_by_visitor`, con desempate por id.
    async fn list_by_visitor_for_access(
        &self,
        visitor_id: i64,
        cedula_hash: &str,
        limit: i64,
    ) -> StoreResult<Vec<Visit>>;
    /// Intervalos de salida temporal de una visita, por salida.
    async fn visit_logs(&self, visit_id: i64) -> StoreResult<Vec<IntermittentLog>>;
    /// Ejecuta una transición: comprueba el estado esperado, muta,
    /// escribe la auditoría y devuelve la visita actualizada, todo en
    /// una transacción. Un estado inesperado (o una salida ya cerrada)
    /// es `INVALID_VISIT_STATE` (409), como en Go. La auditoría
    /// lleva los metadatos HTTP del llamador (`TransitionAudit`).
    async fn transition(
        &self,
        id: i64,
        operation: Transition,
        call: &TransitionCall<'_>,
    ) -> StoreResult<Visit>;
}

/// Bitácora de actividad (`ActivityLogs`). Reproduce `WriteAudit` de
/// `queries.sql`.
#[async_trait]
pub trait AuditRepository: Send + Sync {
    /// Escribe una entrada de auditoría y devuelve su id.
    async fn write(&self, entry: &AuditEntry<'_>) -> StoreResult<i64>;
    /// Entradas más recientes, para el panel de auditoría.
    async fn list_recent(&self, limit: i64) -> StoreResult<Vec<ActivityLog>>;
    /// Número total de entradas.
    async fn count(&self) -> StoreResult<i64>;
    /// Entradas filtradas (`listActivityLogs` de Go), por fecha
    /// descendente.
    async fn list_filtered(
        &self,
        filter: &AuditFilter<'_>,
        limit: i64,
        offset: i64,
    ) -> StoreResult<Vec<ActivityLog>>;
    /// Total de entradas que cumplen el filtro.
    async fn count_filtered(&self, filter: &AuditFilter<'_>) -> StoreResult<i64>;
    /// Resumen de hoy (`auditStats` de Go): inicios de sesión,
    /// acciones, usuarios distintos e IPs distintas.
    async fn today_counts(&self, start: &str, end: &str) -> StoreResult<(i64, i64, i64, i64)>;
    /// Conteo agrupado (`auditStats` de Go): `action`, `username` o
    /// `date` (fecha local de Caracas).
    async fn group_counts(&self, since: &str, group: &str) -> StoreResult<Vec<(String, i64)>>;
    /// Valores distintos de una columna (`distinctActivityLogValues`
    /// de Go): solo `action` y `username`.
    async fn distinct(&self, column: &str) -> StoreResult<Vec<String>>;
}

/// Solicitudes ARCO y cancelación de datos (`ArcoRequests`).
/// Reproduce `privacy.go`.
#[async_trait]
pub trait ArcoRepository: Send + Sync {
    /// Crea una solicitud en estado `pending` y devuelve su id.
    async fn insert_request(&self, request: &NewArcoRequest<'_>) -> StoreResult<i64>;
    /// Busca una solicitud por id. Sin fila →
    /// `ARCO_REQUEST_NOT_FOUND`.
    async fn find_request_by_id(&self, id: i64) -> StoreResult<ArcoRequest>;
    /// Solicitudes más recientes, con paginación.
    async fn list_requests(&self, limit: i64, offset: i64) -> StoreResult<Vec<ArcoRequest>>;
    /// Solicitudes filtradas (`listArcoRequests` de Go), con su
    /// total.
    async fn list_filtered(&self, filter: &ArcoFilter) -> StoreResult<(Vec<ArcoRequest>, i64)>;
    /// Cambia el estado de una solicitud (admin/root). Devuelve las
    /// filas afectadas (0 = la solicitud no existe).
    async fn update_request_status(
        &self,
        id: i64,
        status: &str,
        resolution_notes: Option<&str>,
        resolved_at: Option<&str>,
        now: &str,
    ) -> StoreResult<u64>;
    /// Cancela los datos de un titular: anonimiza perfil, visitas,
    /// historial, bitácora y solicitudes, borra fotos y tokens, y
    /// deja la solicitud de cancelación resuelta como constancia,
    /// todo en una sola transacción. Con visitas abiertas devuelve
    /// `OPEN_VISIT_EXISTS`. La auditoría lleva los metadatos HTTP
    /// del llamador (`CancelAudit`).
    #[allow(clippy::too_many_arguments)]
    async fn cancel_subject(
        &self,
        visitor_id: i64,
        cedula_plain: &str,
        cedula_hash: &str,
        reference: &str,
        actor: &Actor,
        verification_method: &str,
        now: &str,
        audit_meta: Option<&CancelAudit<'_>>,
    ) -> StoreResult<()>;
}

/// Catálogos heredados (`Departments`, `VisitPurposes`).
#[async_trait]
pub trait CatalogRepository: Send + Sync {
    /// Departamentos, por nombre.
    async fn list_departments(&self) -> StoreResult<Vec<Department>>;
    /// Crea un departamento y devuelve su id.
    async fn insert_department(
        &self,
        name: &str,
        code: Option<&str>,
        now: &str,
    ) -> StoreResult<i64>;
    /// Activa o desactiva un departamento.
    async fn set_department_active(&self, id: i64, active: bool) -> StoreResult<()>;
    /// Propósitos de visita, por nombre.
    async fn list_purposes(&self) -> StoreResult<Vec<VisitPurpose>>;
    /// Crea un propósito y devuelve su id.
    async fn insert_purpose(&self, name: &str, now: &str) -> StoreResult<i64>;
    /// Activa o desactiva un propósito.
    async fn set_purpose_active(&self, id: i64, active: bool) -> StoreResult<()>;
}

/// Búsqueda protegida por trigramas (`VisitorSearchTokens`) y estados
/// de índice (`SearchIndexState`, `IdentityIndexState`).
#[async_trait]
pub trait SearchTokenRepository: Send + Sync {
    /// Sustituye los tokens de un visitante por los dados.
    async fn replace_tokens(&self, visitor_id: i64, tokens: &[Vec<u8>]) -> StoreResult<()>;
    /// Borra los tokens de un visitante (al anonimizarlo, por
    /// ejemplo).
    async fn delete_tokens(&self, visitor_id: i64) -> StoreResult<()>;
    /// Tokens de un visitante.
    async fn tokens_for_visitor(&self, visitor_id: i64) -> StoreResult<Vec<VisitorSearchToken>>;
    /// Visitantes que tienen un token dado (coincidencia por
    /// igualdad, sin descifrar perfiles).
    async fn find_visitors_by_token(&self, token: &[u8]) -> StoreResult<Vec<i64>>;
    /// Estado del índice de búsqueda (fila única). Sin fila →
    /// `INDEX_STATE_NOT_FOUND`.
    async fn get_search_state(&self) -> StoreResult<SearchIndexState>;
    /// Guarda el estado del índice de búsqueda.
    async fn set_search_state(
        &self,
        fingerprint: &str,
        cursor: i64,
        ready: bool,
    ) -> StoreResult<()>;
    /// Estado del índice de identidad (fila única). Sin fila →
    /// `INDEX_STATE_NOT_FOUND`.
    async fn get_identity_state(&self) -> StoreResult<IdentityIndexState>;
    /// Guarda el estado del índice de identidad.
    async fn set_identity_state(&self, fingerprint: &str, ready: bool) -> StoreResult<()>;
}

/// Entrada de un check-in compuesto (`checkIn` de Go): el perfil
/// nuevo es opcional (cuando la cédula ya existe se reutiliza) y la
/// visita es obligatoria; los tokens son los trigramas del perfil
/// (nuevos o reindexados) y la auditoría se escribe en la misma
/// transacción.
pub struct CheckinInput<'a> {
    pub cedula_hash: &'a str,
    pub new_visitor: Option<&'a NewVisitor<'a>>,
    pub visit: &'a NewVisit<'a>,
    pub search_tokens: &'a [Vec<u8>],
    pub actor: &'a Actor,
    pub audit: &'a AuditEntry<'a>,
}

/// Resultado de un check-in compuesto: los ids del perfil y de la
/// visita registrados.
#[derive(Debug)]
pub struct CheckinOutcome {
    pub visitor_id: i64,
    pub visit_id: i64,
}

/// Entrada de una edición de perfil (`editVisitor` de Go): el perfil
/// completo ya actualizado, una fila de historial por campo cambiado,
/// los trigramas reindexados y la auditoría, todo en una transacción.
pub struct ProfileEdit<'a> {
    pub visitor: &'a Visitor,
    pub history: &'a [NewEditHistory<'a>],
    pub search_tokens: &'a [Vec<u8>],
    pub audit: &'a AuditEntry<'a>,
    pub now: &'a str,
}

/// Operaciones compuestas de la fase 4: cada método es **una sola
/// transacción en el motor elegido**, aunque toque varios
/// repositorios. Es la respuesta al hueco que el doble motor dejó
/// pendiente: con traits por repositorio no hay transacción
/// compartida, así que la composición vive aquí, con una
/// implementación por motor (SQLite compone las funciones libres
/// dentro de `tx_immediate`; PostgreSQL abre una transacción y
/// ejecuta el SQL en línea, reutilizando el SQL de `Pg*Repository`).
/// Los handlers usan `Repositories::uow` para estas operaciones y
/// nunca componen llamadas sueltas.
#[async_trait]
pub trait UnitOfWork: Send + Sync {
    /// Inicio de sesión exitoso (`LoginSucceeded` + auditoría
    /// `LOGIN` en la misma transacción).
    async fn login_success(&self, id: i64, now: &str, audit: &AuditEntry<'_>) -> StoreResult<()>;
    /// Cierre de sesión (`Logout` + auditoría `LOGOUT`): devuelve
    /// las filas afectadas (0 = la versión de sesión cambió).
    async fn logout(
        &self,
        id: i64,
        token_version: i64,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<u64>;
    /// Cambio de contraseña (`ChangePassword` + auditoría): devuelve
    /// las filas afectadas (0 = la versión de sesión cambió).
    async fn change_password(
        &self,
        id: i64,
        hash: &str,
        must_change: bool,
        token_version: i64,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<u64>;
    /// Consumo del token de recuperación (`ConsumeResetToken` +
    /// auditoría `PASSWORD_RESET`): devuelve la cuenta actualizada.
    /// Sin token válido → `USER_NOT_FOUND`.
    async fn consume_reset(
        &self,
        token: &str,
        hash: &str,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<User>;
    /// Check-in compuesto de Go: bloqueo de identidad, inserción
    /// del perfil si es nuevo (con sus trigramas), inserción de la
    /// visita y auditoría `CHECKIN`. Si la visita abierta ya existe,
    /// el índice parcial la rechaza como `OPEN_VISIT_EXISTS`. La
    /// auditoría se escribe con `entity_id` igual al id de la visita
    /// (como Go); el `entity_id` que trae la entrada se ignora.
    async fn checkin(&self, input: &CheckinInput<'_>) -> StoreResult<CheckinOutcome>;
    /// Edición de perfil compuesta: actualiza el perfil, registra
    /// el historial por campo, reindexa los trigramas y audita
    /// `VISITOR_UPDATE`. Devuelve el perfil actualizado.
    async fn apply_profile_edit(&self, edit: &ProfileEdit<'_>) -> StoreResult<Visitor>;
    /// Creación de solicitud ARCO (`insert_request` + auditoría
    /// `ARCO_REQUEST_CREATED`): devuelve el id. La auditoría se
    /// escribe con `entity_id` igual al id de la solicitud (como
    /// Go); el `entity_id` que trae la entrada se ignora.
    async fn create_arco(
        &self,
        request: &NewArcoRequest<'_>,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<i64>;
    /// Cambio de estado de una solicitud ARCO (`update_request_status`
    /// + auditoría `ARCO_REQUEST_UPDATED`): devuelve la solicitud
    /// actualizada. Sin fila → `NOT_FOUND`, como en Go.
    async fn update_arco_status(
        &self,
        id: i64,
        status: &str,
        notes: Option<&str>,
        resolved_at: Option<&str>,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<ArcoRequest>;
    /// Acceso ARCO (`subjectAccess` de Go): perfil + visitas del
    /// titular y auditoría `ARCO_ACCESS_EXECUTED`, en una transacción.
    /// Sin perfil → `VISITOR_NOT_FOUND`. La auditoría se escribe
    /// con `entity_id` igual al id del titular (como Go); el
    /// `entity_id` que trae la entrada se ignora.
    async fn subject_access(
        &self,
        cedula_hash: &str,
        limit: i64,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<(Visitor, Vec<Visit>)>;
    /// Creación de cuenta (panel root): inserta y audita
    /// `SUPERADMIN_CREATE_USER`. Nombre duplicado → `USERNAME_EXISTS`.
    async fn create_user(&self, user: &NewUser<'_>, audit: &AuditEntry<'_>) -> StoreResult<i64>;
    /// Actualización de cuenta (panel root): actualiza y audita
    /// `SUPERADMIN_UPDATE_USER`. Devuelve la cuenta actualizada;
    /// sin fila → `USER_NOT_FOUND`; nombre duplicado →
    /// `USERNAME_EXISTS`.
    async fn update_user(
        &self,
        id: i64,
        username: &str,
        email: Option<Option<&str>>,
        role: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<User>;
    /// Borrado de cuenta (panel root): borra y audita
    /// `SUPERADMIN_DELETE_USER`. Sin fila → `USER_NOT_FOUND`.
    async fn delete_user(&self, id: i64, audit: &AuditEntry<'_>) -> StoreResult<()>;
}
