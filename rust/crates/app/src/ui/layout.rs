//! Cáscara HTML de las páginas Leptos: cabecera con navegación por
//! rol, pie y assets incrustados (CSS/JS).
//!
//! El cuerpo lo renderiza Leptos (`view!{...}.to_html()`); la cáscara
//! es `format!` porque el CSS y el JS incrustados no deben pasar por
//! el escape de texto de Leptos.

use axum::{http::StatusCode, response::Html};

use crate::roles::{allows, Permission, Role};
use crate::session::Session;

/// Hoja de estilos del frontend (fase 5).
pub const CSS: &str = include_str!("style.css");
/// JS mínimo del cliente: API, SSE, cámara (fase 5).
pub const JS: &str = include_str!("app.js");

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn nav(session: &Session) -> String {
    let role = Role::parse(&session.role);
    let mut links: Vec<(&str, &str)> = vec![("/", "Operación")];
    if role.is_some_and(|r| allows(r, Permission::ReadAudit)) {
        links.push(("/audit", "Auditoría"));
    }
    if role.is_some_and(|r| allows(r, Permission::ReadArco)) {
        links.push(("/privacy", "Privacidad"));
    }
    if role.is_some_and(|r| matches!(r, Role::Admin | Role::Root)) {
        links.push(("/admin", "Administración"));
    }
    if role.is_some_and(|r| matches!(r, Role::Root)) {
        links.push(("/root", "Root"));
    }
    links.push(("/change-password", "Cambiar contraseña"));
    let items: Vec<String> = links
        .iter()
        .map(|(href, label)| format!("<a href=\"{href}\">{label}</a>"))
        .collect();
    format!(
        "<nav>{}</nav><span class=\"usuario\">{} ({}) <button id=\"logout-btn\" type=\"button\">Salir</button></span>",
        items.join(""),
        escape(&session.username),
        escape(&session.role),
    )
}

/// Página completa: cáscara + cuerpo ya renderizado por Leptos.
pub fn render(session: Option<&Session>, title: &str, body: &str) -> Html<String> {
    let header = match session {
        Some(session) => format!(
            "<header class=\"topo\"><a class=\"marca\" href=\"/\">LogMaster</a>{}</header>",
            nav(session)
        ),
        None => "<header class=\"topo\"><a class=\"marca\" href=\"/login\">LogMaster</a></header>"
            .to_string(),
    };
    Html(format!(
        "<!doctype html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{} · LogMaster</title>\n<style>\n{}\n</style>\n</head>\n<body>\n{}\n<main>\n{}\n</main>\n<footer class=\"pie\">LogMaster · control de visitantes · Industrias de Alimentos el Trébol</footer>\n<script>\n{}\n</script>\n</body>\n</html>",
        escape(title),
        CSS,
        header,
        body,
        JS,
    ))
}

/// Página de error simple (403 de rol, 404 de recurso) con la
/// cáscara y la navegación de la sesión, si la hay.
pub fn error_page(
    session: Option<&Session>,
    status: StatusCode,
    title: &str,
    message: &str,
) -> (StatusCode, Html<String>) {
    let body = format!(
        "<div class=\"tarjeta\"><h1>{}</h1><p>{}</p><p><a href=\"/\">Volver a Operación</a></p></div>",
        escape(title),
        escape(message),
    );
    (status, render(session, title, &body))
}
