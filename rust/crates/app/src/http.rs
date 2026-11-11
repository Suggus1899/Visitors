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

use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::State, http::StatusCode, middleware, response::IntoResponse, routing::get, Json,
    Router,
};
use logmaster_store::Store;
use serde_json::json;

use crate::client_ip::TrustedPrefix;
use crate::config::Config;
use crate::error;
use crate::origin::{origin_and_csrf, origin_of, OriginConfig};
use crate::rate_limit::{rate_limit, RateLimitConfig, RateLimiter};
use crate::session::{session_middleware, SessionService};

/// Estado compartido por el router.
#[derive(Clone)]
pub struct ApiState {
    pub store: Store,
    pub session: SessionService,
    pub limiter: Arc<RateLimiter>,
    pub allowed_origins: Vec<String>,
    pub trusted_proxies: Vec<TrustedPrefix>,
    pub rate_max_requests: u32,
    pub rate_window: Duration,
}

impl ApiState {
    pub fn new(store: Store, config: &Config) -> Self {
        let allowed_origins = config
            .allowed_origins()
            .iter()
            .filter_map(|origin| origin_of(origin))
            .collect();
        Self {
            session: SessionService::new(config, store.clone()),
            store,
            limiter: Arc::new(RateLimiter::new()),
            allowed_origins,
            trusted_proxies: config.trusted_proxies.clone(),
            rate_max_requests: config.rate_max_requests,
            rate_window: Duration::from_millis(config.rate_window_ms),
        }
    }
}

/// Router completo: `/health` del proceso y `/api/v1/*`.
pub fn build_router(store: Store, config: &Config) -> Router {
    let state = ApiState::new(store, config);
    // Rutas protegidas: la sesion se valida antes que el permiso de
    // cada ruta (la capa de sesion es la mas interna de las dos).
    // Las rutas de dominio llegan en la fase 4.
    let protected = Router::new().layer(middleware::from_fn_with_state(
        state.session.clone(),
        session_middleware,
    ));
    let api = Router::new()
        .route("/health", get(api_health))
        .merge(protected)
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

/// Salud de la API: comprueba la base, como hoy comprueba PostgreSQL.
/// Si la base no responde, 503 con `DB_UNAVAILABLE`.
async fn api_health(State(state): State<ApiState>) -> impl IntoResponse {
    match state.store.ping() {
        Ok(()) => (
            StatusCode::OK,
            error::ok(json!({ "status": "ok", "database": "ok" })),
        )
            .into_response(),
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
    use logmaster_store::repos::users::{self as user_repos, NewUser};
    use tower::ServiceExt;

    use crate::cookies::{CSRF_COOKIE, CSRF_HEADER};
    use crate::roles::{authorize, require_permission, Permission};
    use crate::session::{Session, SessionService};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config {
            bind: "127.0.0.1".to_string(),
            port: 8443,
            db_path: "data/logmaster.db".into(),
            jwt_secret: "fixture-only-not-a-real-secret-fixture-only-not-a-real-secret-"
                .to_string(),
            refresh_secret: "fixture-refresh-secret-fixture-refresh-secret-fixture--".to_string(),
            encryption_key: [0x19u8; 32],
            edit_password: "fixture-edit-password".to_string(),
            access_ttl: Duration::from_secs(15 * 60),
            refresh_ttl: Duration::from_secs(7 * 24 * 3600),
            absolute_session_ttl: Duration::from_secs(7 * 24 * 3600),
            max_login_attempts: 5,
            lockout_minutes: 15,
            rate_window_ms: 60_000,
            rate_max_requests: 100,
            app_url: APP_ORIGIN.to_string(),
            cors_origins: vec![],
            trusted_proxies: vec![],
        }
    }

    fn test_state() -> (ApiState, SessionService) {
        let store = Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state = ApiState::new(store, &test_config());
        let service = state.session.clone();
        (state, service)
    }

    fn seed_user(state: &ApiState, username: &str, role: &str, must_change: bool) -> i64 {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .store
            .tx_immediate(|tx| {
                user_repos::insert(
                    tx,
                    &NewUser {
                        username,
                        email: Some("usuario@example.test"),
                        password_hash: &hash,
                        role,
                        must_change_password: must_change,
                        created_at: NOW,
                        updated_at: NOW,
                    },
                )
                .map_err(|e| anyhow::anyhow!(e.to_string()))
            })
            .unwrap()
    }

    fn token_for(service: &SessionService, state: &ApiState, user_id: i64) -> String {
        let user = state
            .store
            .read(|conn| user_repos::find_by_id(conn, user_id).map_err(anyhow::Error::from))
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
            let user_id = seed_user(&state, &format!("usuario-{role}"), role, false);
            let token = token_for(&service, &state, user_id);
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
        let user_id = seed_user(&state, "cambio-obligatorio", "operador", true);
        let token = token_for(&service, &state, user_id);
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
        let user_id = seed_user(&state, "por-cookie", "operador", false);
        let token = token_for(&service, &state, user_id);
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
