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

use crate::error::StoreResult;
use crate::models::{
    ActivityLog, ArcoRequest, Department, IdentityIndexState, IntermittentLog, SearchIndexState,
    User, Visit, VisitPurpose, Visitor, VisitorEditHistory, VisitorSearchToken,
};
use crate::repos::audit::{self, AuditEntry};
use crate::repos::catalogs;
use crate::repos::privacy::{self, NewArcoRequest};
use crate::repos::search;
use crate::repos::traits::{
    ArcoRepository, AuditRepository, CatalogRepository, SearchTokenRepository, UserRepository,
    VisitRepository, VisitorRepository,
};
use crate::repos::users::{self, NewUser};
use crate::repos::visitors::{self, NewEditHistory, NewVisitor};
use crate::repos::visits::{self, NewVisit, Transition};
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

    async fn visit_logs(&self, visit_id: i64) -> StoreResult<Vec<IntermittentLog>> {
        self.store
            .read_store(|conn| visits::visit_logs(conn, visit_id))
    }

    async fn transition(
        &self,
        id: i64,
        operation: Transition,
        actor: &Actor,
        notes: Option<&str>,
        reason: Option<&str>,
        now: &str,
    ) -> StoreResult<Visit> {
        self.store
            .tx_store(|tx| visits::transition(tx, id, operation, actor, notes, reason, now))
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
