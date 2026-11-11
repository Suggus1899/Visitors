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
//! - **Lo que NO se puede expresar así:** el patrón de la fase 2 en
//!   el que el llamador abría una transacción (`Store::tx_immediate`)
//!   y componía varias funciones libres dentro —por ejemplo, el
//!   check-in de Go (`visits.go`): bloqueo asesor + insertar el
//!   perfil si es nuevo + insertar la visita + auditoría, todo en
//!   una sola transacción—. Con traits por repositorio no hay una
//!   transacción compartida entre repositorios, así que esa
//!   composición no cabe en un método de un solo trait. La adaptación
//!   mínima es una operación compuesta en la fase 4 (un servicio de
//!   dominio sobre `Repositories`, o un trait `UnitOfWork`), que
//!   agrupe `insert` de visitante + `insert_checkin` + `write` de
//!   auditoría en una transacción del motor elegido. Hasta entonces,
//!   llamar a esos tres métodos seguidos deja los mismos datos y los
//!   mismos códigos de error, pero sin la atomicidad conjunta: si el
//!   proceso muere entre el perfil y la visita, queda un perfil sin
//!   visita (estado válido: un perfil puede existir sin visitas) o
//!   una visita sin su entrada de auditoría. Eso es una diferencia
//!   real con Go y queda registrada aquí, no silenciada.
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
    ActivityLog, ArcoRequest, Department, IdentityIndexState, IntermittentLog, SearchIndexState,
    User, Visit, VisitPurpose, Visitor, VisitorEditHistory, VisitorSearchToken,
};
use crate::repos::audit::AuditEntry;
use crate::repos::privacy::NewArcoRequest;
use crate::repos::users::NewUser;
use crate::repos::visitors::{NewEditHistory, NewVisitor};
use crate::repos::visits::{NewVisit, Transition};
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
    /// Intervalos de salida temporal de una visita, por salida.
    async fn visit_logs(&self, visit_id: i64) -> StoreResult<Vec<IntermittentLog>>;
    /// Ejecuta una transición: comprueba el estado esperado, muta,
    /// escribe la auditoría y devuelve la visita actualizada, todo en
    /// una transacción. Un estado inesperado (o una salida ya cerrada)
    /// es `INVALID_VISIT_STATE` (409), como en Go.
    async fn transition(
        &self,
        id: i64,
        operation: Transition,
        actor: &Actor,
        notes: Option<&str>,
        reason: Option<&str>,
        now: &str,
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
    /// `OPEN_VISIT_EXISTS`.
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
