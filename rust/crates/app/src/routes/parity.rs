//! Prueba de paridad de rutas contra `rust/fixtures/routes.json`
//! (59 rutas del contrato).
//!
//! Por ruta se comprueba: método y path existen, protección por
//! sesión (401 sin sesión en las protegidas), rol permitido (la ruta
//! responde sin 401/403 y sin 404 vacío de Axum ni 405) y rol
//! denegado (403). Los roles vienen de los `roles(...)` de Go, no del
//! campo `middleware` del fixture (que trae los nombres del BFF viejo
//! en TypeScript). La ruta `/api/v1/auth/renew` no está en el fixture
//! (es una ruta de Next.js añadida en Rust) y se cubre en los tests
//! de auth.
//!
//! Desviación conocida, fuera de esta fase: Axum devuelve 404/405
//! sin el sobre de error para rutas o métodos desconocidos, mientras
//! que Go devuelve `NOT_FOUND`/`METHOD_NOT_ALLOWED` con el sobre.

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
    };
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use serde_json::Value;
    use tower::ServiceExt;

    use crate::config::Config;
    use crate::http::build_router_with_state;
    use crate::session::Session;

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config::fixture()
    }

    const ROLES: [&str; 5] = ["root", "admin", "operador", "auditor", "demo"];

    /// Roles permitidos por ruta, según los `roles(...)` de Go.
    /// `None` = cualquier sesión vigente.
    fn allowed_roles(method: &str, path: &str) -> Option<&'static [&'static str]> {
        let read_audit: &[&str] = &["admin", "root", "auditor"];
        let manage_arco: &[&str] = &["admin", "root"];
        let write: &[&str] = &["operador", "admin", "root"];
        let admin_root: &[&str] = &["admin", "root"];
        if path.starts_with("/api/v1/audit/") {
            return Some(read_audit);
        }
        if path.starts_with("/api/v1/superadmin/") {
            return Some(&["root"]);
        }
        if path.starts_with("/api/v1/backups") {
            return Some(admin_root);
        }
        if path.starts_with("/api/v1/privacy/arco-requests") && method == "GET" {
            return Some(read_audit);
        }
        if path.starts_with("/api/v1/privacy/subjects/") && method == "GET" {
            return Some(read_audit);
        }
        if path.contains("/privacy/subjects/") && (method == "DELETE" || path.ends_with("/status"))
        {
            return Some(manage_arco);
        }
        if path.starts_with("/api/v1/privacy/arco-requests/") && path.ends_with("/status") {
            return Some(manage_arco);
        }
        if path.starts_with("/api/v1/privacy/") {
            return Some(write);
        }
        if path == "/api/v1/visitors/verify-edit-password"
            || (path.starts_with("/api/v1/visitors/") && method == "PATCH")
        {
            return Some(write);
        }
        if path.starts_with("/api/v1/visits/") && method == "POST" {
            return Some(write);
        }
        None
    }

    async fn call(
        router: &axum::Router,
        method: Method,
        uri: &str,
        token: Option<&str>,
    ) -> (StatusCode, Vec<u8>) {
        let mut builder = Request::builder().method(method.clone()).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        if !matches!(method, Method::GET | Method::HEAD) {
            builder = builder.header("origin", APP_ORIGIN);
            builder = builder.header("content-type", "application/json");
        }
        let body = if matches!(method, Method::GET | Method::HEAD) {
            Body::empty()
        } else {
            Body::from("{}")
        };
        let request = builder.body(body).unwrap();
        let response = router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        // El SSE no termina: solo se mira el estado y se suelta.
        if uri.ends_with("/events/visits") && status.is_success() {
            return (status, Vec::new());
        }
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec();
        (status, bytes)
    }

    #[tokio::test]
    async fn all_59_fixture_routes() {
        let raw = include_str!("../../../../fixtures/routes.json");
        let routes: Vec<Value> = serde_json::from_str(raw).unwrap();
        assert_eq!(routes.len(), 59, "el fixture debe traer 59 rutas");

        let store = logmaster_store::Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state =
            crate::http::ApiState::new(logmaster_store::Database::Sqlite(store), &test_config());
        let hash = hash_password("Private!Safe12Á").unwrap();
        let mut tokens = std::collections::HashMap::new();
        for role in ROLES {
            let id = state
                .repos
                .users
                .insert(&NewUser {
                    username: role,
                    email: Some("u@example.test"),
                    password_hash: &hash,
                    role,
                    must_change_password: false,
                    created_at: NOW,
                    updated_at: NOW,
                })
                .await
                .unwrap();
            let user = state.repos.users.find_by_id(id).await.unwrap();
            let token = state
                .session
                .issue(&Session::from_user(&user))
                .unwrap()
                .access_token;
            tokens.insert(role, token);
        }
        let router = build_router_with_state(state.clone());

        for route in &routes {
            let method = Method::from_bytes(route["method"].as_str().unwrap().as_bytes()).unwrap();
            let path = route["path"].as_str().unwrap();
            // Parámetros de ruta con valores plausibles.
            let uri = path
                .replace(":filename", "backup-20261110-01.dump")
                .replace(":visitId", "1")
                .replace(":cedula", "V-12345678")
                .replace(":id", "1");
            let protected = route["protected"].as_bool().unwrap();

            if !protected {
                // Pública: nunca 404 vacío ni 405; `health` es 200.
                let (status, body) = call(&router, method.clone(), &uri, None).await;
                if path.ends_with("/health") {
                    assert_eq!(status, StatusCode::OK, "{method} {path}");
                } else {
                    assert_ne!(status, StatusCode::METHOD_NOT_ALLOWED, "{method} {path}");
                    assert!(
                        status != StatusCode::NOT_FOUND || is_envelope(&body),
                        "{method} {path} -> 404 sin sobre"
                    );
                }
                continue;
            }

            // Sin sesión: 401.
            let (status, _) = call(&router, method.clone(), &uri, None).await;
            assert_eq!(
                status,
                StatusCode::UNAUTHORIZED,
                "{method} {path} sin sesión"
            );

            let allowed = allowed_roles(method.as_str(), path);
            for role in ROLES {
                let token = tokens.get(role).unwrap();
                let (status, body) = call(&router, method.clone(), &uri, Some(token)).await;
                let permitted = allowed.is_none_or(|list| list.contains(&role));
                if permitted {
                    // Un 403 con otro código (p. ej. INVALID_EDIT_PASSWORD
                    // en rectificar/editar sin la contraseña adicional)
                    // no es una denegación de rol: solo FORBIDDEN lo es.
                    let code = error_code(&body);
                    assert_ne!(
                        (status, code.as_deref()),
                        (StatusCode::FORBIDDEN, Some("FORBIDDEN")),
                        "{method} {path} con {role}"
                    );
                    assert_ne!(
                        status,
                        StatusCode::UNAUTHORIZED,
                        "{method} {path} con {role}"
                    );
                    assert_ne!(
                        status,
                        StatusCode::METHOD_NOT_ALLOWED,
                        "{method} {path} con {role}"
                    );
                    assert!(
                        status != StatusCode::NOT_FOUND || is_envelope(&body),
                        "{method} {path} con {role} -> 404 sin sobre"
                    );
                } else {
                    assert_eq!(
                        status,
                        StatusCode::FORBIDDEN,
                        "{method} {path} con {role} debe ser 403"
                    );
                    assert_eq!(
                        error_code(&body).as_deref(),
                        Some("FORBIDDEN"),
                        "{method} {path} con {role} debe ser FORBIDDEN"
                    );
                }
            }
        }
    }

    /// ¿El cuerpo es el sobre de error de la API (y no el 404 vacío
    /// de Axum para rutas inexistentes)?
    fn is_envelope(body: &[u8]) -> bool {
        serde_json::from_slice::<Value>(body).is_ok_and(|value| value.get("error").is_some())
    }

    /// Código de error del sobre (`error.code`), si lo hay.
    fn error_code(body: &[u8]) -> Option<String> {
        serde_json::from_slice::<Value>(body)
            .ok()
            .and_then(|value| value["error"]["code"].as_str().map(str::to_string))
    }

    #[tokio::test]
    async fn wrong_method_is_405_on_known_paths() {
        let store = logmaster_store::Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state =
            crate::http::ApiState::new(logmaster_store::Database::Sqlite(store), &test_config());
        let hash = hash_password("Private!Safe12Á").unwrap();
        let id = state
            .repos
            .users
            .insert(&NewUser {
                username: "operador",
                email: Some("u@example.test"),
                password_hash: &hash,
                role: "operador",
                must_change_password: false,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap();
        let user = state.repos.users.find_by_id(id).await.unwrap();
        let token = state
            .session
            .issue(&Session::from_user(&user))
            .unwrap()
            .access_token;
        let router = build_router_with_state(state.clone());
        // Path que existe con otro método → 405 de Axum. Solo vale
        // para rutas sin capa de permiso propia: en las que la tienen,
        // la capa corre antes y un rol denegado da 403.
        for (method, uri) in [
            (Method::GET, "/api/v1/auth/login"),
            (Method::POST, "/api/v1/visits/waiting"),
            (Method::POST, "/api/v1/visitors/companies"),
            (Method::DELETE, "/api/v1/reports/stats"),
        ] {
            let (status, _) = call(&router, method.clone(), uri, Some(&token)).await;
            assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED, "{method} {uri}");
        }
    }
}
