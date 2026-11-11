//! Validacion de origen y token CSRF en escrituras.
//!
//! Sin BFF, Axum hace lo que hacia Next (`originAllowed` en
//! `client/src/server/auth-cookies.ts` y el proxy `[...path]`):
//!
//! - Si la peticion trae `Origin` y su origen no esta permitido, 403
//!   `FORBIDDEN` ("Origen no autorizado"), como el `headers` de Go.
//! - En escrituras (POST/PUT/PATCH/DELETE), el origen es obligatorio:
//!   si no hay `Origin`, se acepta el `Referer` si su origen esta
//!   permitido; sin ninguno de los dos, 403.
//! - En escrituras con sesion por cookie (hay cookie de acceso), se
//!   exige ademas el doble envio CSRF: la cabecera `x-csrf-token` debe
//!   coincidir con la cookie `__Host-logmaster-csrf`. Las peticiones
//!   con `Bearer` no necesitan CSRF (no hay autenticacion ambiental).
//! - `OPTIONS` se responde 204, como Go, despues de comprobar el
//!   origen.
//!
//! Los origenes permitidos son el de `APP_URL` mas `CORS_ORIGINS`.

use axum::{
    extract::{Request, State},
    http::{header, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::cookies::{cookie_value, ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER};
use crate::error;

/// Configuracion de la capa de origen/CSRF.
#[derive(Debug, Clone)]
pub struct OriginConfig {
    /// Origenes permitidos, ya normalizados (`https://host:puerto`).
    pub allowed_origins: Vec<String>,
}

/// Origen de una URL (`https://host:puerto`, con el puerto por defecto
/// eliminado y el host en minusculas), como `URL.origin` del navegador.
/// `None` si no se puede interpretar.
pub fn origin_of(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let authority = rest.split('/').next()?;
    if authority.is_empty() {
        return None;
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) if port.chars().all(|c| c.is_ascii_digit()) && !port.is_empty() => {
            (host, Some(port))
        }
        _ => (authority, None),
    };
    let host = host.to_ascii_lowercase();
    if host.is_empty() {
        return None;
    }
    let default_port = if scheme == "https" { "443" } else { "80" };
    match port {
        Some(port) if port == default_port => Some(format!("{scheme}://{host}")),
        Some(port) => Some(format!("{scheme}://{host}:{port}")),
        None => Some(format!("{scheme}://{host}")),
    }
}

fn forbidden_origin() -> Response {
    error::fail(StatusCode::FORBIDDEN, "FORBIDDEN", "Origen no autorizado").into_response()
}

/// Capa de origen y CSRF. Se instala con
/// `middleware::from_fn_with_state(config, origin_and_csrf)`.
pub async fn origin_and_csrf(
    State(config): State<OriginConfig>,
    request: Request,
    next: Next,
) -> Response {
    let headers = request.headers();
    // Un Origin presente y no permitido se rechaza en cualquier metodo.
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        match origin_of(origin) {
            Some(parsed) if config.allowed_origins.contains(&parsed) => {}
            _ => return forbidden_origin(),
        }
    }
    let method = request.method().clone();
    if method == Method::OPTIONS {
        return (StatusCode::NO_CONTENT, ()).into_response();
    }
    if !matches!(method, Method::GET | Method::HEAD) {
        // Escritura: origen obligatorio (Origin o Referer).
        let origin_ok = match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
            Some(origin) => origin_of(origin)
                .map(|parsed| config.allowed_origins.contains(&parsed))
                .unwrap_or(false),
            None => match headers.get(header::REFERER).and_then(|v| v.to_str().ok()) {
                Some(referer) => origin_of(referer)
                    .map(|parsed| config.allowed_origins.contains(&parsed))
                    .unwrap_or(false),
                None => false,
            },
        };
        if !origin_ok {
            return forbidden_origin();
        }
        // CSRF por doble envio solo con sesion por cookie.
        if cookie_value(headers, ACCESS_COOKIE).is_some() {
            let csrf_cookie = cookie_value(headers, CSRF_COOKIE);
            let csrf_header = headers
                .get(CSRF_HEADER)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            let valid = match (csrf_cookie, csrf_header) {
                (Some(cookie), Some(header)) if !cookie.is_empty() => cookie == header,
                _ => false,
            };
            if !valid {
                return error::fail(StatusCode::FORBIDDEN, "FORBIDDEN", "Token CSRF inválido")
                    .into_response();
            }
        }
    }
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_of_normalizes_like_url_origin() {
        assert_eq!(
            origin_of("https://localhost:8443/login"),
            Some("https://localhost:8443".to_string())
        );
        assert_eq!(
            origin_of("https://EXAMPLE.com:443/a"),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            origin_of("http://127.0.0.1:80/"),
            Some("http://127.0.0.1".to_string())
        );
        assert_eq!(
            origin_of("https://localhost:8443"),
            Some("https://localhost:8443".to_string())
        );
        assert_eq!(origin_of("no-es-una-url"), None);
        assert_eq!(origin_of("ftp://example.com/"), None);
    }
}
