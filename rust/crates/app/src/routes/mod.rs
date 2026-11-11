//! Router por familias (`/api/v1/*`), como el §6 del documento.
//!
//! Las rutas públicas no llevan capa de sesión; las protegidas sí, y
//! cada ruta declara además su permiso (`roles.rs`) en una capa propia
//! que corre después de la sesión. El orden de las capas externas es
//! el de Go: origen/CSRF, límite y sesión.

pub mod audit;
pub mod auth;
pub mod backups;
pub mod privacy;
pub mod reports;
pub mod superadmin;
pub mod visitors;
pub mod visits;

use axum::Router;

use crate::http::ApiState;

/// Rutas públicas de `/api/v1` (sin capa de sesión).
pub fn public_routes() -> Router<ApiState> {
    auth::public_routes()
}

/// Rutas protegidas de `/api/v1` (detrás de la capa de sesión, que
/// instala `http::build_router`).
pub fn protected_routes() -> Router<ApiState> {
    Router::new()
        .merge(auth::protected_routes())
        .merge(audit::routes())
        .merge(backups::routes())
        .merge(privacy::routes())
        .merge(reports::routes())
        .merge(superadmin::routes())
        .merge(visitors::routes())
        .merge(visits::routes())
}
