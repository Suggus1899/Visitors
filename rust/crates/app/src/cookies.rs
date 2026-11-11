//! Cookies de sesion y CSRF, emitidas y leidas directamente por Axum.
//!
//! Sin BFF: las cookies que antes ponia Next
//! (`client/src/server/auth-cookies.ts`) las pone ahora Axum, con los
//! mismos nombres, atributos y `Max-Age` (la expiracion del token):
//!
//! - `__Host-logmaster-access` y `__Host-logmaster-refresh`:
//!   `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
//! - `__Host-logmaster-csrf`: igual pero legible desde el cliente
//!   (sin `HttpOnly`), para el doble envio del token CSRF en las
//!   escrituras con sesion por cookie.
//!
//! El prefijo `__Host-` exige `Secure` y `Path=/` sin `Domain`, que es
//! justo lo que se emite.

use axum::http::header::{HeaderMap, SET_COOKIE};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

/// Cookie del token de acceso.
pub const ACCESS_COOKIE: &str = "__Host-logmaster-access";
/// Cookie del token de renovacion.
pub const REFRESH_COOKIE: &str = "__Host-logmaster-refresh";
/// Cookie del token CSRF (doble envio).
pub const CSRF_COOKIE: &str = "__Host-logmaster-csrf";

/// Cabecera CSRF que debe acompanar a las escrituras con sesion por
/// cookie, con el mismo valor que la cookie CSRF.
pub const CSRF_HEADER: &str = "x-csrf-token";

/// `Max-Age` de un token: segundos hasta su `exp`, como
/// `tokenMaxAge` de Next (nunca negativo).
pub fn token_max_age(token: &str) -> Option<u64> {
    let payload = token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    let exp = value.get("exp")?.as_u64()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();
    Some(exp.saturating_sub(now))
}

fn cookie_header(name: &str, value: &str, http_only: bool, max_age: Option<u64>) -> String {
    let mut out = format!("{name}={value}; Path=/; Secure; SameSite=Lax");
    if http_only {
        out.push_str("; HttpOnly");
    }
    if let Some(age) = max_age {
        out.push_str(&format!("; Max-Age={age}"));
    }
    out
}

/// Anade las dos `Set-Cookie` de sesion a las cabeceras de respuesta,
/// con el `Max-Age` de cada token.
pub fn set_session_cookies(headers: &mut HeaderMap, access: &str, refresh: &str) {
    let access_age = token_max_age(access);
    let refresh_age = token_max_age(refresh);
    for (name, value, age) in [
        (ACCESS_COOKIE, access, access_age),
        (REFRESH_COOKIE, refresh, refresh_age),
    ] {
        if let Ok(header) = cookie_header(name, value, true, age).parse() {
            headers.append(SET_COOKIE, header);
        }
    }
}

/// Anade la `Set-Cookie` del token CSRF (doble envio).
pub fn set_csrf_cookie(headers: &mut HeaderMap, csrf_token: &str) {
    if let Ok(header) = cookie_header(CSRF_COOKIE, csrf_token, false, None).parse() {
        headers.append(SET_COOKIE, header);
    }
}

/// Limpia las cookies de sesion (`Max-Age=0`), como Next al cerrar
/// sesion o al fallar la renovacion.
pub fn clear_session_cookies(headers: &mut HeaderMap) {
    for name in [ACCESS_COOKIE, REFRESH_COOKIE] {
        if let Ok(header) = cookie_header(name, "", true, Some(0)).parse() {
            headers.append(SET_COOKIE, header);
        }
    }
}

/// Lee una cookie por nombre de la cabecera `Cookie`.
pub fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let part = part.trim();
        if let Some((key, value)) = part.split_once('=') {
            if key.trim() == name {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use serde::Serialize;

    #[derive(Serialize)]
    struct Claims {
        exp: u64,
    }

    fn token_with_exp(exp: u64) -> String {
        encode(
            &Header::new(Algorithm::HS256),
            &Claims { exp },
            &EncodingKey::from_secret(b"secreto-de-fixture-suficientemente-largo"),
        )
        .unwrap()
    }

    #[test]
    fn session_cookies_use_host_prefix_and_max_age() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let access = token_with_exp(now + 900);
        let refresh = token_with_exp(now + 7 * 24 * 3600);
        let mut headers = HeaderMap::new();
        set_session_cookies(&mut headers, &access, &refresh);
        let cookies: Vec<String> = headers
            .get_all(SET_COOKIE)
            .iter()
            .map(|v| v.to_str().unwrap().to_string())
            .collect();
        assert_eq!(cookies.len(), 2);
        assert!(cookies[0].starts_with("__Host-logmaster-access="));
        assert!(cookies[0].contains("; Path=/; Secure; SameSite=Lax; HttpOnly"));
        // Max-Age con tolerancia de 10 s por el paso del reloj.
        let max_age = |cookie: &str| {
            cookie
                .split("Max-Age=")
                .nth(1)
                .unwrap()
                .split(';')
                .next()
                .unwrap()
                .parse::<u64>()
                .unwrap()
        };
        assert!((890..=900).contains(&max_age(&cookies[0])));
        assert!(cookies[1].starts_with("__Host-logmaster-refresh="));
        assert!((604790..=604800).contains(&max_age(&cookies[1])));

        let mut headers = HeaderMap::new();
        set_csrf_cookie(&mut headers, "csrf-abc");
        let cookie = headers.get(SET_COOKIE).unwrap().to_str().unwrap();
        assert!(cookie.starts_with("__Host-logmaster-csrf=csrf-abc"));
        assert!(!cookie.contains("HttpOnly"));

        let mut headers = HeaderMap::new();
        clear_session_cookies(&mut headers);
        let cleared: Vec<String> = headers
            .get_all(SET_COOKIE)
            .iter()
            .map(|v| v.to_str().unwrap().to_string())
            .collect();
        assert_eq!(cleared.len(), 2);
        assert!(cleared.iter().all(|c| c.contains("Max-Age=0")));
    }

    #[test]
    fn cookie_value_parses_cookie_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::COOKIE,
            "__Host-logmaster-access=token-a; __Host-logmaster-csrf=csrf-1"
                .parse()
                .unwrap(),
        );
        assert_eq!(
            cookie_value(&headers, ACCESS_COOKIE).as_deref(),
            Some("token-a")
        );
        assert_eq!(
            cookie_value(&headers, CSRF_COOKIE).as_deref(),
            Some("csrf-1")
        );
        assert_eq!(cookie_value(&headers, "ausente"), None);
    }
}
