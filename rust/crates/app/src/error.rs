//! Sobre de respuesta JSON del contrato actual.
//!
//! Exitos: `{"success": true, "data": ...}`. Fallos:
//! `{"success": false, "error": {"code": ..., "message": ...}}`.
//! Los codigos HTTP conservan su significado: 400, 401, 403, 404, 409,
//! 413, 429 y 503 (linea base, seccion 5).

use axum::{http::StatusCode, Json};
use serde_json::{json, Value};

/// Respuesta de exito.
pub fn ok(data: Value) -> Json<Value> {
    Json(json!({ "success": true, "data": data }))
}

/// Respuesta de fallo con codigo de aplicacion.
pub fn fail(status: StatusCode, code: &str, message: &str) -> (StatusCode, Json<Value>) {
    (
        status,
        Json(json!({
            "success": false,
            "error": { "code": code, "message": message }
        })),
    )
}
