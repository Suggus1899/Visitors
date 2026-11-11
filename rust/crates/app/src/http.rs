//! Router HTTP (fases 1-3).
//!
//! Solo las dos rutas de salud. Las 59 rutas del contrato (ver
//! `rust/fixtures/routes.json`) llegan familia a familia en la fase 4,
//! cada una con su caso de la tabla de roles. Lo que ya esta cableado
//! es la pila de capas de la fase 3, en el mismo orden que Go
//! (`headers`, `limit`, `authenticate`):
//!
//! 1. Origen/Referer y CSRF (`origin.rs`).
//! 2. Limite de peticiones en memoria (`rate_limit.rs`).
//! 3. Sesion JWT (`session.rs`) en las rutas protegidas, con el
//!    permiso declarado por ruta (`roles.rs`).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::State, http::StatusCode, middleware, response::IntoResponse, routing::get, Json,
    Router,
};
use logmaster_store::{Database, Repositories};
use serde_json::json;

use crate::client_ip::TrustedPrefix;
use crate::config::Config;
use crate::error;
use crate::events::Events;
use crate::origin::{origin_and_csrf, origin_of, OriginConfig};
use crate::rate_limit::{rate_limit, RateLimitConfig, RateLimiter};
use crate::routes;
use crate::session::{session_middleware, SessionService};

/// Estado compartido por el router. La base es el enum `Database`:
/// el mismo router sirve SQLite y PostgreSQL; los handlers trabajan
/// solo contra `repos` (traits) y el hub `events`.
#[derive(Clone)]
pub struct ApiState {
    pub db: Database,
    pub repos: Repositories,
    pub session: SessionService,
    pub limiter: Arc<RateLimiter>,
    pub allowed_origins: Vec<String>,
    pub trusted_proxies: Vec<TrustedPrefix>,
    pub rate_max_requests: u32,
    pub rate_window: Duration,
    /// Clave de datos AES-256-GCM, para cifrar y descifrar perfiles.
    pub encryption_key: [u8; 32],
    /// Hub de avisos SSE.
    pub events: Events,
    /// Intentos de login antes del bloqueo (config).
    pub max_login_attempts: i64,
    /// Minutos de bloqueo tras agotar los intentos (config).
    pub lockout_minutes: i64,
    /// Días de retención de la bitácora (config).
    pub audit_retention_days: i64,
    /// Retención automática habilitada (config).
    pub retention_enabled: bool,
    /// Carpeta de respaldos (config).
    pub backup_path: Option<PathBuf>,
}

impl ApiState {
    pub fn new(db: Database, config: &Config) -> Self {
        let allowed_origins = config
            .allowed_origins()
            .iter()
            .filter_map(|origin| origin_of(origin))
            .collect();
        let repos = db.repositories();
        Self {
            session: SessionService::new(config, repos.users.clone()),
            db,
            repos,
            limiter: Arc::new(RateLimiter::new()),
            allowed_origins,
            trusted_proxies: config.trusted_proxies.clone(),
            rate_max_requests: config.rate_max_requests,
            rate_window: Duration::from_millis(config.rate_window_ms),
            encryption_key: config.encryption_key,
            events: Events::new(),
            max_login_attempts: config.max_login_attempts,
            lockout_minutes: config.lockout_minutes,
            audit_retention_days: config.audit_retention_days,
            retention_enabled: config.retention_enabled,
            backup_path: config.backup_path.clone(),
        }
    }
}

/// Router completo: `/health` del proceso y `/api/v1/*`.
pub fn build_router(db: Database, config: &Config) -> Router {
    build_router_with_state(ApiState::new(db, config))
}

/// Router a partir de un estado ya construido (lo usan las pruebas
/// de cada familia para sembrar usuarios sin arrancar el binario).
pub fn build_router_with_state(state: ApiState) -> Router {
    // Rutas protegidas: la sesion se valida antes que el permiso de
    // cada ruta (la capa de sesion es la mas interna de las dos).
    let protected = routes::protected_routes().layer(middleware::from_fn_with_state(
        state.session.clone(),
        session_middleware,
    ));
    let api = Router::new()
        .route("/health", get(api_health))
        .merge(protected)
        .merge(routes::public_routes())
        .layer(middleware::from_fn_with_state(
            RateLimitConfig {
                limiter: state.limiter.clone(),
                max_requests: state.rate_max_requests,
                window: state.rate_window,
                trusted_proxies: state.trusted_proxies.clone(),
            },
            rate_limit,
        ))
        .layer(middleware::from_fn_with_state(
            OriginConfig {
                allowed_origins: state.allowed_origins.clone(),
            },
            origin_and_csrf,
        ));
    Router::new()
        .route("/health", get(health))
        .nest("/api/v1", api)
        .merge(crate::ui::router(state.clone()))
        .with_state(state)
}

/// Salud del proceso (equivalente a `/health` de Next.js).
async fn health() -> Json<serde_json::Value> {
    error::ok(json!({
        "status": "ok",
        "service": "logmaster",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// Salud de la API: ejecuta la prueba real de conexion contra el
/// motor configurado (`SELECT version()` en PostgreSQL,
/// `SELECT 1` + `integrity_check` en SQLite) y reporta motor,
/// version, latencia y version de esquema. `database: ok` solo si
/// la prueba pasa; si no, 503 con `DB_UNAVAILABLE`.
async fn api_health(State(state): State<ApiState>) -> impl IntoResponse {
    match state.db.test_connection().await {
        Ok(probe) => {
            let mut body = serde_json::Map::new();
            body.insert("status".to_string(), json!("ok"));
            body.insert("database".to_string(), json!("ok"));
            body.insert("engine".to_string(), json!(probe.engine));
            body.insert("version".to_string(), json!(probe.version));
            body.insert("latency_ms".to_string(), json!(probe.latency_ms));
            body.insert("schema_version".to_string(), json!(probe.schema_version));
            if let Some(host) = probe.host {
                body.insert("host".to_string(), json!(host));
            }
            if let Some(port) = probe.port {
                body.insert("port".to_string(), json!(port));
            }
            if let Some(database) = probe.database {
                body.insert("database_name".to_string(), json!(database));
            }
            if let Some(path) = probe.path {
                body.insert("path".to_string(), json!(path.to_string_lossy()));
            }
            (StatusCode::OK, error::ok(serde_json::Value::Object(body))).into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "la base no responde al health check");
            error::fail(
                StatusCode::SERVICE_UNAVAILABLE,
                "DB_UNAVAILABLE",
                "la base de datos no responde",
            )
            .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request},
        middleware as axum_middleware,
        routing::{get, patch},
    };
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use logmaster_store::{Database, Store};
    use tower::ServiceExt;

    use crate::cookies::{CSRF_COOKIE, CSRF_HEADER};
    use crate::roles::{authorize, require_permission, Permission};
    use crate::session::{Session, SessionService};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config::fixture()
    }

    fn test_state() -> (ApiState, SessionService) {
        let store = Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state = ApiState::new(Database::Sqlite(store), &test_config());
        let service = state.session.clone();
        (state, service)
    }

    async fn seed_user(state: &ApiState, username: &str, role: &str, must_change: bool) -> i64 {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .db
            .repositories()
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
            .unwrap()
    }

    async fn token_for(service: &SessionService, state: &ApiState, user_id: i64) -> String {
        let user = state
            .db
            .repositories()
            .users
            .find_by_id(user_id)
            .await
            .unwrap();
        service
            .issue(&Session::from_user(&user))
            .unwrap()
            .access_token
    }

    /// Router de prueba con las rutas de `permissions_test.go` de Go y
    /// handlers tontos que devuelven 200: lo que se comprueba es la
    /// pila real (origen, limite, sesion, permiso), no el dominio.
    /// El PATCH de visitante reproduce Go: la ruta exige
    /// `EditProfile` y el campo `isBlocked` exige ademas `BlockVisitor`.
    fn matrix_router(state: ApiState) -> Router {
        async fn ok() -> Json<serde_json::Value> {
            error::ok(json!({ "ok": true }))
        }
        async fn edit_visitor(
            session: Session,
            body: axum::body::Bytes,
        ) -> axum::response::Response {
            if let Err(failure) = authorize(&session, Permission::EditProfile) {
                return failure.into_response();
            }
            if String::from_utf8_lossy(&body).contains("isBlocked") {
                if let Err(failure) = authorize(&session, Permission::BlockVisitor) {
                    return failure.into_response();
                }
            }
            error::ok(json!({ "ok": true })).into_response()
        }
        let protected = Router::new()
            .route("/visitors/{cedula}", get(ok).patch(edit_visitor))
            .route("/visitors/{cedula}/edit-history", get(ok))
            .route("/visits/active", get(ok))
            .route(
                "/superadmin/users",
                get(ok).layer(axum_middleware::from_fn_with_state(
                    Permission::ManageAccounts,
                    require_permission,
                )),
            )
            .route(
                "/privacy/subjects/{cedula}",
                get(ok).layer(axum_middleware::from_fn_with_state(
                    Permission::ReadArco,
                    require_permission,
                )),
            )
            .route("/auth/session", get(ok))
            .route("/auth/change-password", patch(ok))
            .layer(axum_middleware::from_fn_with_state(
                state.session.clone(),
                session_middleware,
            ));
        Router::new()
            .nest("/api/v1", protected)
            .layer(axum_middleware::from_fn_with_state(
                RateLimitConfig {
                    limiter: state.limiter.clone(),
                    max_requests: state.rate_max_requests,
                    window: state.rate_window,
                    trusted_proxies: state.trusted_proxies.clone(),
                },
                rate_limit,
            ))
            .layer(axum_middleware::from_fn_with_state(
                OriginConfig {
                    allowed_origins: state.allowed_origins.clone(),
                },
                origin_and_csrf,
            ))
            .with_state(state)
    }

    async fn request(
        router: Router,
        method: Method,
        uri: &str,
        token: Option<&str>,
        body: Option<&str>,
    ) -> (StatusCode, serde_json::Value) {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        if body.is_some() {
            builder = builder.header("origin", APP_ORIGIN);
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

    /// Traduccion de `TestRoleMatrixIntegration` de Go
    /// (`permissions_test.go`): mismo rol, misma ruta, mismo resultado
    /// esperado, con tokens JWT reales y la pila real de capas.
    #[tokio::test]
    async fn role_matrix_matches_go_permissions_test() {
        let (state, service) = test_state();
        let edit_body = r#"{"editPassword":"fixture-edit-password","firstName":"Visitante"}"#;
        let block_body = r#"{"editPassword":"fixture-edit-password","isBlocked":false}"#;
        for role in ["root", "admin", "operador", "auditor", "demo"] {
            let user_id = seed_user(&state, &format!("usuario-{role}"), role, false).await;
            let token = token_for(&service, &state, user_id).await;
            let router = matrix_router(state.clone());
            for path in [
                "/api/v1/visitors/V-98989102",
                "/api/v1/visitors/V-98989102/edit-history",
                "/api/v1/visits/active",
            ] {
                let (status, _) =
                    request(router.clone(), Method::GET, path, Some(&token), None).await;
                assert_eq!(status, StatusCode::OK, "lectura {path} con rol {role}");
            }
            let expected = if role == "auditor" || role == "demo" {
                StatusCode::FORBIDDEN
            } else {
                StatusCode::OK
            };
            let (status, _) = request(
                router.clone(),
                Method::PATCH,
                "/api/v1/visitors/V-98989102",
                Some(&token),
                Some(edit_body),
            )
            .await;
            assert_eq!(status, expected, "editar con rol {role}");
            let expected = if role == "root" || role == "admin" {
                StatusCode::OK
            } else {
                StatusCode::FORBIDDEN
            };
            let (status, _) = request(
                router.clone(),
                Method::PATCH,
                "/api/v1/visitors/V-98989102",
                Some(&token),
                Some(block_body),
            )
            .await;
            assert_eq!(status, expected, "bloquear con rol {role}");
            let expected = if role == "root" {
                StatusCode::OK
            } else {
                StatusCode::FORBIDDEN
            };
            let (status, _) = request(
                router.clone(),
                Method::GET,
                "/api/v1/superadmin/users",
                Some(&token),
                None,
            )
            .await;
            assert_eq!(status, expected, "cuentas con rol {role}");
            let expected = if role == "root" || role == "admin" || role == "auditor" {
                StatusCode::OK
            } else {
                StatusCode::FORBIDDEN
            };
            let (status, _) = request(
                router.clone(),
                Method::GET,
                "/api/v1/privacy/subjects/V-98989102",
                Some(&token),
                None,
            )
            .await;
            assert_eq!(status, expected, "privacidad con rol {role}");
        }
    }

    #[tokio::test]
    async fn session_layer_rejects_anonymous_and_enforces_must_change() {
        let (state, service) = test_state();
        let router = matrix_router(state.clone());
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits/active",
            None,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"]["code"], "UNAUTHORIZED");

        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits/active",
            Some("token-invalido"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        // Con cambio obligatorio: solo sesion y cambio de contrasena.
        let user_id = seed_user(&state, "cambio-obligatorio", "operador", true).await;
        let token = token_for(&service, &state, user_id).await;
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits/active",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "PASSWORD_CHANGE_REQUIRED");
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/auth/session",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }

    #[tokio::test]
    async fn cookie_auth_requires_csrf_on_writes() {
        let (state, service) = test_state();
        let user_id = seed_user(&state, "por-cookie", "operador", false).await;
        let token = token_for(&service, &state, user_id).await;
        let edit_body = r#"{"editPassword":"fixture-edit-password","firstName":"Visitante"}"#;

        // GET por cookie funciona sin CSRF.
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/visits/active")
            .header("cookie", format!("__Host-logmaster-access={token}"))
            .body(Body::empty())
            .unwrap();
        let response = matrix_router(state.clone()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // PATCH por cookie sin CSRF: 403.
        let request = Request::builder()
            .method(Method::PATCH)
            .uri("/api/v1/visitors/V-98989102")
            .header("origin", APP_ORIGIN)
            .header("cookie", format!("__Host-logmaster-access={token}"))
            .body(Body::from(edit_body))
            .unwrap();
        let response = matrix_router(state.clone()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        // PATCH por cookie con CSRF valido (doble envio): 200.
        let request = Request::builder()
            .method(Method::PATCH)
            .uri("/api/v1/visitors/V-98989102")
            .header("origin", APP_ORIGIN)
            .header(
                "cookie",
                format!("__Host-logmaster-access={token}; {CSRF_COOKIE}=csrf-123"),
            )
            .header(CSRF_HEADER, "csrf-123")
            .body(Body::from(edit_body))
            .unwrap();
        let response = matrix_router(state.clone()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // PATCH con origen no permitido: 403 aunque el token valga.
        let request = Request::builder()
            .method(Method::PATCH)
            .uri("/api/v1/visitors/V-98989102")
            .header("origin", "https://atacante.example")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::from(edit_body))
            .unwrap();
        let response = matrix_router(state.clone()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
