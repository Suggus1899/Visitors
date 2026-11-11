// API de la fase 3 para los handlers de la fase 4 (rutas /auth/* y de
// dominio): hasta que lleguen, el binario no consume estas piezas y
// rustc las marcaria como muertas. Se retira este allow al cablear
// cada pieza en la fase 4.
#![allow(dead_code)]

//! Sesion JWT HS256, revocacion y recuperacion.
//!
//! Traduccion de `server-go/internal/httpapi/auth.go` (`Session`,
//! `tokens`, `validateToken`, `logout`, `forgotPassword`,
//! `resetPassword`) y de `client/src/app/auth/renew/safe-return-to.ts`.
//!
//! Reglas que se copian sin tocar:
//!
//! - Acceso de 15 minutos y renovacion de 7 dias (configurables por
//!   `JWT_ACCESS_EXPIRATION` / `JWT_REFRESH_EXPIRATION`), con secretos
//!   HS256 independientes y maximo absoluto de 7 dias desde el inicio
//!   de la sesion (`sessionStartedAt` + 7 dias). La expiracion del
//!   token emitido nunca supera el maximo absoluto.
//! - Los claims son los de Go: `id`, `username`, `role`,
//!   `tokenVersion`, `sessionStartedAt`, `absoluteExpiresAt`, `iat`,
//!   `exp`. `mustChangePassword` NO viaja en el token (Go lo marca
//!   `json:"-"`): se lee de la base en cada validacion, junto con el
//!   rol y el nombre de usuario.
//! - Validacion en cada peticion: firma HS256, expiracion, `id > 0`,
//!   maximo absoluto, y `tokenVersion` contra la base. Un token de
//!   renovacion de formato historico (sin `sessionStartedAt` ni
//!   `absoluteExpiresAt`) se rechaza: exige un login nuevo.
//! - Revocacion al cambiar la contrasena, al cerrar sesion y tras una
//!   restauracion: todas suben `tokenVersion`, asi que los tokens
//!   viejos dejan de validar.
//! - Cambio obligatorio: con `mustChangePassword`, solo se permiten
//!   `/api/v1/auth/change-password` y `/api/v1/auth/session`.
//! - Recuperacion: token aleatorio de 32 bytes (64 hex), guardado solo
//!   como su hash SHA-256, 15 minutos, un solo uso y respuesta generica
//!   (no revela si la cuenta existe ni si tiene correo). El envio del
//!   correo es de la fase 6 (lettre); aqui el servicio devuelve el
//!   token en claro al llamador para que lo envie.
//!
//! Las rutas HTTP (`/auth/login`, `/auth/refresh`, ...) llegan en la
//! fase 4; aqui queda el servicio listo para usarlas.

use axum::response::IntoResponse;
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use logmaster_crypto::{hash_password, hash_token, random_token, verify_password};
use logmaster_store::error::StoreError;
use logmaster_store::models::User;
use logmaster_store::repos::users as user_repos;
use logmaster_store::Store;
use serde::{Deserialize, Serialize};
use std::time::Duration as StdDuration;

use crate::config::Config;

/// Maximo absoluto de sesion desde su inicio, como Go
/// (`absoluteSessionTTL = 7 * 24h`).
pub const ABSOLUTE_SESSION_TTL: StdDuration = StdDuration::from_secs(7 * 24 * 3600);

/// Duracion del token de recuperacion, como Go (15 minutos).
pub const RESET_TOKEN_TTL: StdDuration = StdDuration::from_secs(15 * 60);

/// Error de sesion, con el codigo de aplicacion de Go.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionError {
    /// Firma, formato o expiracion invalidos (401 UNAUTHORIZED).
    Invalid,
    /// La `tokenVersion` ya no coincide con la base (401 UNAUTHORIZED).
    Revoked,
    /// El maximo absoluto de 7 dias vencio (401 UNAUTHORIZED).
    AbsoluteExpired,
    /// Token de renovacion historico sin inicio ni maximo absoluto.
    LegacyRefresh,
    /// La sesion cambio entre la lectura y la escritura (409).
    Changed,
    /// El token de recuperacion es invalido o vencio (400 INVALID_TOKEN).
    InvalidResetToken,
    /// Error interno (500).
    Internal(String),
}

impl SessionError {
    /// `(estado HTTP, codigo, mensaje)` del sobre de error, como Go.
    pub fn response(&self) -> (axum::http::StatusCode, &'static str, &'static str) {
        use axum::http::StatusCode;
        match self {
            SessionError::Invalid | SessionError::Revoked | SessionError::AbsoluteExpired => (
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "Sesión inválida o revocada",
            ),
            SessionError::LegacyRefresh => (
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "Sesión inválida o revocada",
            ),
            SessionError::Changed => (
                StatusCode::CONFLICT,
                "SESSION_CHANGED",
                "La sesión cambió durante la operación",
            ),
            SessionError::InvalidResetToken => (
                StatusCode::BAD_REQUEST,
                "INVALID_TOKEN",
                "Token inválido o vencido",
            ),
            SessionError::Internal(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "SERVER_ERROR",
                "No se pudo completar la operación",
            ),
        }
    }
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionError::Internal(message) => write!(f, "sesion: {message}"),
            other => write!(f, "sesion: {other:?}"),
        }
    }
}

impl std::error::Error for SessionError {}

/// Claims del JWT, con los mismos nombres JSON que Go.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionClaims {
    pub id: i64,
    pub username: String,
    pub role: String,
    #[serde(rename = "tokenVersion")]
    pub token_version: i64,
    #[serde(rename = "sessionStartedAt", skip_serializing_if = "Option::is_none")]
    pub session_started_at: Option<DateTime<Utc>>,
    #[serde(rename = "absoluteExpiresAt", skip_serializing_if = "Option::is_none")]
    pub absolute_expires_at: Option<DateTime<Utc>>,
    pub exp: u64,
    pub iat: u64,
}

/// Sesion ya validada contra la base.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub token_version: i64,
    pub must_change: bool,
    pub session_started_at: Option<DateTime<Utc>>,
    pub absolute_expires_at: Option<DateTime<Utc>>,
}

impl Session {
    /// Sesion a partir de una fila de usuario, con los valores por
    /// defecto de Go (`COALESCE(role, 'operador')`,
    /// `COALESCE(mustChangePassword, true)`).
    pub fn from_user(user: &User) -> Self {
        Self {
            id: user.id,
            username: user.username.clone(),
            role: user.role.clone().unwrap_or_else(|| "operador".to_string()),
            token_version: user.token_version,
            must_change: user.must_change_password.unwrap_or(true),
            session_started_at: None,
            absolute_expires_at: None,
        }
    }

    /// `true` si esta peticion esta permitida con cambio obligatorio
    /// pendiente: solo cambio de contrasena y consulta de sesion.
    /// Acepta la ruta completa (`/api/v1/auth/session`) y la forma
    /// recortada (`/auth/session`) que ven las capas dentro de un
    /// router anidado de Axum.
    pub fn path_allowed_while_must_change(path: &str) -> bool {
        let path = path.strip_prefix("/api/v1").unwrap_or(path);
        path == "/auth/change-password" || path == "/auth/session"
    }
}

/// Usuario publico que viaja en la respuesta de login/refresh, como Go.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionUser {
    pub id: i64,
    pub username: String,
    pub role: String,
    #[serde(rename = "mustChangePassword")]
    pub must_change_password: bool,
}

impl From<&Session> for SessionUser {
    fn from(session: &Session) -> Self {
        Self {
            id: session.id,
            username: session.username.clone(),
            role: session.role.clone(),
            must_change_password: session.must_change,
        }
    }
}

/// Par de tokens emitido, como el mapa de Go: `token`, `accessToken`,
/// `refreshToken` y `user`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tokens {
    #[serde(rename = "token")]
    pub access_token: String,
    #[serde(rename = "accessToken")]
    pub access_token_dup: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    pub user: SessionUser,
}

/// Servicio de sesion: emite y valida JWT contra la base.
#[derive(Clone)]
pub struct SessionService {
    jwt_secret: String,
    refresh_secret: String,
    access_ttl: StdDuration,
    refresh_ttl: StdDuration,
    absolute_ttl: StdDuration,
    edit_password: String,
    store: Store,
}

impl SessionService {
    pub fn new(config: &Config, store: Store) -> Self {
        Self {
            jwt_secret: config.jwt_secret.clone(),
            refresh_secret: config.refresh_secret.clone(),
            access_ttl: config.access_ttl,
            refresh_ttl: config.refresh_ttl,
            absolute_ttl: config.absolute_session_ttl,
            edit_password: config.edit_password.clone(),
            store,
        }
    }

    /// Valida la contrasena de edicion configurada (`EDIT_PASSWORD`).
    pub fn valid_edit_password(&self, value: &str) -> bool {
        valid_edit_password(&self.edit_password, value)
    }

    /// Emite el par de tokens para una sesion nueva (login): el inicio
    /// es ahora y el maximo absoluto, ahora + 7 dias.
    pub fn issue(&self, session: &Session) -> Result<Tokens, SessionError> {
        self.issue_at(session, Utc::now())
    }

    /// Emite el par de tokens con un `ahora` dado (para pruebas).
    pub fn issue_at(&self, session: &Session, now: DateTime<Utc>) -> Result<Tokens, SessionError> {
        let started = session.session_started_at.unwrap_or(now);
        let absolute = session
            .absolute_expires_at
            .unwrap_or(started + ChronoDuration::from_std(self.absolute_ttl).unwrap());
        if now >= absolute || absolute < started {
            return Err(SessionError::AbsoluteExpired);
        }
        let access_expiry = std::cmp::min(
            now + ChronoDuration::from_std(self.access_ttl).unwrap(),
            absolute,
        );
        let refresh_expiry = std::cmp::min(
            now + ChronoDuration::from_std(self.refresh_ttl).unwrap(),
            absolute,
        );
        let claims = SessionClaims {
            id: session.id,
            username: session.username.clone(),
            role: session.role.clone(),
            token_version: session.token_version,
            session_started_at: Some(started),
            absolute_expires_at: Some(absolute),
            exp: access_expiry.timestamp() as u64,
            iat: now.timestamp() as u64,
        };
        let access = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .map_err(|e| SessionError::Internal(e.to_string()))?;
        let refresh_claims = SessionClaims {
            exp: refresh_expiry.timestamp() as u64,
            ..claims
        };
        let refresh = encode(
            &Header::new(Algorithm::HS256),
            &refresh_claims,
            &EncodingKey::from_secret(self.refresh_secret.as_bytes()),
        )
        .map_err(|e| SessionError::Internal(e.to_string()))?;
        Ok(Tokens {
            access_token: access.clone(),
            access_token_dup: access,
            refresh_token: refresh,
            user: SessionUser::from(session),
        })
    }

    /// Valida un token de acceso o de renovacion contra la base.
    pub fn validate(&self, token: &str, refresh: bool) -> Result<Session, SessionError> {
        self.validate_at(token, refresh, Utc::now())
    }

    /// Valida con un `ahora` dado (para pruebas).
    pub fn validate_at(
        &self,
        token: &str,
        refresh: bool,
        now: DateTime<Utc>,
    ) -> Result<Session, SessionError> {
        let secret = if refresh {
            &self.refresh_secret
        } else {
            &self.jwt_secret
        };
        let mut validation = Validation::new(Algorithm::HS256);
        validation.required_spec_claims.insert("exp".to_string());
        // Go (jwt v5) no admite margen de expiracion: leeway 0.
        validation.leeway = 0;
        let data = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &validation,
        )
        .map_err(|_| SessionError::Invalid)?;
        let claims = data.claims;
        if claims.id <= 0 {
            return Err(SessionError::Invalid);
        }
        if refresh && (claims.session_started_at.is_none() || claims.absolute_expires_at.is_none())
        {
            return Err(SessionError::LegacyRefresh);
        }
        if let Some(absolute) = claims.absolute_expires_at {
            if now >= absolute {
                return Err(SessionError::AbsoluteExpired);
            }
        }
        let user = self
            .store
            .read(|conn| user_repos::find_by_id(conn, claims.id).map_err(anyhow::Error::from))
            .map_err(|_| SessionError::Revoked)?;
        if user.token_version != claims.token_version {
            return Err(SessionError::Revoked);
        }
        let mut session = Session::from_user(&user);
        session.session_started_at = claims.session_started_at;
        session.absolute_expires_at = claims.absolute_expires_at;
        Ok(session)
    }

    /// Renueva una sesion a partir de su token de renovacion: valida y
    /// vuelve a emitir, conservando inicio y maximo absoluto.
    pub fn refresh(&self, refresh_token: &str) -> Result<Tokens, SessionError> {
        self.refresh_at(refresh_token, Utc::now())
    }

    /// Renueva con un `ahora` dado (para pruebas).
    pub fn refresh_at(
        &self,
        refresh_token: &str,
        now: DateTime<Utc>,
    ) -> Result<Tokens, SessionError> {
        let session = self.validate_at(refresh_token, true, now)?;
        self.issue_at(&session, now)
    }

    /// Revoca la sesion subiendo `tokenVersion` (logout). Devuelve
    /// `Changed` si la version cambio entre tanto, como Go (409).
    pub fn revoke(&self, session: &Session) -> Result<(), SessionError> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string();
        let rows = self
            .store
            .tx_immediate(|tx| {
                user_repos::revoke_session(tx, session.id, session.token_version, &now)
                    .map_err(|e| anyhow::anyhow!(e.to_string()))
            })
            .map_err(|e| SessionError::Internal(e.to_string()))?;
        if rows != 1 {
            return Err(SessionError::Changed);
        }
        Ok(())
    }

    /// Inicia la recuperacion: si la cuenta existe y tiene correo,
    /// guarda el hash del token con 15 minutos y devuelve el token en
    /// claro y el correo para enviarlo. Si no existe o no tiene
    /// correo, devuelve `None`: la respuesta al cliente es generica
    /// en ambos casos.
    pub fn request_recovery(
        &self,
        username: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<(String, String)>, SessionError> {
        let user = match self
            .store
            .read(|conn| user_repos::find_by_username(conn, username).map_err(anyhow::Error::from))
        {
            Ok(user) => user,
            Err(_) => return Ok(None),
        };
        let email = match user.email.clone() {
            Some(email) if !email.is_empty() => email,
            _ => return Ok(None),
        };
        let token = random_token().map_err(|e| SessionError::Internal(e.0.to_string()))?;
        let hashed = hash_token(&token);
        let expiry = (now + ChronoDuration::from_std(RESET_TOKEN_TTL).unwrap())
            .format("%Y-%m-%dT%H:%M:%S%.6fZ")
            .to_string();
        let now_text = now.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string();
        let saved = self
            .store
            .tx_immediate(|tx| {
                user_repos::save_reset_token(
                    tx,
                    user.id,
                    &hashed,
                    &expiry,
                    &email,
                    user.token_version,
                    &now_text,
                )
                .map_err(|e| anyhow::anyhow!(e.to_string()))
            })
            .map_err(|e| SessionError::Internal(e.to_string()))?;
        if saved == 0 {
            return Ok(None);
        }
        Ok(Some((token, email)))
    }

    /// Limpia el token de recuperacion guardado (si el envio del
    /// correo fallo, como hace Go).
    pub fn clear_recovery(&self, user_id: i64, raw_token: &str) -> Result<(), SessionError> {
        let hashed = hash_token(raw_token);
        self.store
            .tx_immediate(|tx| {
                user_repos::clear_reset_token(tx, user_id, &hashed)
                    .map_err(|e| anyhow::anyhow!(e.to_string()))
            })
            .map_err(|e| SessionError::Internal(e.to_string()))?;
        Ok(())
    }

    /// Consume el token de recuperacion (un solo uso) y aplica la
    /// nueva contrasena, que ya viene hasheada con bcrypt.
    pub fn consume_recovery(
        &self,
        raw_token: &str,
        new_password_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<User, SessionError> {
        let now_text = now.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string();
        let hashed = hash_token(raw_token);
        let result = self.store.tx_immediate(|tx| {
            user_repos::consume_reset_token(tx, &hashed, new_password_hash, &now_text)
                .map_err(|e| anyhow::anyhow!(e))
        });
        match result {
            Ok(user) => Ok(user),
            Err(e) => {
                if matches!(
                    e.downcast_ref::<StoreError>(),
                    Some(StoreError::NotFound { .. })
                ) {
                    Err(SessionError::InvalidResetToken)
                } else {
                    Err(SessionError::Internal(e.to_string()))
                }
            }
        }
    }
}

/// Valida la contrasena de edicion (`EDIT_PASSWORD`), igual que Go
/// (`validEdit` en `visitors.go`): si empieza por `$2` es un hash
/// bcrypt; si no, comparacion en tiempo constante.
pub fn valid_edit_password(configured: &str, value: &str) -> bool {
    if configured.starts_with("$2") {
        return verify_password(value, configured);
    }
    constant_time_eq(value.as_bytes(), configured.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Destino interno validado para `/auth/renew`, traduccion de
/// `client/src/app/auth/renew/safe-return-to.ts`: conserva rutas
/// locales con su query (sin fragmento) y devuelve `/` para cualquier
/// destino externo o con truco (`//`, `\\`, `%2f`, `%5c`).
pub fn safe_return_to(requested: Option<&str>) -> String {
    let requested = match requested {
        Some(value) if !value.is_empty() => value,
        _ => return "/".to_string(),
    };
    if !requested.starts_with('/') || requested.starts_with("//") || requested.contains('\\') {
        return "/".to_string();
    }
    // Origen local ficticio, igual que en TypeScript: solo sirve para
    // comprobar que el destino no cambia de origen.
    let base = "https://logmaster.invalid";
    let joined = format!("{base}{requested}");
    let (path, query) = match joined.split_once('?') {
        Some((path, query)) => (path, Some(query)),
        None => (joined.as_str(), None),
    };
    let path = path.split('#').next().unwrap_or(path);
    if path.starts_with("//")
        || path.contains("%2f")
        || path.contains("%2F")
        || path.contains("%5c")
        || path.contains("%5C")
    {
        return "/".to_string();
    }
    let path = path.strip_prefix(base).unwrap_or("/");
    let query = query.map(|q| q.split('#').next().unwrap_or(q));
    match query {
        Some(q) if !q.is_empty() => format!("{path}?{q}"),
        _ => path.to_string(),
    }
}

/// Hashea una contrasena nueva con la politica de Go: valida primero
/// y luego bcrypt con coste 12.
pub fn new_password_hash(password: &str) -> Result<String, logmaster_crypto::PasswordError> {
    logmaster_crypto::validate_password(password)?;
    hash_password(password)
}

/// Capa de sesion de Axum (`authenticate` de Go): lee el token de
/// acceso del `Authorization: Bearer ...` o de la cookie
/// `__Host-logmaster-access`, lo valida contra la base y deja la
/// sesion en las extensiones de la peticion. Sin token o invalido,
/// 401 `UNAUTHORIZED`; con cambio obligatorio pendiente fuera de las
/// dos rutas permitidas, 403 `PASSWORD_CHANGE_REQUIRED`.
pub async fn session_middleware(
    axum::extract::State(service): axum::extract::State<SessionService>,
    mut request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use crate::cookies::{cookie_value, ACCESS_COOKIE};
    use axum::http::StatusCode;

    let token = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| cookie_value(request.headers(), ACCESS_COOKIE));
    let token = match token {
        Some(token) => token,
        None => {
            return crate::error::fail(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "Sesión requerida",
            )
            .into_response();
        }
    };
    let session = match service.validate(&token, false) {
        Ok(session) => session,
        Err(e) => {
            let (status, code, message) = e.response();
            return crate::error::fail(status, code, message).into_response();
        }
    };
    if session.must_change && !Session::path_allowed_while_must_change(request.uri().path()) {
        return crate::error::fail(
            StatusCode::FORBIDDEN,
            "PASSWORD_CHANGE_REQUIRED",
            "Debes cambiar tu contraseña",
        )
        .into_response();
    }
    request.extensions_mut().insert(session);
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use logmaster_store::repos::users::NewUser;

    const NOW: &str = "2026-11-10T00:00:00.000000Z";

    fn test_config() -> Config {
        // Configuracion de fixture: secretos ficticios, TTLs de Go.
        let config = Config {
            bind: "127.0.0.1".to_string(),
            port: 8443,
            db_path: "data/logmaster.db".into(),
            jwt_secret: "fixture-only-not-a-real-secret-fixture-only-not-a-real-secret-"
                .to_string(),
            refresh_secret: "fixture-refresh-secret-fixture-refresh-secret-fixture--".to_string(),
            encryption_key: [0x19u8; 32],
            edit_password: "fixture-edit-password".to_string(),
            access_ttl: StdDuration::from_secs(15 * 60),
            refresh_ttl: StdDuration::from_secs(7 * 24 * 3600),
            absolute_session_ttl: ABSOLUTE_SESSION_TTL,
            max_login_attempts: 5,
            lockout_minutes: 15,
            rate_window_ms: 60_000,
            rate_max_requests: 100,
            app_url: "https://localhost:8443".to_string(),
            cors_origins: vec![],
            trusted_proxies: vec![],
        };
        // El secreto de renovacion de Go no puede ser igual al de acceso.
        assert_ne!(config.jwt_secret, config.refresh_secret);
        config
    }

    fn migrated_store() -> Store {
        let store = Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        store
    }

    fn seed_user(store: &Store, username: &str, role: &str) -> User {
        let hash = hash_password("Private!Safe12Á").unwrap();
        let id = store
            .tx_immediate(|tx| {
                user_repos::insert(
                    tx,
                    &NewUser {
                        username,
                        email: Some("usuario@example.test"),
                        password_hash: &hash,
                        role,
                        must_change_password: true,
                        created_at: NOW,
                        updated_at: NOW,
                    },
                )
                .map_err(|e| anyhow::anyhow!(e.to_string()))
            })
            .unwrap();
        store
            .read(|conn| user_repos::find_by_id(conn, id).map_err(anyhow::Error::from))
            .unwrap()
    }

    #[test]
    fn go_fixture_jwt_decodes_with_go_claims() {
        // Token emitido por Go/Node (crypto-node.json): id 123,
        // tokenVersion 7, HS256 con el secreto del fixture.
        let raw = include_str!("../../../fixtures/crypto-node.json");
        let fixture: serde_json::Value = serde_json::from_str(raw).unwrap();
        let token = fixture["jwt"].as_str().unwrap();
        let secret = fixture["jwtSecret"].as_str().unwrap();
        let mut validation = Validation::new(Algorithm::HS256);
        validation.required_spec_claims.insert("exp".to_string());
        let data = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &validation,
        )
        .unwrap();
        assert_eq!(data.claims.id, 123);
        assert_eq!(data.claims.username, "fixture");
        assert_eq!(data.claims.role, "operador");
        assert_eq!(data.claims.token_version, 7);
    }

    #[test]
    fn session_lifecycle_issue_refresh_revoke() {
        let store = migrated_store();
        let service = SessionService::new(&test_config(), store.clone());
        let user = seed_user(&store, "operador1", "operador");
        let session = Session::from_user(&user);
        assert!(session.must_change);

        let tokens = service.issue(&session).unwrap();
        assert_ne!(tokens.access_token, tokens.refresh_token);
        let validated = service.validate(&tokens.access_token, false).unwrap();
        assert_eq!(validated.id, user.id);
        assert_eq!(validated.role, "operador");
        assert!(validated.must_change);
        assert!(validated.session_started_at.is_some());
        assert!(validated.absolute_expires_at.is_some());

        // Renovar conserva el inicio y el maximo absoluto.
        let renewed = service.refresh(&tokens.refresh_token).unwrap();
        let renewed_session = service.validate(&renewed.access_token, false).unwrap();
        assert_eq!(
            renewed_session.session_started_at,
            validated.session_started_at
        );
        assert_eq!(
            renewed_session.absolute_expires_at,
            validated.absolute_expires_at
        );

        // Un token de acceso no sirve como renovacion y viceversa.
        assert!(service.validate(&tokens.access_token, true).is_err());
        assert!(service.validate(&tokens.refresh_token, false).is_err());

        // Revocar (logout) invalida ambos tokens.
        service.revoke(&validated).unwrap();
        assert!(matches!(
            service.validate(&tokens.access_token, false),
            Err(SessionError::Revoked)
        ));
        assert!(matches!(
            service.validate(&tokens.refresh_token, true),
            Err(SessionError::Revoked)
        ));
        // La segunda revocacion con la version vieja es un conflicto.
        assert!(matches!(
            service.revoke(&validated),
            Err(SessionError::Changed)
        ));
    }

    #[test]
    fn absolute_expiry_is_enforced() {
        let store = migrated_store();
        let service = SessionService::new(&test_config(), store.clone());
        let user = seed_user(&store, "operador2", "operador");
        let now = Utc::now();
        // Sesion que empezo hace 8 dias: emitir ya falla.
        let stale = Session {
            session_started_at: Some(now - ChronoDuration::days(8)),
            absolute_expires_at: Some(now - ChronoDuration::days(1)),
            ..Session::from_user(&user)
        };
        assert!(matches!(
            service.issue_at(&stale, now),
            Err(SessionError::AbsoluteExpired)
        ));
        // Token artesanal con exp futura pero maximo absoluto pasado:
        // la validacion lo rechaza por el maximo, no por exp.
        let claims = SessionClaims {
            id: user.id,
            username: user.username.clone(),
            role: "operador".to_string(),
            token_version: user.token_version,
            session_started_at: Some(now - ChronoDuration::days(8)),
            absolute_expires_at: Some(now - ChronoDuration::seconds(1)),
            exp: (now + ChronoDuration::hours(1)).timestamp() as u64,
            iat: now.timestamp() as u64,
        };
        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(test_config().jwt_secret.as_bytes()),
        )
        .unwrap();
        assert!(matches!(
            service.validate_at(&token, false, now),
            Err(SessionError::AbsoluteExpired)
        ));
        // Token con exp pasada se rechaza por firma/expiracion.
        let expired = SessionClaims {
            exp: (now - ChronoDuration::seconds(1)).timestamp() as u64,
            absolute_expires_at: Some(now + ChronoDuration::days(7)),
            session_started_at: Some(now),
            ..claims
        };
        let token = encode(
            &Header::new(Algorithm::HS256),
            &expired,
            &EncodingKey::from_secret(test_config().jwt_secret.as_bytes()),
        )
        .unwrap();
        assert!(matches!(
            service.validate_at(&token, false, now),
            Err(SessionError::Invalid)
        ));
    }

    #[test]
    fn legacy_refresh_token_requires_login() {
        let store = migrated_store();
        let service = SessionService::new(&test_config(), store.clone());
        let user = seed_user(&store, "operador3", "operador");
        let now = Utc::now();
        // Token de renovacion sin sessionStartedAt ni absoluteExpiresAt.
        let claims = SessionClaims {
            id: user.id,
            username: user.username.clone(),
            role: "operador".to_string(),
            token_version: user.token_version,
            session_started_at: None,
            absolute_expires_at: None,
            exp: (now + ChronoDuration::days(7)).timestamp() as u64,
            iat: now.timestamp() as u64,
        };
        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(test_config().refresh_secret.as_bytes()),
        )
        .unwrap();
        assert!(matches!(
            service.validate_at(&token, true, now),
            Err(SessionError::LegacyRefresh)
        ));
        // Como acceso, un token sin fechas firmado con el secreto de
        // acceso si valida (legado): Go solo exige las fechas al renovar.
        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(test_config().jwt_secret.as_bytes()),
        )
        .unwrap();
        assert!(service.validate_at(&token, false, now).is_ok());
    }

    #[test]
    fn recovery_is_single_use_and_generic() {
        let store = migrated_store();
        let service = SessionService::new(&test_config(), store.clone());
        let user = seed_user(&store, "operador4", "operador");
        let now = Utc::now();
        // Cuenta inexistente: respuesta generica (None), sin error.
        assert!(service.request_recovery("nadie", now).unwrap().is_none());
        // Si el envio del correo falla, el token se limpia y ya no vale.
        let (lost, _) = service
            .request_recovery("operador4", now)
            .unwrap()
            .expect("primer token");
        service.clear_recovery(user.id, &lost).unwrap();
        let hash = hash_password("Nueva!Clave123").unwrap();
        assert_eq!(
            service.consume_recovery(&lost, &hash, now),
            Err(SessionError::InvalidResetToken)
        );

        // Un token nuevo si funciona una sola vez y revoca las
        // sesiones (tokenVersion sube).
        let (token, email) = service
            .request_recovery("operador4", now)
            .unwrap()
            .expect("segundo token");
        assert_eq!(email, "usuario@example.test");
        assert_eq!(token.len(), 64);
        let updated = service.consume_recovery(&token, &hash, now).unwrap();
        assert_eq!(updated.id, user.id);
        assert_eq!(updated.token_version, user.token_version + 1);
        assert_eq!(
            service.consume_recovery(&token, &hash, now),
            Err(SessionError::InvalidResetToken)
        );
        // Token inventado: mismo error generico.
        assert_eq!(
            service.consume_recovery(&"00".repeat(32), &hash, now),
            Err(SessionError::InvalidResetToken)
        );
    }

    #[test]
    fn new_password_hash_validates_and_hashes() {
        assert!(new_password_hash("weak").is_err());
        let hash = new_password_hash("Private!Safe12Á").unwrap();
        assert!(verify_password("Private!Safe12Á", &hash));
        // El servicio valida la contrasena de edicion configurada.
        let store = migrated_store();
        let service = SessionService::new(&test_config(), store);
        assert!(service.valid_edit_password("fixture-edit-password"));
        assert!(!service.valid_edit_password("otra"));
    }

    #[test]
    fn valid_edit_password_matches_go() {
        assert!(valid_edit_password("clave-secreta", "clave-secreta"));
        assert!(!valid_edit_password("clave-secreta", "clave-secreto"));
        assert!(!valid_edit_password("clave-secreta", "corta"));
        let hash = hash_password("Edicion!Clave12").unwrap();
        assert!(valid_edit_password(&hash, "Edicion!Clave12"));
        assert!(!valid_edit_password(&hash, "Edicion!Clave13"));
    }

    #[test]
    fn safe_return_to_matches_typescript_cases() {
        assert_eq!(
            safe_return_to(Some("/admin?tab=users#secrets")),
            "/admin?tab=users"
        );
        for bad in [
            "https://attacker.example/path",
            "//attacker.example/path",
            "https://logmaster.invalid//attacker.example/path",
            "/%2f%2fattacker.example/path",
            "/\\\\attacker.example/path",
            "/%5c%5cattacker.example/path",
        ] {
            assert_eq!(safe_return_to(Some(bad)), "/", "{bad} debe rechazarse");
        }
        assert_eq!(safe_return_to(None), "/");
        assert_eq!(safe_return_to(Some("")), "/");
        assert_eq!(safe_return_to(Some("/privacy")), "/privacy");
    }

    #[test]
    fn must_change_gate_allows_only_password_and_session() {
        for path in [
            "/api/v1/auth/change-password",
            "/auth/change-password",
            "/api/v1/auth/session",
            "/auth/session",
        ] {
            assert!(
                Session::path_allowed_while_must_change(path),
                "{path} debe estar permitido"
            );
        }
        assert!(!Session::path_allowed_while_must_change(
            "/api/v1/visits/active"
        ));
        assert!(!Session::path_allowed_while_must_change(
            "/api/v1/auth/login"
        ));
    }
}
