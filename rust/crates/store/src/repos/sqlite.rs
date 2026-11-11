//! Implementaciones SQLite de los traits de repositorio.
//!
//! Cada struct guarda un `Store` clonado y delega en las funciones
//! libres de su módulo (`users`, `visitors`, ...), que son la
//! implementación SQLite desde la fase 2: mismo SQL, misma semántica,
//! mismos códigos de error, mismos conteos en `convert`/`preflight`.
//! La única diferencia es el envoltorio: las lecturas van por
//! `Store::read_store` y las escrituras por `Store::tx_store`, que
//! conservan el `StoreError` de dominio sin pasarlo por anyhow.
//!
//! Las llamadas rusqlite se ejecutan en línea dentro del método
//! async (ver la decisión documentada en `traits.rs`): son locales,
//! de un solo escritor y sub-milisegundo, igual que ya hacía la
//! fase 3 desde el middleware async.

use async_trait::async_trait;

use crate::error::{is_unique_violation, StoreError, StoreResult};
use crate::models::{
    ActivityLog, ArcoRequest, Department, IdentityIndexState, IntermittentLog, ReportRow,
    SearchIndexState, User, Visit, VisitPurpose, Visitor, VisitorEditHistory, VisitorSearchToken,
};
use crate::repos::audit::{self, AuditEntry, AuditFilter};
use crate::repos::catalogs;
use crate::repos::privacy::{self, ArcoFilter, CancelAudit, NewArcoRequest};
use crate::repos::search;
use crate::repos::traits::{
    ArcoRepository, AuditRepository, CatalogRepository, CheckinInput, CheckinOutcome, ProfileEdit,
    SearchTokenRepository, UnitOfWork, UserRepository, VisitRepository, VisitorRepository,
};
use crate::repos::users::{self, NewUser};
use crate::repos::visitors::{self, NewEditHistory, NewVisitor, VisitorFilter};
use crate::repos::visits::{self, NewVisit, Transition, TransitionCall, VisitFilter};
use crate::repos::Actor;
use crate::Store;

/// Repositorio de usuarios sobre SQLite.
#[derive(Clone)]
pub struct SqliteUserRepository {
    store: Store,
}

impl SqliteUserRepository {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl UserRepository for SqliteUserRepository {
    async fn find_by_username(&self, username: &str) -> StoreResult<User> {
        self.store
            .read_store(|conn| users::find_by_username(conn, username))
    }

    async fn find_by_id(&self, id: i64) -> StoreResult<User> {
        self.store.read_store(|conn| users::find_by_id(conn, id))
    }

    async fn list_all(&self) -> StoreResult<Vec<User>> {
        self.store.read_store(users::list_all)
    }

    async fn insert(&self, user: &NewUser<'_>) -> StoreResult<i64> {
        self.store.tx_store(|tx| users::insert(tx, user))
    }

    async fn login_succeeded(&self, id: i64, now: &str) -> StoreResult<()> {
        self.store
            .tx_store(|tx| users::login_succeeded(tx, id, now))
    }

    async fn login_failed(
        &self,
        id: i64,
        attempts: i64,
        locked_until: Option<&str>,
        now: &str,
    ) -> StoreResult<()> {
        self.store
            .tx_store(|tx| users::login_failed(tx, id, attempts, locked_until, now))
    }

    async fn save_reset_token(
        &self,
        id: i64,
        token: &str,
        expiry: &str,
        email: &str,
        token_version: i64,
        now: &str,
    ) -> StoreResult<u64> {
        self.store.tx_store(|tx| {
            users::save_reset_token(tx, id, token, expiry, email, token_version, now)
        })
    }

    async fn consume_reset_token(
        &self,
        token: &str,
        new_password_hash: &str,
        now: &str,
    ) -> StoreResult<User> {
        self.store
            .tx_store(|tx| users::consume_reset_token(tx, token, new_password_hash, now))
    }

    async fn change_password(
        &self,
        id: i64,
        new_password_hash: &str,
        must_change_password: bool,
        token_version: i64,
        now: &str,
    ) -> StoreResult<u64> {
        self.store.tx_store(|tx| {
            users::change_password(
                tx,
                id,
                new_password_hash,
                must_change_password,
                token_version,
                now,
            )
        })
    }

    async fn revoke_session(&self, id: i64, token_version: i64, now: &str) -> StoreResult<u64> {
        self.store
            .tx_store(|tx| users::revoke_session(tx, id, token_version, now))
    }

    async fn clear_reset_token(&self, id: i64, token: &str) -> StoreResult<()> {
        self.store
            .tx_store(|tx| users::clear_reset_token(tx, id, token))
    }

    async fn update_user(
        &self,
        id: i64,
        username: &str,
        email: Option<Option<&str>>,
        role: &str,
        now: &str,
    ) -> StoreResult<u64> {
        self.store
            .tx_store(|tx| users::update_user(tx, id, username, email, role, now))
    }

    async fn delete_user(&self, id: i64) -> StoreResult<u64> {
        self.store.tx_store(|tx| users::delete_user(tx, id))
    }
}

/// Repositorio de visitantes sobre SQLite.
#[derive(Clone)]
pub struct SqliteVisitorRepository {
    store: Store,
}

impl SqliteVisitorRepository {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl VisitorRepository for SqliteVisitorRepository {
    async fn find_by_cedula(&self, cedula_hash: &str) -> StoreResult<Visitor> {
        self.store
            .read_store(|conn| visitors::find_by_cedula(conn, cedula_hash))
    }

    async fn find_by_id(&self, id: i64) -> StoreResult<Visitor> {
        self.store.read_store(|conn| visitors::find_by_id(conn, id))
    }

    async fn insert(&self, visitor: &NewVisitor<'_>) -> StoreResult<i64> {
        self.store.tx_store(|tx| visitors::insert(tx, visitor))
    }

    async fn update(&self, visitor: &Visitor, now: &str) -> StoreResult<()> {
        self.store.tx_store(|tx| visitors::update(tx, visitor, now))
    }

    async fn set_blocked(&self, id: i64, blocked: bool, now: &str) -> StoreResult<()> {
        self.store
            .tx_store(|tx| visitors::set_blocked(tx, id, blocked, now))
    }

    async fn update_photos(
        &self,
        id: i64,
        photo_data: Option<&[u8]>,
        id_photo_data: Option<&[u8]>,
        now: &str,
    ) -> StoreResult<()> {
        self.store
            .tx_store(|tx| visitors::update_photos(tx, id, photo_data, id_photo_data, now))
    }

    async fn list_companies(&self) -> StoreResult<Vec<String>> {
        self.store.read_store(visitors::list_companies)
    }

    async fn list_companies_filtered(&self, query: &str) -> StoreResult<Vec<String>> {
        self.store
            .read_store(|conn| visitors::list_companies_filtered(conn, query))
    }

    async fn list_filtered(&self, filter: &VisitorFilter) -> StoreResult<Vec<Visitor>> {
        self.store
            .read_store(|conn| visitors::list_filtered(conn, filter))
    }

    async fn count_filtered(&self, filter: &VisitorFilter) -> StoreResult<i64> {
        self.store
            .read_store(|conn| visitors::count_filtered(conn, filter))
    }

    async fn insert_edit_history(&self, change: &NewEditHistory<'_>) -> StoreResult<i64> {
        self.store
            .tx_store(|tx| visitors::insert_edit_history(tx, change))
    }

    async fn list_edit_history_by_visitor(
        &self,
        visitor_id: i64,
    ) -> StoreResult<Vec<VisitorEditHistory>> {
        self.store
            .read_store(|conn| visitors::list_edit_history_by_visitor(conn, visitor_id))
    }

    async fn list_edit_history_by_visit(
        &self,
        visit_id: i64,
    ) -> StoreResult<Vec<VisitorEditHistory>> {
        self.store
            .read_store(|conn| visitors::list_edit_history_by_visit(conn, visit_id))
    }
}

/// Repositorio de visitas sobre SQLite.
#[derive(Clone)]
pub struct SqliteVisitRepository {
    store: Store,
}

impl SqliteVisitRepository {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl VisitRepository for SqliteVisitRepository {
    async fn find_by_id(&self, id: i64) -> StoreResult<Visit> {
        self.store.read_store(|conn| visits::find_by_id(conn, id))
    }

    async fn insert_checkin(&self, visit: &NewVisit<'_>) -> StoreResult<i64> {
        self.store.tx_store(|tx| visits::insert_checkin(tx, visit))
    }

    async fn list_by_status(
        &self,
        status: &str,
        limit: i64,
        offset: i64,
    ) -> StoreResult<Vec<Visit>> {
        self.store
            .read_store(|conn| visits::list_by_status(conn, status, limit, offset))
    }

    async fn list_filtered(&self, filter: &VisitFilter) -> StoreResult<(Vec<Visit>, i64)> {
        self.store.read_store(|conn| {
            let visits = visits::list_filtered(conn, filter)?;
            let total = visits::count_filtered(conn, filter)?;
            Ok((visits, total))
        })
    }

    async fn calendar_counts(
        &self,
        start: &str,
        end: &str,
        status: &str,
    ) -> StoreResult<Vec<(String, i64)>> {
        self.store
            .read_store(|conn| visits::calendar_counts(conn, start, end, status))
    }

    async fn report_rows(&self, start: &str, end: &str) -> StoreResult<Vec<ReportRow>> {
        self.store
            .read_store(|conn| visits::report_rows(conn, start, end))
    }

    async fn count_active(&self) -> StoreResult<i64> {
        self.store.read_store(visits::count_active)
    }

    async fn count_distinct_visitors(&self, start: &str, end: &str) -> StoreResult<i64> {
        self.store
            .read_store(|conn| visits::count_distinct_visitors(conn, start, end))
    }

    async fn list_long_active(&self, before: &str) -> StoreResult<Vec<Visit>> {
        self.store
            .read_store(|conn| visits::list_long_active(conn, before))
    }

    async fn history_by_visitor(
        &self,
        visitor_id: i64,
        cedula_hash: &str,
        limit: i64,
    ) -> StoreResult<Vec<Visit>> {
        self.store
            .read_store(|conn| visits::history_by_visitor(conn, visitor_id, cedula_hash, limit))
    }

    async fn list_by_visitor_for_access(
        &self,
        visitor_id: i64,
        cedula_hash: &str,
        limit: i64,
    ) -> StoreResult<Vec<Visit>> {
        self.store.read_store(|conn| {
            visits::list_by_visitor_for_access(conn, visitor_id, cedula_hash, limit)
        })
    }

    async fn visit_logs(&self, visit_id: i64) -> StoreResult<Vec<IntermittentLog>> {
        self.store
            .read_store(|conn| visits::visit_logs(conn, visit_id))
    }

    async fn transition(
        &self,
        id: i64,
        operation: Transition,
        call: &TransitionCall<'_>,
    ) -> StoreResult<Visit> {
        self.store
            .tx_store(|tx| visits::transition(tx, id, operation, call))
    }
}

/// Repositorio de auditoría sobre SQLite.
#[derive(Clone)]
pub struct SqliteAuditRepository {
    store: Store,
}

impl SqliteAuditRepository {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl AuditRepository for SqliteAuditRepository {
    async fn write(&self, entry: &AuditEntry<'_>) -> StoreResult<i64> {
        self.store.tx_store(|tx| audit::write(tx, entry))
    }

    async fn list_recent(&self, limit: i64) -> StoreResult<Vec<ActivityLog>> {
        self.store
            .read_store(|conn| audit::list_recent(conn, limit))
    }

    async fn count(&self) -> StoreResult<i64> {
        self.store.read_store(audit::count)
    }

    async fn list_filtered(
        &self,
        filter: &AuditFilter<'_>,
        limit: i64,
        offset: i64,
    ) -> StoreResult<Vec<ActivityLog>> {
        self.store
            .read_store(|conn| audit::list_filtered(conn, filter, limit, offset))
    }

    async fn count_filtered(&self, filter: &AuditFilter<'_>) -> StoreResult<i64> {
        self.store
            .read_store(|conn| audit::count_filtered(conn, filter))
    }

    async fn today_counts(&self, start: &str, end: &str) -> StoreResult<(i64, i64, i64, i64)> {
        self.store
            .read_store(|conn| audit::today_counts(conn, start, end))
    }

    async fn group_counts(&self, since: &str, group: &str) -> StoreResult<Vec<(String, i64)>> {
        self.store
            .read_store(|conn| audit::group_counts(conn, since, group))
    }

    async fn distinct(&self, column: &str) -> StoreResult<Vec<String>> {
        self.store.read_store(|conn| audit::distinct(conn, column))
    }
}

/// Repositorio ARCO sobre SQLite.
#[derive(Clone)]
pub struct SqliteArcoRepository {
    store: Store,
}

impl SqliteArcoRepository {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl ArcoRepository for SqliteArcoRepository {
    async fn insert_request(&self, request: &NewArcoRequest<'_>) -> StoreResult<i64> {
        self.store
            .tx_store(|tx| privacy::insert_request(tx, request))
    }

    async fn find_request_by_id(&self, id: i64) -> StoreResult<ArcoRequest> {
        self.store
            .read_store(|conn| privacy::find_request_by_id(conn, id))
    }

    async fn list_requests(&self, limit: i64, offset: i64) -> StoreResult<Vec<ArcoRequest>> {
        self.store
            .read_store(|conn| privacy::list_requests(conn, limit, offset))
    }

    async fn list_filtered(&self, filter: &ArcoFilter) -> StoreResult<(Vec<ArcoRequest>, i64)> {
        self.store.read_store(|conn| {
            let requests = privacy::list_requests_filtered(conn, filter)?;
            let total = privacy::count_requests_filtered(conn, filter)?;
            Ok((requests, total))
        })
    }

    async fn update_request_status(
        &self,
        id: i64,
        status: &str,
        resolution_notes: Option<&str>,
        resolved_at: Option<&str>,
        now: &str,
    ) -> StoreResult<u64> {
        self.store.tx_store(|tx| {
            privacy::update_request_status(tx, id, status, resolution_notes, resolved_at, now)
        })
    }

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
    ) -> StoreResult<()> {
        self.store.tx_store(|tx| {
            privacy::cancel_subject(
                tx,
                visitor_id,
                cedula_plain,
                cedula_hash,
                reference,
                actor,
                verification_method,
                now,
                audit_meta,
            )
        })
    }
}

/// Repositorio de catálogos sobre SQLite.
#[derive(Clone)]
pub struct SqliteCatalogRepository {
    store: Store,
}

impl SqliteCatalogRepository {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl CatalogRepository for SqliteCatalogRepository {
    async fn list_departments(&self) -> StoreResult<Vec<Department>> {
        self.store.read_store(catalogs::list_departments)
    }

    async fn insert_department(
        &self,
        name: &str,
        code: Option<&str>,
        now: &str,
    ) -> StoreResult<i64> {
        self.store
            .tx_store(|tx| catalogs::insert_department(tx, name, code, now))
    }

    async fn set_department_active(&self, id: i64, active: bool) -> StoreResult<()> {
        self.store
            .tx_store(|tx| catalogs::set_department_active(tx, id, active))
    }

    async fn list_purposes(&self) -> StoreResult<Vec<VisitPurpose>> {
        self.store.read_store(catalogs::list_purposes)
    }

    async fn insert_purpose(&self, name: &str, now: &str) -> StoreResult<i64> {
        self.store
            .tx_store(|tx| catalogs::insert_purpose(tx, name, now))
    }

    async fn set_purpose_active(&self, id: i64, active: bool) -> StoreResult<()> {
        self.store
            .tx_store(|tx| catalogs::set_purpose_active(tx, id, active))
    }
}

/// Repositorio de búsqueda sobre SQLite.
#[derive(Clone)]
pub struct SqliteSearchTokenRepository {
    store: Store,
}

impl SqliteSearchTokenRepository {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl SearchTokenRepository for SqliteSearchTokenRepository {
    async fn replace_tokens(&self, visitor_id: i64, tokens: &[Vec<u8>]) -> StoreResult<()> {
        self.store
            .tx_store(|tx| search::replace_tokens(tx, visitor_id, tokens))
    }

    async fn delete_tokens(&self, visitor_id: i64) -> StoreResult<()> {
        self.store
            .tx_store(|tx| search::delete_tokens(tx, visitor_id))
    }

    async fn tokens_for_visitor(&self, visitor_id: i64) -> StoreResult<Vec<VisitorSearchToken>> {
        self.store
            .read_store(|conn| search::tokens_for_visitor(conn, visitor_id))
    }

    async fn find_visitors_by_token(&self, token: &[u8]) -> StoreResult<Vec<i64>> {
        self.store
            .read_store(|conn| search::find_visitors_by_token(conn, token))
    }

    async fn get_search_state(&self) -> StoreResult<SearchIndexState> {
        self.store.read_store(search::get_search_state)
    }

    async fn set_search_state(
        &self,
        fingerprint: &str,
        cursor: i64,
        ready: bool,
    ) -> StoreResult<()> {
        self.store
            .tx_store(|tx| search::set_search_state(tx, fingerprint, cursor, ready))
    }

    async fn get_identity_state(&self) -> StoreResult<IdentityIndexState> {
        self.store.read_store(search::get_identity_state)
    }

    async fn set_identity_state(&self, fingerprint: &str, ready: bool) -> StoreResult<()> {
        self.store
            .tx_store(|tx| search::set_identity_state(tx, fingerprint, ready))
    }
}

/// Operaciones compuestas sobre SQLite: cada método compone las
/// funciones libres dentro de una sola `tx_immediate`, así que el
/// perfil, la visita, los tokens y la auditoría se confirman o se
/// revierten juntos, como en Go.
#[derive(Clone)]
pub struct SqliteUnitOfWork {
    store: Store,
}

impl SqliteUnitOfWork {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl UnitOfWork for SqliteUnitOfWork {
    async fn login_success(&self, id: i64, now: &str, audit: &AuditEntry<'_>) -> StoreResult<()> {
        self.store.tx_store(|tx| {
            users::login_succeeded(tx, id, now)?;
            audit::write(tx, audit)?;
            Ok(())
        })
    }

    async fn logout(
        &self,
        id: i64,
        token_version: i64,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<u64> {
        self.store.tx_store(|tx| {
            let rows = users::revoke_session(tx, id, token_version, now)?;
            if rows == 1 {
                audit::write(tx, audit)?;
            }
            Ok(rows)
        })
    }

    async fn change_password(
        &self,
        id: i64,
        hash: &str,
        must_change: bool,
        token_version: i64,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<u64> {
        self.store.tx_store(|tx| {
            let rows = users::change_password(tx, id, hash, must_change, token_version, now)?;
            if rows == 1 {
                audit::write(tx, audit)?;
            }
            Ok(rows)
        })
    }

    async fn consume_reset(
        &self,
        token: &str,
        hash: &str,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<User> {
        self.store.tx_store(|tx| {
            let user = users::consume_reset_token(tx, token, hash, now)?;
            audit::write(tx, audit)?;
            Ok(user)
        })
    }

    async fn checkin(&self, input: &CheckinInput<'_>) -> StoreResult<CheckinOutcome> {
        self.store.tx_store(|tx| {
            let visitor_id = match input.new_visitor {
                Some(visitor) => visitors::insert(tx, visitor)?,
                None => visitors::find_by_cedula(tx, input.cedula_hash)?.id,
            };
            search::replace_tokens(tx, visitor_id, input.search_tokens)?;
            let visit = NewVisit {
                visitor_id,
                ..*input.visit
            };
            let visit_id = visits::insert_checkin(tx, &visit)?;
            audit::write(tx, input.audit)?;
            Ok(CheckinOutcome {
                visitor_id,
                visit_id,
            })
        })
    }

    async fn apply_profile_edit(&self, edit: &ProfileEdit<'_>) -> StoreResult<Visitor> {
        self.store.tx_store(|tx| {
            visitors::update(tx, edit.visitor, edit.now)?;
            for change in edit.history {
                visitors::insert_edit_history(tx, change)?;
            }
            search::replace_tokens(tx, edit.visitor.id, edit.search_tokens)?;
            audit::write(tx, edit.audit)?;
            visitors::find_by_id(tx, edit.visitor.id)
        })
    }

    async fn create_arco(
        &self,
        request: &NewArcoRequest<'_>,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<i64> {
        self.store.tx_store(|tx| {
            let id = privacy::insert_request(tx, request)?;
            audit::write(tx, audit)?;
            Ok(id)
        })
    }

    async fn update_arco_status(
        &self,
        id: i64,
        status: &str,
        notes: Option<&str>,
        resolved_at: Option<&str>,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<ArcoRequest> {
        self.store.tx_store(|tx| {
            let rows = privacy::update_request_status(tx, id, status, notes, resolved_at, now)?;
            if rows == 0 {
                return Err(StoreError::not_found(
                    "NOT_FOUND",
                    format!("solicitud {id} no encontrada"),
                ));
            }
            audit::write(tx, audit)?;
            privacy::find_request_by_id(tx, id)
        })
    }

    async fn subject_access(
        &self,
        cedula_hash: &str,
        limit: i64,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<(Visitor, Vec<Visit>)> {
        self.store.tx_store(|tx| {
            let visitor = visitors::find_by_cedula(tx, cedula_hash)?;
            let visits = visits::list_by_visitor_for_access(tx, visitor.id, cedula_hash, limit)?;
            audit::write(tx, audit)?;
            Ok((visitor, visits))
        })
    }

    async fn create_user(&self, user: &NewUser<'_>, audit: &AuditEntry<'_>) -> StoreResult<i64> {
        self.store.tx_store(|tx| {
            let result = users::insert(tx, user);
            let id = match result {
                Ok(id) => id,
                Err(StoreError::Db(ref e)) if is_unique_violation(e) => {
                    return Err(StoreError::conflict(
                        "USERNAME_EXISTS",
                        format!("el nombre de usuario {} ya existe", user.username),
                    ));
                }
                Err(e) => return Err(e),
            };
            audit::write(tx, audit)?;
            Ok(id)
        })
    }

    async fn update_user(
        &self,
        id: i64,
        username: &str,
        email: Option<Option<&str>>,
        role: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<User> {
        self.store.tx_store(|tx| {
            users::find_by_id(tx, id)?;
            let result = users::update_user(tx, id, username, email, role, audit.created_at);
            let rows = match result {
                Ok(rows) => rows,
                Err(StoreError::Db(ref e)) if is_unique_violation(e) => {
                    return Err(StoreError::conflict(
                        "USERNAME_EXISTS",
                        format!("el nombre de usuario {username} ya existe"),
                    ));
                }
                Err(e) => return Err(e),
            };
            if rows == 0 {
                return Err(StoreError::not_found(
                    "USER_NOT_FOUND",
                    format!("usuario {id} no existe"),
                ));
            }
            audit::write(tx, audit)?;
            users::find_by_id(tx, id)
        })
    }

    async fn delete_user(&self, id: i64, audit: &AuditEntry<'_>) -> StoreResult<()> {
        self.store.tx_store(|tx| {
            users::find_by_id(tx, id)?;
            let rows = users::delete_user(tx, id)?;
            if rows == 0 {
                return Err(StoreError::not_found(
                    "USER_NOT_FOUND",
                    format!("usuario {id} no existe"),
                ));
            }
            audit::write(tx, audit)?;
            Ok(())
        })
    }
}
