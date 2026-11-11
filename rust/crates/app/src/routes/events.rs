//! Familia `events` (1 ruta): `GET /api/v1/events/visits` (SSE).
//!
//! Traducción de `server-go/internal/httpapi/events.go`: el aviso solo
//! dice «algo cambió» (tipo, instante y, cuando lo hay, id de visita)
//! y el cliente vuelve a consultar; sin payload de datos. Al conectar
//! se envía `system:connected`, luego un `:heartbeat` cada 25 s, y en
//! cada evento y cada latido se revalida el token de acceso (revocado
//! o con cambio obligatorio pendiente → se cierra el flujo); además
//! hay un temporizador en la expiración del token. Como Go, como mucho
//! 256 suscriptores (503 `STREAM_CAPACITY`).
//!
//! La publicación ocurre después del commit, nunca dentro de la
//! transacción (las rutas de visitas, visitantes y privacidad ya
//! publican con `Events::publish`).

use std::convert::Infallible;
use std::time::Duration;

use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    middleware,
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::get,
    Router,
};
use chrono::Utc;
use futures_util::stream::{self};
use tokio::time::Instant;

use crate::cookies::{cookie_value, ACCESS_COOKIE};
use crate::error;
use crate::events::{Subscription, VisitEvent, HEARTBEAT_INTERVAL};
use crate::http::ApiState;
use crate::roles::{require_permission, Permission};
use crate::session::{Session, SessionService};

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    Router::new()
        .route("/events/visits", get(visit_events))
        .layer(middleware::from_fn_with_state(
            Permission::Read,
            require_permission,
        ))
}

/// Token de acceso de la petición, igual que la capa de sesión:
/// `Authorization: Bearer` o la cookie `__Host-logmaster-access`.
fn access_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| cookie_value(headers, ACCESS_COOKIE))
}

async fn visit_events(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
) -> Response {
    let Some(subscription) = state.events.subscribe() else {
        return error::fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "STREAM_CAPACITY",
            "Capacidad de eventos alcanzada",
        )
        .into_response();
    };
    let token = access_token(&headers).unwrap_or_default();
    let service = state.session.clone();
    // Temporizador de expiración del token (como Go); si no hay fecha,
    // la revalidación de cada latido sigue cerrando el flujo a tiempo.
    let deadline = session
        .expires_at
        .or(session.absolute_expires_at)
        .map(|at| {
            Instant::now()
                + at.signed_duration_since(Utc::now())
                    .to_std()
                    .unwrap_or(Duration::ZERO)
        });
    let stream = sse_stream(subscription, service, token, deadline);
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::CACHE_CONTROL,
        "private, no-store, no-transform".parse().unwrap(),
    );
    response_headers.insert("X-Accel-Buffering", "no".parse().unwrap());
    (response_headers, Sse::new(stream)).into_response()
}

fn sse_stream(
    subscription: Subscription,
    service: SessionService,
    token: String,
    deadline: Option<Instant>,
) -> impl futures_util::stream::Stream<Item = Result<Event, Infallible>> + Send {
    // Estado del `unfold`: suscripción, latido, token y expiración.
    struct Flow {
        subscription: Subscription,
        heartbeat: tokio::time::Interval,
        service: SessionService,
        token: String,
        deadline: Option<Instant>,
        connected_sent: bool,
    }
    let mut flow = Flow {
        subscription,
        heartbeat: tokio::time::interval(HEARTBEAT_INTERVAL),
        service,
        token,
        deadline,
        connected_sent: false,
    };
    // El primer tick del intervalo es inmediato; se descarta para que
    // el primer latido llegue a los 25 s, como en Go.
    flow.heartbeat.reset();
    stream::unfold(flow, |mut flow| async move {
        if !flow.connected_sent {
            flow.connected_sent = true;
            let event = VisitEvent {
                kind: "system:connected".to_string(),
                timestamp: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true),
                visit_id: None,
            };
            let data = serde_json::to_string(&event).ok()?;
            return Some((Ok(Event::default().data(data)), flow));
        }
        let tick = flow.heartbeat.tick();
        let recv = flow.subscription.receiver.recv();
        let expiry = async {
            match flow.deadline {
                Some(at) => tokio::time::sleep_until(at).await,
                None => std::future::pending().await,
            }
        };
        tokio::select! {
            _ = expiry => None,
            _ = tick => {
                if !valid_session(&flow.service, &flow.token).await {
                    return None;
                }
                Some((Ok(Event::default().comment("heartbeat")), flow))
            }
            result = recv => {
                match result {
                    Ok(event) => {
                        if !valid_session(&flow.service, &flow.token).await {
                            return None;
                        }
                        let data = serde_json::to_string(&event).ok()?;
                        Some((Ok(Event::default().data(data)), flow))
                    }
                    // Suscriptor lento: Go cierra el canal cuando el
                    // buffer se llena; aquí se cierra el flujo igual.
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => None,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => None,
                }
            }
        }
    })
}

/// ¿La sesión sigue vigente? Token válido y sin cambio obligatorio
/// pendiente, como en Go (`valid()` de `visitEvents`).
async fn valid_session(service: &SessionService, token: &str) -> bool {
    match service.validate(token, false).await {
        Ok(session) => !session.must_change,
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request},
    };
    use http_body_util::BodyExt;
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use std::time::Duration;
    use tokio::time::timeout;
    use tower::ServiceExt;

    use crate::config::Config;
    use crate::http::build_router_with_state;

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config {
            bind: "127.0.0.1".to_string(),
            port: 8443,
            db_path: "data/logmaster.db".into(),
            database_engine: logmaster_store::DatabaseEngine::Sqlite,
            database_url: None,
            test_connection_on_startup: true,
            install_folder: r"C:\LogMaster".to_string(),
            desktop_shortcut: true,
            config_path: None,
            jwt_secret: "fixture-only-not-a-real-secret-fixture-only-not-a-real-secret-"
                .to_string(),
            refresh_secret: "fixture-refresh-secret-fixture-refresh-secret-fixture--".to_string(),
            encryption_key: [0x19u8; 32],
            edit_password: "fixture-edit-password".to_string(),
            access_ttl: std::time::Duration::from_secs(15 * 60),
            refresh_ttl: std::time::Duration::from_secs(7 * 24 * 3600),
            absolute_session_ttl: std::time::Duration::from_secs(7 * 24 * 3600),
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

    async fn seed_user(state: &ApiState, username: &str, role: &str) -> i64 {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .repos
            .users
            .insert(&NewUser {
                username,
                email: Some("u@example.test"),
                password_hash: &hash,
                role,
                must_change_password: false,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap()
    }

    async fn token_for(state: &ApiState, user_id: i64) -> String {
        let user = state.repos.users.find_by_id(user_id).await.unwrap();
        state
            .session
            .issue(&Session::from_user(&user))
            .unwrap()
            .access_token
    }

    #[tokio::test]
    async fn events_connected_and_capacity() {
        let state = test_state();
        let user_id = seed_user(&state, "operador-e", "operador").await;
        let token = token_for(&state, user_id).await;
        let router = build_router_with_state(state.clone());

        // Sin sesión: 401.
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/events/visits")
            .body(Body::empty())
            .unwrap();
        let response = router.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        // Con sesión: 200, cabeceras SSE de Go y primer evento
        // `system:connected`.
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/events/visits")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let response = router.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], "text/event-stream");
        assert_eq!(
            response.headers()["cache-control"],
            "private, no-store, no-transform"
        );
        assert_eq!(response.headers()["x-accel-buffering"], "no");
        let mut body = response.into_body();
        let frame = timeout(Duration::from_secs(5), body.frame())
            .await
            .expect("primer frame a tiempo")
            .expect("frame presente")
            .expect("frame sin error");
        let bytes = frame.into_data().expect("frame de datos");
        let text = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(text.starts_with("data: "), "{text}");
        assert!(text.contains("system:connected"), "{text}");

        // Publicar llega al flujo: se lee el siguiente frame.
        state.events.publish("visit:checked-in", 7);
        let frame = timeout(Duration::from_secs(5), body.frame())
            .await
            .expect("segundo frame a tiempo")
            .expect("frame presente")
            .expect("frame sin error");
        let bytes = frame.into_data().expect("frame de datos");
        let text = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(text.contains("visit:checked-in"), "{text}");
        assert!(text.contains("\"visitId\":7"), "{text}");

        // Capacidad: con 256 suscriptores (1 del flujo + 255
        // retenidas), el siguiente es 503.
        let mut held = Vec::new();
        for _ in 0..255 {
            held.push(state.events.subscribe());
        }
        assert!(state.events.subscribe().is_none());
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/events/visits")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let response = router.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["error"]["code"], "STREAM_CAPACITY");
        drop(held);
    }

    #[tokio::test]
    async fn events_stream_closes_when_session_is_revoked() {
        let state = test_state();
        let user_id = seed_user(&state, "operador-e2", "operador").await;
        let token = token_for(&state, user_id).await;
        let router = build_router_with_state(state.clone());
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/events/visits")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        // Primer frame: system:connected.
        let _ = timeout(Duration::from_secs(5), body.frame())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        // Revocar la sesión (logout) y publicar: el flujo debe
        // cerrarse en la revalidación, sin entregar el evento.
        let user = state.repos.users.find_by_id(user_id).await.unwrap();
        let session = Session::from_user(&user);
        state
            .repos
            .users
            .revoke_session(user_id, session.token_version, NOW)
            .await
            .unwrap();
        state.events.publish("visit:checked-in", 9);
        // El flujo debe cerrarse en la revalidación, sin entregar el
        // evento: o se acaba (None), o llega un error, o no llega nada
        // antes del tiempo límite.
        match timeout(Duration::from_secs(5), body.frame()).await {
            Ok(None) | Ok(Some(Err(_))) | Err(_) => {}
            Ok(Some(Ok(_))) => {
                panic!("el flujo revocado no entrega eventos");
            }
        }
    }
}
