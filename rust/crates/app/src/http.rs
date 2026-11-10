//! Router HTTP del esqueleto (fase 1).
//!
//! Solo las dos rutas de salud. Las 59 rutas del contrato (ver
//! `rust/fixtures/routes.json`) llegan familia a familia en la fase 4,
//! cada una con su caso de la tabla de roles.

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use logmaster_store::Store;
use serde_json::json;

use crate::error;

/// Router completo: `/health` del proceso y `/api/v1/*`.
pub fn build_router(store: Store) -> Router {
    Router::new().route("/health", get(health)).nest(
        "/api/v1",
        Router::new()
            .route("/health", get(api_health))
            .with_state(store),
    )
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
async fn api_health(State(store): State<Store>) -> impl IntoResponse {
    match store.ping() {
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
