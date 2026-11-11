//! Familia `superadmin` (5 rutas + la variante root de bitácora,
//! que vive en `audit.rs`).
//!
//! Traducción de `server-go/internal/httpapi/users.go`: cuentas solo
//! para root (`ManageAccounts`). Crear no admite el rol root;
//! actualizar no puede cambiar el rol de root ni borrarlo; el reset
//! administrativo exige la política de contraseña y activa el cambio
//! obligatorio. Todo con auditoría en la misma transacción vía
//! `UnitOfWork`.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, Method, StatusCode, Uri},
    middleware,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Router,
};
use logmaster_crypto::{hash_password, validate_password};
use logmaster_store::repos::users::NewUser;
use serde::Deserialize;
use serde::Deserializer;
use serde_json::{json, Value};

/// Deserializa un campo presente (incluso con `null`) como `Some`:
/// serde convierte un `null` JSON en `None` para `Option<T>`, así
/// que sin esto no se distingue "ausente" de "null" (Go los distingue:
/// ausente conserva el correo, `null` lo limpia).
fn deserialize_some<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

use crate::common::{
    audit_entry, audit_meta, now_text, parse_id, server_error, store_fail, valid_email,
    validation_error, RemoteAddr, StrictJson,
};
use crate::error;
use crate::http::ApiState;
use crate::roles::{require_permission, Permission};
use crate::session::Session;

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    Router::new()
        .route("/superadmin/users", get(list_users))
        .route("/superadmin/users", post(create_user))
        .route("/superadmin/users/{id}", put(update_user))
        .route("/superadmin/users/{id}", delete(delete_user))
        .route(
            "/superadmin/users/{id}/reset-password",
            post(reset_password),
        )
        .layer(middleware::from_fn_with_state(
            Permission::ManageAccounts,
            require_permission,
        ))
}

/// Roles creables por root (el root no se crea por HTTP, como Go).
fn valid_role(role: &str) -> bool {
    matches!(role, "admin" | "operador" | "auditor" | "demo")
}

fn user_json(user: &logmaster_store::models::User) -> Value {
    json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "mustChangePassword": user.must_change_password,
        "loginAttempts": user.login_attempts,
        "lockedUntil": user.locked_until,
    })
}

async fn list_users(State(state): State<ApiState>) -> Response {
    match state.repos.users.list_all().await {
        Ok(users) => {
            let items: Vec<Value> = users.iter().map(user_json).collect();
            error::ok(json!(items)).into_response()
        }
        Err(e) => store_fail(&e),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CreateUserBody {
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    role: String,
}

async fn create_user(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    StrictJson(body): StrictJson<CreateUserBody>,
) -> Response {
    let username = body.username.trim().to_string();
    if username.is_empty()
        || username.len() > 100
        || !valid_role(&body.role)
        || (body.email.is_empty() && body.role != "demo")
        || (!body.email.is_empty() && !valid_email(&body.email))
    {
        return validation_error("Usuario, rol o correo inválido");
    }
    if let Err(e) = validate_password(&body.password) {
        return validation_error(&e.to_string());
    }
    let hash = match hash_password(&body.password) {
        Ok(hash) => hash,
        Err(e) => return server_error(&e.to_string()),
    };
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        uri.path(),
    );
    let id_text = String::new();
    let entry = audit_entry(
        &meta,
        &session,
        "SUPERADMIN_CREATE_USER",
        "User",
        &id_text,
        None,
        &now_text,
    );
    let email = if body.email.is_empty() {
        None
    } else {
        Some(body.email.as_str())
    };
    let id = match state
        .repos
        .uow
        .create_user(
            &NewUser {
                username: &username,
                email,
                password_hash: &hash,
                role: &body.role,
                must_change_password: true,
                created_at: &now_text,
                updated_at: &now_text,
            },
            &entry,
        )
        .await
    {
        Ok(id) => id,
        Err(e) => return store_fail(&e),
    };
    error::ok(json!({
        "id": id,
        "username": username,
        "email": email,
        "role": body.role,
        "mustChangePassword": true,
    }))
    .into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct UpdateUserBody {
    #[serde(default)]
    username: Option<String>,
    #[serde(default, deserialize_with = "deserialize_some")]
    email: Option<Option<String>>,
    #[serde(default)]
    role: Option<String>,
}

async fn update_user(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<UpdateUserBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    if body.username.is_none() && body.email.is_none() && body.role.is_none() {
        return validation_error("No se enviaron cambios");
    }
    if body
        .username
        .as_deref()
        .is_some_and(|value| value.trim().is_empty() || value.len() > 100)
        || body.role.as_deref().is_some_and(|value| !valid_role(value))
    {
        return validation_error("Usuario o rol inválido");
    }
    let current = match state.repos.users.find_by_id(id).await {
        Ok(user) => user,
        Err(e) => return store_fail(&e),
    };
    if current.role.as_deref() == Some("root") && body.role.is_some() {
        return error::fail(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "No se puede modificar el rol root",
        )
        .into_response();
    }
    let username = body
        .username
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.username)
        .to_string();
    let role = body
        .role
        .as_deref()
        .unwrap_or(current.role.as_deref().unwrap_or(""))
        .to_string();
    // `email`: ausente conserva, `null` limpia, cadena valida y pone.
    let mut email: Option<Option<&str>> = None;
    if let Some(raw_email) = &body.email {
        match raw_email {
            None => email = Some(None),
            Some(text) => {
                if !valid_email(text) {
                    return validation_error("Correo inválido");
                }
                email = Some(Some(text.as_str()));
            }
        }
    }
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::PUT,
        uri.path(),
    );
    let id_text = id.to_string();
    let entry = audit_entry(
        &meta,
        &session,
        "SUPERADMIN_UPDATE_USER",
        "User",
        &id_text,
        None,
        &now_text,
    );
    let updated = match state
        .repos
        .uow
        .update_user(id, &username, email, &role, &entry)
        .await
    {
        Ok(user) => user,
        Err(e) => return store_fail(&e),
    };
    error::ok(json!({
        "id": updated.id,
        "username": updated.username,
        "email": updated.email,
        "role": updated.role,
    }))
    .into_response()
}

async fn delete_user(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    let current = match state.repos.users.find_by_id(id).await {
        Ok(user) => user,
        Err(e) => return store_fail(&e),
    };
    if current.role.as_deref() == Some("root") {
        return error::fail(
            StatusCode::FORBIDDEN,
            "CANNOT_DELETE_ROOT",
            "No se puede eliminar root",
        )
        .into_response();
    }
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::DELETE,
        uri.path(),
    );
    let id_text = id.to_string();
    let entry = audit_entry(
        &meta,
        &session,
        "SUPERADMIN_DELETE_USER",
        "User",
        &id_text,
        None,
        &now_text,
    );
    match state.repos.uow.delete_user(id, &entry).await {
        Ok(()) => error::ok(json!({"message": "Usuario eliminado"})).into_response(),
        Err(e) => store_fail(&e),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ResetPasswordBody {
    #[serde(default)]
    new_password: String,
}

async fn reset_password(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<ResetPasswordBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    if let Err(e) = validate_password(&body.new_password) {
        return error::fail(
            StatusCode::BAD_REQUEST,
            "PASSWORD_POLICY_VIOLATION",
            &e.to_string(),
        )
        .into_response();
    }
    let user = match state.repos.users.find_by_id(id).await {
        Ok(user) => user,
        Err(e) => return store_fail(&e),
    };
    let hash = match hash_password(&body.new_password) {
        Ok(hash) => hash,
        Err(e) => return server_error(&e.to_string()),
    };
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        uri.path(),
    );
    let id_text = id.to_string();
    let entry = audit_entry(
        &meta,
        &session,
        "SUPERADMIN_RESET_PASSWORD",
        "User",
        &id_text,
        None,
        &now_text,
    );
    match state
        .repos
        .uow
        .change_password(id, &hash, true, user.token_version, &now_text, &entry)
        .await
    {
        Ok(1) => {
            error::ok(json!({"message": "Contraseña restablecida; cambio obligatorio activado"}))
                .into_response()
        }
        Ok(_) => error::fail(
            StatusCode::CONFLICT,
            "SESSION_CHANGED",
            "La cuenta cambió durante la operación",
        )
        .into_response(),
        Err(e) => store_fail(&e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request},
        Router,
    };
    use logmaster_crypto::hash_password;
    use tower::ServiceExt;

    use crate::config::Config;
    use crate::http::build_router_with_state;
    use crate::session::SessionService;

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config::fixture()
    }

    fn test_state() -> (ApiState, SessionService) {
        let store = logmaster_store::Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state = ApiState::new(logmaster_store::Database::Sqlite(store), &test_config());
        let service = state.session.clone();
        (state, service)
    }

    async fn seed_root(state: &ApiState) -> i64 {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .repos
            .users
            .insert(&NewUser {
                username: "root",
                email: Some("root@example.test"),
                password_hash: &hash,
                role: "root",
                must_change_password: false,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap()
    }

    async fn token_for(service: &SessionService, state: &ApiState, user_id: i64) -> String {
        let user = state.repos.users.find_by_id(user_id).await.unwrap();
        service
            .issue(&Session::from_user(&user))
            .unwrap()
            .access_token
    }

    async fn request(
        router: Router,
        method: Method,
        uri: &str,
        token: Option<&str>,
        body: Option<&str>,
    ) -> (StatusCode, serde_json::Value) {
        let mut builder = Request::builder().method(method.clone()).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        if !matches!(method, Method::GET | Method::HEAD) {
            builder = builder.header("origin", APP_ORIGIN);
        }
        if body.is_some() {
            builder = builder.header("content-type", "application/json");
        }
        let request = builder
            .body(Body::from(body.unwrap_or_default().to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, value)
    }

    #[tokio::test]
    async fn superadmin_user_lifecycle() {
        let (state, service) = test_state();
        let root_id = seed_root(&state).await;
        let root = token_for(&service, &state, root_id).await;
        let router = build_router_with_state(state.clone());

        // Solo root: sin sesión 401; operador hipotético no existe
        // aún, así que se comprueba el 403 con un token de root
        // degradado creando antes un operador por HTTP.
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/superadmin/users",
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        // Crear operador.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/superadmin/users",
            Some(&root),
            Some(r#"{"username":"operador-s","password":"Private!Safe12Á","email":"op@example.test","role":"operador"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["mustChangePassword"], true);
        let user_id = body["data"]["id"].as_i64().unwrap();

        // Duplicado: 409 USERNAME_EXISTS.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/superadmin/users",
            Some(&root),
            Some(r#"{"username":"operador-s","password":"Private!Safe12Á","email":"otro@example.test","role":"operador"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"]["code"], "USERNAME_EXISTS");

        // Rol root no creable: 400.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/superadmin/users",
            Some(&root),
            Some(r#"{"username":"root2","password":"Private!Safe12Á","email":"r2@example.test","role":"root"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

        // Contraseña débil: 400.
        let (status, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/superadmin/users",
            Some(&root),
            Some(r#"{"username":"debil","password":"corta","email":"d@example.test","role":"operador"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Listar: root + operador.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/superadmin/users",
            Some(&root),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"].as_array().unwrap().len(), 2);

        // El operador no puede listar: 403.
        let operator = token_for(&service, &state, user_id).await;
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/superadmin/users",
            Some(&operator),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        // Actualizar rol y limpiar el correo (null).
        let (status, body) = request(
            router.clone(),
            Method::PUT,
            &format!("/api/v1/superadmin/users/{user_id}"),
            Some(&root),
            Some(r#"{"role":"auditor","email":null}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["role"], "auditor");
        assert_eq!(body["data"]["email"], Value::Null);

        // Cambiar el rol de root: 403.
        let (status, body) = request(
            router.clone(),
            Method::PUT,
            &format!("/api/v1/superadmin/users/{root_id}"),
            Some(&root),
            Some(r#"{"role":"admin"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "FORBIDDEN");

        // Reset con contraseña débil: 400 PASSWORD_POLICY_VIOLATION.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/superadmin/users/{user_id}/reset-password"),
            Some(&root),
            Some(r#"{"newPassword":"corta"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "PASSWORD_POLICY_VIOLATION");

        // Reset válido.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/superadmin/users/{user_id}/reset-password"),
            Some(&root),
            Some(r#"{"newPassword":"Nueva!Segura34Á"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");

        // Borrar root: 403 CANNOT_DELETE_ROOT.
        let (status, body) = request(
            router.clone(),
            Method::DELETE,
            &format!("/api/v1/superadmin/users/{root_id}"),
            Some(&root),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "CANNOT_DELETE_ROOT");

        // Borrar el operador: 200.
        let (status, body) = request(
            router.clone(),
            Method::DELETE,
            &format!("/api/v1/superadmin/users/{user_id}"),
            Some(&root),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");

        // Borrar inexistente: 404 USER_NOT_FOUND.
        let (status, body) = request(
            router.clone(),
            Method::DELETE,
            "/api/v1/superadmin/users/9999",
            Some(&root),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "USER_NOT_FOUND");
    }
}
