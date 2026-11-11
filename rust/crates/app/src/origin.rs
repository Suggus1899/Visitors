//! Validacion de origen y token CSRF en escrituras.
//!
//! Sin BFF, Axum hace lo que hacia Next (`originAllowed` en
//! `client/src/server/auth-cookies.ts` y el proxy `[...path]`):
//!
//! - Si la peticion trae `Origin` y su origen no esta permitido, 403
//!   `FORBIDDEN` ("Origen no autorizado"), como el `headers` de Go.
//! - El propio origen del servidor (el `Host` de la peticion) siempre
//!   esta permitido: con la fase 5 el frontend Leptos lo sirve el
//!   mismo binario que la API, asi que el navegador llama a su propio
//!   origen (`http://127.0.0.1:puerto`, `https://localhost:8443`, ...)
//!   y ese origen no tiene por que coincidir con el `APP_URL`
//!   configurado. La comparacion es por host y puerto efectivo (sin
//!   esquema): un origen distinto sigue rechazandose, y el doble envio
//!   CSRF sigue protegiendo las escrituras con sesion por cookie.
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

/// `(host, puerto efectivo)` de un origen ya normalizado
/// (`esquema://host[:puerto]`) o de un `Host` (`host[:puerto]`), con
/// el puerto por defecto del esquema cuando no se indica.
fn host_port(value: &str, default_port: u16) -> Option<(String, u16)> {
    let (host, port) = match value.rsplit_once(':') {
        Some((host, port)) if !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()) => {
            (host, port.parse().ok()?)
        }
        _ => (value, default_port),
    };
    if host.is_empty() {
        return None;
    }
    Some((host.to_ascii_lowercase(), port))
}

/// `true` si el origen es el propio origen del servidor: mismo host
/// y mismo puerto efectivo que el `Host` de la peticion. El esquema
/// no se compara: detras de TLS el servidor ve HTTP plano mientras
/// el navegador ve HTTPS, y lo que protege del CSRF es el host, no
/// el esquema (el doble envio CSRF sigue vigente en las escrituras
/// con sesion por cookie).
fn is_same_origin(origin: &str, host_header: Option<&str>) -> bool {
    let Some(host_header) = host_header else {
        return false;
    };
    let (scheme, rest) = match origin.split_once("://") {
        Some(parts) => parts,
        None => return false,
    };
    let default_port = if scheme == "https" { 443 } else { 80 };
    match (
        host_port(rest, default_port),
        host_port(host_header, default_port),
    ) {
        (Some(origin_hp), Some(host_hp)) => origin_hp == host_hp,
        _ => false,
    }
}

/// `true` si el `Origin` esta en la lista de permitidos o es el
/// propio origen del servidor.
fn origin_allowed(allowed: &[String], origin: &str, host_header: Option<&str>) -> bool {
    match origin_of(origin) {
        Some(parsed) if allowed.contains(&parsed) => true,
        Some(parsed) => is_same_origin(&parsed, host_header),
        None => false,
    }
}

/// Capa de origen y CSRF. Se instala con
/// `middleware::from_fn_with_state(config, origin_and_csrf)`.
pub async fn origin_and_csrf(
    State(config): State<OriginConfig>,
    request: Request,
    next: Next,
) -> Response {
    let headers = request.headers();
    let host_header = headers.get(header::HOST).and_then(|v| v.to_str().ok());
    // Un Origin presente y no permitido se rechaza en cualquier metodo.
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        if !origin_allowed(&config.allowed_origins, origin, host_header) {
            return forbidden_origin();
        }
    }
    let method = request.method().clone();
    if method == Method::OPTIONS {
        return (StatusCode::NO_CONTENT, ()).into_response();
    }
    if !matches!(method, Method::GET | Method::HEAD) {
        // Escritura: origen obligatorio (Origin o Referer).
        let origin_ok = match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
            Some(origin) => origin_allowed(&config.allowed_origins, origin, host_header),
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

    #[test]
    fn same_origin_matches_request_host_but_not_other_hosts() {
        let allowed: Vec<String> = vec!["https://localhost:8443".to_string()];
        // El propio origen del servidor, aunque no este en APP_URL.
        assert!(origin_allowed(
            &allowed,
            "http://127.0.0.1:18085",
            Some("127.0.0.1:18085"),
        ));
        // Detras de TLS el esquema puede diferir; manda host y puerto.
        assert!(origin_allowed(
            &allowed,
            "https://localhost:8443",
            Some("localhost:8443"),
        ));
        assert!(origin_allowed(
            &allowed,
            "https://example.com",
            Some("example.com"),
        ));
        // Otro host, aunque comparta puerto: rechazado.
        assert!(!origin_allowed(
            &allowed,
            "https://atacante.example",
            Some("127.0.0.1:18085"),
        ));
        assert!(!origin_allowed(
            &allowed,
            "http://127.0.0.1:9999",
            Some("127.0.0.1:18085"),
        ));
        // Sin Host no hay mismo origen que comprobar.
        assert!(!origin_allowed(&allowed, "http://127.0.0.1:18085", None));
        // La lista de permitidos sigue valiendo sin Host.
        assert!(origin_allowed(&allowed, "https://localhost:8443", None));
    }
}
