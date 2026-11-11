//! Familia `auth` (7 rutas + `/auth/renew`).
//!
//! Traducción de `server-go/internal/httpapi/auth.go` y de
//! `client/src/app/auth/renew/safe-return-to.ts`:
//!
//! - Login con límite por cuenta (20 intentos / 15 min,
//!   `Retry-After: 900`), bloqueo temporal y auditoría `LOGIN`.
//! - Renovación con el secreto independiente y el máximo absoluto.
//! - Recuperación genérica: el token se guarda hasheado; el envío del
//!   correo queda para la fase 6 (lettre) y aquí solo se registra que
//!   está pendiente, sin exponer el token.
//! - Logout con revocación (`tokenVersion` +1) y auditoría `LOGOUT`.
//! - Cambio de contraseña propio con revocación de sesiones.
//! - Cookies de sesión/CSRF en login, refresh y renew, como las que
//!   ponía Next; el JSON con los tokens se conserva igual que en Go.
//! - Todo el acceso a datos va por los traits (`Repositories`) y las
//!   operaciones con auditoría por `UnitOfWork`, en ambos motores.
//! - `/auth/renew` (ruta de Next, no de Go): renueva por cookie y
//!   redirige (302) al destino interno validado con `safe_return_to`.

use axum::{
    extract::State,
    http::{header, HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use logmaster_crypto::{random_token, verify_password};
use serde::Deserialize;
use serde_json::json;

use crate::common::{
    audit_entry, audit_meta, client_ip_of, now_text, parse_instant, parse_query, store_fail,
    validation_error, RemoteAddr, StrictJson,
};
use crate::cookies::{
    clear_session_cookies, cookie_value, set_csrf_cookie, set_session_cookies, ACCESS_COOKIE,
    REFRESH_COOKIE,
};
use crate::error;
use crate::http::ApiState;
use crate::rate_limit::RETRY_AFTER_ACCOUNT;
use crate::session::{new_password_hash, safe_return_to, Session, SessionError};

/// Hash bcrypt ficticio con el que Go disimula el tiempo de un login
/// con usuario inexistente.
const DUMMY_HASH: &str = "$2a$12$McrB/iIusUSh84evLjMHJONKe/qFs63lZ/sJiXaGNTKNWxguQv98a";

/// Rutas públicas de auth (sin capa de sesión).
pub fn public_routes() -> Router<ApiState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/forgot-password", post(forgot_password))
        .route("/auth/reset-password", post(reset_password))
        .route("/auth/refresh", post(refresh))
        .route("/auth/logout", post(logout))
        .route("/auth/renew", get(renew))
}

/// Rutas de auth detrás de la capa de sesión.
pub fn protected_routes() -> Router<ApiState> {
    Router::new()
        .route("/auth/session", get(current_session))
        .route("/auth/change-password", post(change_password))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LoginBody {
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
}

async fn login(
    State(state): State<ApiState>,
    headers: HeaderMap,
    remote: RemoteAddr,
    StrictJson(body): StrictJson<LoginBody>,
) -> Response {
    if body.username.is_empty()
        || body.username.len() > 100
        || body.password.is_empty()
        || body.password.len() > 800
    {
        return validation_error("Usuario y contraseña requeridos");
    }
    let ip = client_ip_of(&headers, remote.0, &state.trusted_proxies);
    if !state.limiter.check_account(&ip, &body.username) {
        let mut response = error::fail(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Demasiados intentos para esta cuenta",
        )
        .into_response();
        response.headers_mut().insert(
            header::RETRY_AFTER,
            RETRY_AFTER_ACCOUNT.parse().expect("Retry-After válido"),
        );
        return response;
    }
    let now = Utc::now();
    let now_text = now_text();
    let user = match state.repos.users.find_by_username(&body.username).await {
        Ok(user) => user,
        Err(_) => {
            // Usuario inexistente: mismo coste que una verificación
            // real y mismo 401 genérico que Go.
            verify_password(&body.password, DUMMY_HASH);
            return error::fail(
                StatusCode::UNAUTHORIZED,
                "AUTH_FAILED",
                "Credenciales inválidas",
            )
            .into_response();
        }
    };
    if let Some(locked_until) = user.locked_until.as_deref().and_then(parse_instant) {
        if locked_until > now {
            return error::fail(
                StatusCode::FORBIDDEN,
                "ACCOUNT_LOCKED",
                "Cuenta bloqueada temporalmente",
            )
            .into_response();
        }
    }
    if !verify_password(&body.password, &user.password_hash) {
        let mut attempts = user.login_attempts.unwrap_or(0) + 1;
        if user
            .locked_until
            .as_deref()
            .and_then(parse_instant)
            .is_some_and(|until| until <= now)
        {
            attempts = 1;
        }
        let locked_until = if attempts >= state.max_login_attempts {
            Some(
                (now + chrono::Duration::minutes(state.lockout_minutes))
                    .format("%Y-%m-%dT%H:%M:%S%.6fZ")
                    .to_string(),
            )
        } else {
            None
        };
        if let Err(e) = state
            .repos
            .users
            .login_failed(user.id, attempts, locked_until.as_deref(), &now_text)
            .await
        {
            return store_fail(&e);
        }
        return error::fail(
            StatusCode::UNAUTHORIZED,
            "AUTH_FAILED",
            "Credenciales inválidas",
        )
        .into_response();
    }
    let session = Session::from_user(&user);
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        "/api/v1/auth/login",
    );
    let entity_id = user.id.to_string();
    let entry = audit_entry(
        &meta, &session, "LOGIN", "User", &entity_id, None, &now_text,
    );
    if let Err(e) = state
        .repos
        .uow
        .login_success(user.id, &now_text, &entry)
        .await
    {
        return store_fail(&e);
    }
    let tokens = match state.session.issue(&session) {
        Ok(tokens) => tokens,
        Err(e) => return session_fail(&e),
    };
    let mut response_headers = HeaderMap::new();
    set_session_cookies(
        &mut response_headers,
        &tokens.access_token,
        &tokens.refresh_token,
    );
    if let Ok(csrf) = random_token() {
        set_csrf_cookie(&mut response_headers, &csrf);
    }
    (response_headers, error::ok(json!(tokens))).into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RefreshBody {
    #[serde(default, rename = "refreshToken")]
    refresh_token: String,
}

async fn refresh(
    State(state): State<ApiState>,
    StrictJson(body): StrictJson<RefreshBody>,
) -> Response {
    let tokens = match state.session.refresh(&body.refresh_token).await {
        Ok(tokens) => tokens,
        Err(_) => {
            return error::fail(
                StatusCode::UNAUTHORIZED,
                "INVALID_TOKEN",
                "Sesión de renovación inválida",
            )
            .into_response();
        }
    };
    let mut response_headers = HeaderMap::new();
    set_session_cookies(
        &mut response_headers,
        &tokens.access_token,
        &tokens.refresh_token,
    );
    if let Ok(csrf) = random_token() {
        set_csrf_cookie(&mut response_headers, &csrf);
    }
    (response_headers, error::ok(json!(tokens))).into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LogoutBody {
    #[serde(default, rename = "accessToken")]
    access_token: String,
    #[serde(default, rename = "refreshToken")]
    refresh_token: String,
}

async fn logout(
    State(state): State<ApiState>,
    headers: HeaderMap,
    remote: RemoteAddr,
    StrictJson(body): StrictJson<LogoutBody>,
) -> Response {
    if body.access_token.len() > 4096 || body.refresh_token.len() > 4096 {
        return validation_error("Token inválido");
    }
    let mut session = None;
    if !body.refresh_token.is_empty() {
        session = state.session.validate(&body.refresh_token, true).await.ok();
    }
    if session.is_none() && !body.access_token.is_empty() {
        session = state.session.validate(&body.access_token, false).await.ok();
    }
    let Some(session) = session else {
        return error::fail(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Sesión inválida o revocada",
        )
        .into_response();
    };
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        "/api/v1/auth/logout",
    );
    let now_text = now_text();
    let entity_id = session.id.to_string();
    let entry = audit_entry(
        &meta, &session, "LOGOUT", "User", &entity_id, None, &now_text,
    );
    match state
        .repos
        .uow
        .logout(session.id, session.token_version, &now_text, &entry)
        .await
    {
        Ok(1) => {
            let mut response_headers = HeaderMap::new();
            clear_session_cookies(&mut response_headers);
            (response_headers, error::ok(json!({ "revoked": true }))).into_response()
        }
        Ok(_) => error::fail(
            StatusCode::CONFLICT,
            "SESSION_CHANGED",
            "La sesión cambió durante la operación",
        )
        .into_response(),
        Err(e) => store_fail(&e),
    }
}

async fn current_session(session: Session) -> Json<serde_json::Value> {
    error::ok(json!({
        "user": {
            "id": session.id,
            "username": session.username,
            "role": session.role,
            "mustChangePassword": session.must_change,
        }
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ChangePasswordBody {
    #[serde(default, rename = "currentPassword")]
    current_password: String,
    #[serde(default, rename = "newPassword")]
    new_password: String,
    #[serde(default, rename = "confirmPassword")]
    confirm_password: String,
}

async fn change_password(
    State(state): State<ApiState>,
    headers: HeaderMap,
    remote: RemoteAddr,
    session: Session,
    StrictJson(body): StrictJson<ChangePasswordBody>,
) -> Response {
    let hash = match new_password_hash(&body.new_password) {
        Ok(hash) => hash,
        Err(e) => return validation_error(e.0),
    };
    if !body.confirm_password.is_empty() && body.confirm_password != body.new_password {
        return validation_error("Las contraseñas no coinciden");
    }
    let user = match state.repos.users.find_by_id(session.id).await {
        Ok(user) => user,
        Err(e) => {
            return store_fail(&e);
        }
    };
    if !verify_password(&body.current_password, &user.password_hash) {
        return error::fail(
            StatusCode::UNAUTHORIZED,
            "INVALID_PASSWORD",
            "Contraseña actual incorrecta",
        )
        .into_response();
    }
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        "/api/v1/auth/change-password",
    );
    let now_text = now_text();
    let entity_id = session.id.to_string();
    let entry = audit_entry(
        &meta,
        &session,
        "PASSWORD_CHANGE",
        "User",
        &entity_id,
        None,
        &now_text,
    );
    match state
        .repos
        .uow
        .change_password(
            session.id,
            &hash,
            false,
            session.token_version,
            &now_text,
            &entry,
        )
        .await
    {
        Ok(1) => error::ok(json!({ "message": "Contraseña actualizada" })).into_response(),
        Ok(_) => error::fail(
            StatusCode::CONFLICT,
            "SESSION_CHANGED",
            "La sesión cambió durante la operación",
        )
        .into_response(),
        Err(e) => store_fail(&e),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ForgotBody {
    #[serde(default)]
    username: String,
}

async fn forgot_password(
    State(state): State<ApiState>,
    StrictJson(body): StrictJson<ForgotBody>,
) -> Response {
    if body.username.is_empty() || body.username.len() > 100 {
        return validation_error("Usuario requerido");
    }
    // El envío del correo es de la fase 6 (lettre): el token queda
    // guardado y válido 15 minutos, y aquí solo se deja constancia de
    // que el envío está pendiente. La respuesta es genérica en ambos
    // casos, como en Go.
    match state
        .session
        .request_recovery(&body.username, Utc::now())
        .await
    {
        Ok(Some((_token, _email))) => {
            tracing::warn!(
                "correo de recuperación pendiente (fase 6, lettre) para el usuario {}",
                body.username
            );
        }
        Ok(None) => {}
        Err(e) => return session_fail(&e),
    }
    error::ok(json!({
        "message": "Si la cuenta existe y tiene correo, recibirás instrucciones de recuperación."
    }))
    .into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResetBody {
    #[serde(default)]
    token: String,
    #[serde(default, rename = "newPassword")]
    new_password: String,
}

async fn reset_password(
    State(state): State<ApiState>,
    headers: HeaderMap,
    remote: RemoteAddr,
    StrictJson(body): StrictJson<ResetBody>,
) -> Response {
    if body.token.len() != 64 {
        return error::fail(
            StatusCode::BAD_REQUEST,
            "INVALID_TOKEN",
            "Token inválido o vencido",
        )
        .into_response();
    }
    let hash = match new_password_hash(&body.new_password) {
        Ok(hash) => hash,
        Err(e) => return validation_error(e.0),
    };
    // Consumo del token y auditoría en la misma transacción, como Go:
    // primero se localiza la cuenta por el token (para construir la
    // auditoría) y luego `UnitOfWork::consume_reset` aplica la
    // contraseña y escribe `PASSWORD_RESET` en una sola transacción.
    let now_text = now_text();
    let token_hash = logmaster_crypto::hash_token(&body.token);
    let user = match state.repos.users.find_by_reset_token(&token_hash).await {
        Ok(user) => user,
        Err(_) => {
            return error::fail(
                StatusCode::BAD_REQUEST,
                "INVALID_TOKEN",
                "Token inválido o vencido",
            )
            .into_response();
        }
    };
    let session = Session::from_user(&user);
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        "/api/v1/auth/reset-password",
    );
    let entity_id = user.id.to_string();
    let entry = audit_entry(
        &meta,
        &session,
        "PASSWORD_RESET",
        "User",
        &entity_id,
        None,
        &now_text,
    );
    match state
        .repos
        .uow
        .consume_reset(&token_hash, &hash, &now_text, &entry)
        .await
    {
        Ok(_user) => error::ok(json!({ "message": "Contraseña restablecida" })).into_response(),
        Err(logmaster_store::error::StoreError::NotFound { .. }) => error::fail(
            StatusCode::BAD_REQUEST,
            "INVALID_TOKEN",
            "Token inválido o vencido",
        )
        .into_response(),
        Err(e) => store_fail(&e),
    }
}

/// `/auth/renew` de Next: renueva por cookie y redirige al destino
/// interno validado. Sin sesión válida, 401.
async fn renew(State(state): State<ApiState>, headers: HeaderMap, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let dest = safe_return_to(
        params
            .get("returnTo")
            .and_then(|values| values.first())
            .map(String::as_str),
    );
    let access = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| cookie_value(&headers, ACCESS_COOKIE));
    if let Some(token) = access {
        if state.session.validate(&token, false).await.is_ok() {
            return redirect(&dest);
        }
    }
    if let Some(refresh_token) = cookie_value(&headers, REFRESH_COOKIE) {
        if let Ok(tokens) = state.session.refresh(&refresh_token).await {
            let mut response_headers = HeaderMap::new();
            set_session_cookies(
                &mut response_headers,
                &tokens.access_token,
                &tokens.refresh_token,
            );
            if let Ok(csrf) = random_token() {
                set_csrf_cookie(&mut response_headers, &csrf);
            }
            response_headers.insert(header::LOCATION, dest.parse().expect("destino válido"));
            return (StatusCode::FOUND, response_headers).into_response();
        }
    }
    error::fail(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "Sesión requerida").into_response()
}

fn redirect(dest: &str) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(header::LOCATION, dest.parse().expect("destino válido"));
    (StatusCode::FOUND, headers).into_response()
}

fn session_fail(error: &SessionError) -> Response {
    let (status, code, message) = error.response();
    error::fail(status, code, message).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request},
    };
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use tower::ServiceExt;

    use crate::http::{build_router_with_state, ApiState};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> crate::config::Config {
        crate::config::Config {
            bind: "127.0.0.1".to_string(),
            port: 8443,
            db_path: "data/logmaster.db".into(),
            database_engine: logmaster_store::DatabaseEngine::Sqlite,
            database_url: None,
            test_connection_on_startup: true,
            install_folder: r"C:\LogMaster".to_string(),
            desktop_shortcut: true,
            config_path: None,
            jwt_secret: "ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss"
                .to_string(),
            refresh_secret: "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr"
                .to_string(),
            encryption_key: [0x19u8; 32],
            edit_password: "fixture-edit-password".to_string(),
            access_ttl: std::time::Duration::from_secs(15 * 60),
            refresh_ttl: std::time::Duration::from_secs(7 * 24 * 3600),
            absolute_session_ttl: crate::session::ABSOLUTE_SESSION_TTL,
            max_login_attempts: 5,
            lockout_minutes: 15,
            audit_retention_days: 365,
            retention_enabled: false,
            backup_path: None,
            rate_window_ms: 60_000,
            rate_max_requests: 100,
            app_url: APP_ORIGIN.to_string(),
            cors_origins: vec![],
            trusted_proxies: vec![],
        }
    }

    fn test_state() -> ApiState {
        let store = logmaster_store::Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        ApiState::new(logmaster_store::Database::Sqlite(store), &test_config())
    }

    async fn seed_user(state: &ApiState, username: &str, role: &str, must_change: bool) {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .repos
            .users
            .insert(&NewUser {
                username,
                email: Some("usuario@example.test"),
                password_hash: &hash,
                role,
                must_change_password: must_change,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap();
    }

    async fn request(
        router: Router,
        method: Method,
        uri: &str,
        body: Option<&str>,
        extra_headers: &[(&str, &str)],
    ) -> (StatusCode, serde_json::Value, HeaderMap) {
        let mut builder = Request::builder().method(method).uri(uri);
        if body.is_some() {
            builder = builder.header("origin", APP_ORIGIN);
        }
        for (name, value) in extra_headers {
            builder = builder.header(*name, *value);
        }
        let request = builder
            .body(Body::from(body.unwrap_or_default().to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, value, headers)
    }

    fn login_body(username: &str, password: &str) -> String {
        serde_json::json!({ "username": username, "password": password }).to_string()
    }

    #[tokio::test]
    async fn login_success_sets_cookies_and_session_works() {
        let state = test_state();
        seed_user(&state, "operador", "operador", false).await;
        let router = build_router_with_state(state.clone());
        let (status, body, headers) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(&login_body("operador", "Private!Safe12Á")),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["success"], true);
        assert_eq!(body["data"]["user"]["username"], "operador");
        assert_eq!(body["data"]["user"]["role"], "operador");
        let cookies: Vec<String> = headers
            .get_all(header::SET_COOKIE)
            .iter()
            .map(|v| v.to_str().unwrap().to_string())
            .collect();
        assert_eq!(cookies.len(), 3, "acceso, renovación y CSRF");
        assert!(cookies[0].starts_with("__Host-logmaster-access="));
        assert!(cookies[1].starts_with("__Host-logmaster-refresh="));
        assert!(cookies[2].starts_with("__Host-logmaster-csrf="));
        let access = body["data"]["accessToken"].as_str().unwrap();
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/session",
            None,
            &[("authorization", &format!("Bearer {access}"))],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"]["user"]["username"], "operador");
    }

    #[tokio::test]
    async fn login_rejects_bad_credentials_and_locks_account() {
        let state = test_state();
        seed_user(&state, "operador", "operador", false).await;
        let router = build_router_with_state(state.clone());
        // Usuario inexistente: 401 genérico.
        let (status, body, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(&login_body("nadie", "Private!Safe12Á")),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"]["code"], "AUTH_FAILED");
        // Contraseña incorrecta: 401 cinco veces...
        for _ in 0..5 {
            let (status, _, _) = request(
                router.clone(),
                Method::POST,
                "/api/v1/auth/login",
                Some(&login_body("operador", "Otra!Clave123")),
                &[],
            )
            .await;
            assert_eq!(status, StatusCode::UNAUTHORIZED);
        }
        // ...y a la sexta la cuenta está bloqueada.
        let (status, body, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(&login_body("operador", "Otra!Clave123")),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "ACCOUNT_LOCKED");
    }

    #[tokio::test]
    async fn refresh_logout_and_password_change_flow() {
        let state = test_state();
        seed_user(&state, "operador", "operador", false).await;
        let router = build_router_with_state(state.clone());
        let (_, login, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(&login_body("operador", "Private!Safe12Á")),
            &[],
        )
        .await;
        let refresh_token = login["data"]["refreshToken"].as_str().unwrap().to_string();
        let access_token = login["data"]["accessToken"].as_str().unwrap().to_string();
        // Renovar.
        let (status, renewed, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/refresh",
            Some(&serde_json::json!({ "refreshToken": refresh_token }).to_string()),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        // El token renovado vale (si la renovación cae en el mismo
        // segundo que el login, el JWT es idéntico: es determinista).
        let renewed_access = renewed["data"]["accessToken"].as_str().unwrap().to_string();
        let (status, _, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/session",
            None,
            &[("authorization", &format!("Bearer {renewed_access}"))],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        // Cambiar la contraseña con el token viejo (aún vigente).
        let (status, _, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/change-password",
            Some(
                &serde_json::json!({
                    "currentPassword": "Private!Safe12Á",
                    "newPassword": "Nueva!Clave123",
                    "confirmPassword": "Nueva!Clave123",
                })
                .to_string(),
            ),
            &[("authorization", &format!("Bearer {access_token}"))],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        // El cambio revocó las sesiones: el token viejo ya no vale.
        let (status, _, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/session",
            None,
            &[("authorization", &format!("Bearer {access_token}"))],
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        // Login con la contraseña nueva.
        let (status, login, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(&login_body("operador", "Nueva!Clave123")),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let access = login["data"]["accessToken"].as_str().unwrap().to_string();
        let refresh = login["data"]["refreshToken"].as_str().unwrap().to_string();
        // Logout revoca.
        let (status, body, headers) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/logout",
            Some(
                &serde_json::json!({ "accessToken": access, "refreshToken": refresh }).to_string(),
            ),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"]["revoked"], true);
        assert!(headers
            .get_all(header::SET_COOKIE)
            .iter()
            .all(|v| v.to_str().unwrap().contains("Max-Age=0")));
        let (status, _, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/session",
            None,
            &[("authorization", &format!("Bearer {access}"))],
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn forgot_and_reset_are_generic_and_single_use() {
        let state = test_state();
        seed_user(&state, "operador", "operador", false).await;
        let router = build_router_with_state(state.clone());
        // Cuenta inexistente: misma respuesta genérica.
        for username in ["nadie", "operador"] {
            let (status, body, _) = request(
                router.clone(),
                Method::POST,
                "/api/v1/auth/forgot-password",
                Some(&serde_json::json!({ "username": username }).to_string()),
                &[],
            )
            .await;
            assert_eq!(status, StatusCode::OK);
            assert!(body["data"]["message"]
                .as_str()
                .unwrap()
                .contains("Si la cuenta existe"));
        }
        // Token de recuperación real (el servicio lo devuelve al
        // llamador; el correo es fase 6).
        let (token, _) = state
            .session
            .request_recovery("operador", Utc::now())
            .await
            .unwrap()
            .expect("token de recuperación");
        assert_eq!(token.len(), 64);
        // Token con longitud incorrecta: 400.
        let (status, body, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/reset-password",
            Some(
                &serde_json::json!({ "token": "corto", "newPassword": "Nueva!Clave123" })
                    .to_string(),
            ),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "INVALID_TOKEN");
        // Consumo válido.
        let (status, _, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/reset-password",
            Some(
                &serde_json::json!({ "token": token, "newPassword": "Nueva!Clave123" }).to_string(),
            ),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        // Segundo uso: 400.
        let (status, body, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/reset-password",
            Some(
                &serde_json::json!({ "token": token, "newPassword": "Otra!Clave123" }).to_string(),
            ),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "INVALID_TOKEN");
        // Login con la contraseña restablecida.
        let (status, _, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(&login_body("operador", "Nueva!Clave123")),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }

    #[tokio::test]
    async fn renew_redirects_to_safe_destination() {
        let state = test_state();
        seed_user(&state, "operador", "operador", false).await;
        let router = build_router_with_state(state.clone());
        let (_, login, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(&login_body("operador", "Private!Safe12Á")),
            &[],
        )
        .await;
        let access = login["data"]["accessToken"].as_str().unwrap().to_string();
        let cookie = format!("__Host-logmaster-access={access}");
        let (status, _, headers) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/renew?returnTo=/admin?tab=users",
            None,
            &[("cookie", &cookie)],
        )
        .await;
        assert_eq!(status, StatusCode::FOUND);
        assert_eq!(
            headers.get(header::LOCATION).unwrap().to_str().unwrap(),
            "/admin?tab=users"
        );
        // Destino externo: se devuelve a /.
        let (status, _, headers) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/renew?returnTo=https://attacker.example/x",
            None,
            &[("cookie", &cookie)],
        )
        .await;
        assert_eq!(status, StatusCode::FOUND);
        assert_eq!(
            headers.get(header::LOCATION).unwrap().to_str().unwrap(),
            "/"
        );
        // Sin sesión: 401.
        let (status, _, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/renew?returnTo=/admin",
            None,
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn strict_json_rejects_unknown_fields_and_bad_bodies() {
        let state = test_state();
        seed_user(&state, "operador", "operador", false).await;
        let router = build_router_with_state(state.clone());
        // Campo desconocido: 400.
        let (status, body, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(r#"{"username":"operador","password":"x","extra":1}"#),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
        // JSON con basura después del valor: 400.
        let (status, _, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/auth/login",
            Some(r#"{"username":"operador","password":"x"} {"otro":1}"#),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
}
