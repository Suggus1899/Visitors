//! Frontend Leptos con SSR (fase 5, documento §9).
//!
//! Las páginas se renderizan en el servidor con componentes Leptos
//! (`view!{...}.to_html()`) dentro de la cáscara de `layout` y se
//! sirven desde el mismo binario que la API. La hidratación con
//! WebAssembly queda fuera de esta fase: la interactividad la dan los
//! formularios HTML y el JS mínimo de `app.js` (fetch a `/api/v1`,
//! SSE y cámara), así que los recorridos de aceptación no dependen
//! de ella. Ninguna página reimplementa lógica de dominio: las
//! lecturas van por los traits de repositorio (la misma capa que la
//! API de la fase 4) y todas las escrituras van por `fetch` a la API.

pub mod components;
pub mod data;
pub mod guard;
pub mod layout;
pub mod pages;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};

use crate::http::ApiState;

/// Rutas web. Las públicas no llevan guardia; las protegidas
/// redirigen a `/login` sin sesión (no devuelven 401 JSON).
pub fn router(state: ApiState) -> Router<ApiState> {
    let protected = Router::new()
        .route("/", get(pages::home_page))
        .route("/visits/{id}", get(pages::visit_page))
        .route("/visitors/{cedula}", get(pages::visitor_page))
        .route("/admin", get(pages::admin_page))
        .route("/change-password", get(pages::change_password_page))
        .route("/logout", post(pages::logout))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            guard::ui_session,
        ));
    Router::new()
        .route("/login", get(pages::login_page))
        .route("/forgot-password", get(pages::forgot_page))
        .route("/reset-password", get(pages::reset_page))
        .merge(protected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{header, HeaderMap, Method, Request, StatusCode},
    };
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use tower::ServiceExt;

    use crate::http::build_router_with_state;
    use crate::session::{Session, SessionService};

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

    fn test_state() -> (ApiState, SessionService) {
        let store = logmaster_store::Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state = ApiState::new(logmaster_store::Database::Sqlite(store), &test_config());
        let service = state.session.clone();
        (state, service)
    }

    async fn seed_user(state: &ApiState, username: &str, role: &str) -> i64 {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .repos
            .users
            .insert(&NewUser {
                username,
                email: Some("usuario@example.test"),
                password_hash: &hash,
                role,
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
        cookie: Option<&str>,
    ) -> (StatusCode, HeaderMap, String) {
        request_full(router, method, uri, cookie, None, None).await
    }

    async fn request_full(
        router: Router,
        method: Method,
        uri: &str,
        cookie: Option<&str>,
        bearer: Option<&str>,
        body: Option<&str>,
    ) -> (StatusCode, HeaderMap, String) {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            builder = builder.header(header::COOKIE, cookie);
        }
        if let Some(bearer) = bearer {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {bearer}"));
        }
        if body.is_some() {
            builder = builder.header(header::ORIGIN, APP_ORIGIN);
            builder = builder.header(header::CONTENT_TYPE, "application/json");
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
        (
            status,
            headers,
            String::from_utf8_lossy(&bytes).into_owned(),
        )
    }

    async fn login_token(router: Router, username: &str) -> String {
        let body = serde_json::json!({
            "username": username,
            "password": "Private!Safe12Á",
        })
        .to_string();
        let (status, _, text) = request_full(
            router,
            Method::POST,
            "/api/v1/auth/login",
            None,
            None,
            Some(&body),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "login de {username}: {text}");
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        value["data"]["accessToken"].as_str().unwrap().to_string()
    }

    async fn login_cookie(router: Router, username: &str) -> String {
        let token = login_token(router, username).await;
        format!("__Host-logmaster-access={token}")
    }

    async fn checkin_waiting(router: Router, token: &str) -> i64 {
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let body = serde_json::json!({
            "visitorCedula": "V-12345678",
            "purpose": "Reunión",
            "personToVisit": "Anfitrión",
            "targetDepartment": "Producción",
            "hostPerson": "Jefe",
            "status": "waiting",
            "visitorData": {"firstName": "Ana", "lastName": "Pérez", "company": "Trébol"},
            "consent": {"accepted": true, "policyVersion": "v1", "acceptedAt": now},
        })
        .to_string();
        let (status, _, text) = request_full(
            router,
            Method::POST,
            "/api/v1/visits/checkin",
            None,
            Some(token),
            Some(&body),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "check-in: {text}");
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        value["data"]["id"].as_i64().unwrap()
    }

    #[tokio::test]
    async fn login_page_renders_form() {
        let (state, _) = test_state();
        let router = build_router_with_state(state);
        let (status, headers, body) = request(router, Method::GET, "/login", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(headers
            .get(header::CONTENT_TYPE)
            .unwrap()
            .to_str()
            .unwrap()
            .contains("text/html"));
        assert!(body.contains("Iniciar sesión"));
        assert!(body.contains("id=\"login-form\""));
        assert!(body.contains("LogMaster"));
    }

    #[tokio::test]
    async fn forgot_and_reset_pages_render() {
        let (state, _) = test_state();
        let router = build_router_with_state(state.clone());
        let (status, _, body) = request(router, Method::GET, "/forgot-password", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Recuperar contraseña"));
        assert!(body.contains("id=\"forgot-form\""));

        let (status, _, body) = request(
            build_router_with_state(state),
            Method::GET,
            "/reset-password?token=abc123",
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("id=\"reset-form\""));
        assert!(body.contains("value=\"abc123\""));

        // Sin token, la página avisa en vez de romper.
        let (state, _) = test_state();
        let (status, _, body) = request(
            build_router_with_state(state),
            Method::GET,
            "/reset-password",
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Falta el enlace de recuperación"));
    }

    #[tokio::test]
    async fn protected_pages_redirect_anonymous_to_login() {
        let (state, _) = test_state();
        let router = build_router_with_state(state);
        let (status, headers, _) = request(router, Method::GET, "/change-password", None).await;
        assert_eq!(status, StatusCode::FOUND);
        assert_eq!(
            headers.get(header::LOCATION).unwrap().to_str().unwrap(),
            "/login?returnTo=/change-password"
        );
    }

    #[tokio::test]
    async fn change_password_page_renders_for_session_and_login_redirects() {
        let (state, service) = test_state();
        let user_id = seed_user(&state, "operador", "operador").await;
        let token = token_for(&service, &state, user_id).await;
        let cookie = format!("__Host-logmaster-access={token}");
        let router = build_router_with_state(state.clone());
        let (status, _, body) =
            request(router, Method::GET, "/change-password", Some(&cookie)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Cambiar contraseña"));
        assert!(body.contains("id=\"change-password-form\""));

        // Con sesión, /login redirige al destino.
        let (status, headers, _) = request(
            build_router_with_state(state),
            Method::GET,
            "/login?returnTo=/admin",
            Some(&cookie),
        )
        .await;
        assert_eq!(status, StatusCode::FOUND);
        assert_eq!(
            headers.get(header::LOCATION).unwrap().to_str().unwrap(),
            "/admin"
        );
    }

    #[tokio::test]
    async fn logout_by_cookie_revokes_session() {
        let (state, service) = test_state();
        let user_id = seed_user(&state, "operador", "operador").await;
        let token = token_for(&service, &state, user_id).await;
        let cookie = format!("__Host-logmaster-access={token}");
        let router = build_router_with_state(state.clone());
        let (status, headers, body) = request(router, Method::POST, "/logout", Some(&cookie)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("\"revoked\":true"));
        assert!(headers
            .get_all(header::SET_COOKIE)
            .iter()
            .all(|v| v.to_str().unwrap().contains("Max-Age=0")));

        // La sesión ya no vale: la página protegida redirige al login.
        let (status, _, _) = request(
            build_router_with_state(state),
            Method::GET,
            "/change-password",
            Some(&cookie),
        )
        .await;
        assert_eq!(status, StatusCode::FOUND);
    }

    #[tokio::test]
    async fn home_redirects_anonymous_and_forbids_auditor() {
        let (state, _) = test_state();
        let (status, headers, _) =
            request(build_router_with_state(state), Method::GET, "/", None).await;
        assert_eq!(status, StatusCode::FOUND);
        assert_eq!(
            headers.get(header::LOCATION).unwrap().to_str().unwrap(),
            "/login?returnTo=/"
        );

        let (state, _) = test_state();
        seed_user(&state, "auditor", "auditor").await;
        let router = build_router_with_state(state);
        let cookie = login_cookie(router.clone(), "auditor").await;
        let (status, _, body) = request(router, Method::GET, "/", Some(&cookie)).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(body.contains("Sin permiso"));
    }

    #[tokio::test]
    async fn operation_flow_renders_lists_and_details() {
        let (state, _) = test_state();
        seed_user(&state, "operador", "operador").await;
        let router = build_router_with_state(state);
        let token = login_token(router.clone(), "operador").await;
        let cookie = format!("__Host-logmaster-access={token}");
        let visit_id = checkin_waiting(router.clone(), &token).await;

        let (status, _, body) = request(router.clone(), Method::GET, "/", Some(&cookie)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Punto de control"));
        assert!(body.contains("Ana Pérez"));
        assert!(body.contains("Registrar check-in"));
        assert!(body.contains("id=\"listas-vivo\""));
        assert!(body.contains("En espera"));

        let (status, _, body) = request(
            router.clone(),
            Method::GET,
            &format!("/visits/{visit_id}"),
            Some(&cookie),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Reunión"));
        assert!(body.contains("Admitir"));
        assert!(body.contains("Cancelar visita"));

        let (status, _, body) = request(
            router.clone(),
            Method::GET,
            "/visitors/V-12345678",
            Some(&cookie),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Ana Pérez"));
        assert!(body.contains("Trébol"));
        assert!(body.contains("Editar perfil"));

        // Visita inexistente: 404 con la cáscara.
        let (status, _, body) = request(router, Method::GET, "/visits/999999", Some(&cookie)).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert!(body.contains("No se pudo cargar la página"));
    }

    #[tokio::test]
    async fn demo_sees_lists_without_checkin_form() {
        let (state, _) = test_state();
        seed_user(&state, "demo", "demo").await;
        let router = build_router_with_state(state);
        let cookie = login_cookie(router.clone(), "demo").await;
        let (status, _, body) = request(router, Method::GET, "/", Some(&cookie)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Punto de control"));
        assert!(!body.contains("Registrar check-in"));
    }

    #[tokio::test]
    async fn admin_page_gates_roles_and_renders_tabs() {
        let (state, _) = test_state();
        seed_user(&state, "operador", "operador").await;
        seed_user(&state, "auditor", "auditor").await;
        seed_user(&state, "admin", "admin").await;
        let router = build_router_with_state(state);
        let token_admin = login_token(router.clone(), "admin").await;
        let cookie_admin = format!("__Host-logmaster-access={token_admin}");
        let token_op = login_token(router.clone(), "operador").await;
        checkin_waiting(router.clone(), &token_op).await;

        let cookie_op = format!("__Host-logmaster-access={token_op}");
        let (status, _, _) = request(router.clone(), Method::GET, "/admin", Some(&cookie_op)).await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        let cookie_aud = login_cookie(router.clone(), "auditor").await;
        let (status, _, _) =
            request(router.clone(), Method::GET, "/admin", Some(&cookie_aud)).await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        let (status, _, body) =
            request(router.clone(), Method::GET, "/admin", Some(&cookie_admin)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Administración"));
        assert!(body.contains("Historial"));
        assert!(body.contains("Ana Pérez"));
        assert!(body.contains("Reunión"));

        let (status, _, body) = request(
            router.clone(),
            Method::GET,
            "/admin?tab=visitors",
            Some(&cookie_admin),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        eprintln!(
            "VISITORS BODY: {}",
            &body[body.find("<main>").unwrap_or(0)..]
        );
        assert!(body.contains("Ana Pérez"));
        assert!(body.contains("Trébol"));

        let (status, _, body) = request(
            router.clone(),
            Method::GET,
            "/admin?tab=catalogs",
            Some(&cookie_admin),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Departamentos"));
        assert!(body.contains("Propósitos"));

        let (status, _, body) = request(
            router.clone(),
            Method::GET,
            "/admin?tab=backups",
            Some(&cookie_admin),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Carpeta de respaldos no configurada"));
    }
}
