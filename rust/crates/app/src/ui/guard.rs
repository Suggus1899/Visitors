//! Guardia de sesión de las páginas web: el equivalente a
//! `requireUser` de Next.js.
//!
//! Sin sesión válida redirige a `/login?returnTo=...` (no un 401
//! JSON, que el navegador mostraría como página rota); con el acceso
//! vencido intenta renovar con la cookie de renovación y, si lo
//! logra, repone las cookies en la respuesta. Con cambio de
//! contraseña obligatorio solo se permiten `/change-password` y
//! `/logout`, como el gate de la fase 3.

use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use logmaster_crypto::random_token;

use crate::cookies::{
    cookie_value, set_csrf_cookie, set_session_cookies, ACCESS_COOKIE, REFRESH_COOKIE,
};
use crate::http::ApiState;
use crate::session::Session;

/// Sesión resuelta desde la petición, con los tokens renovados si
/// hizo falta renovar (para reponer las cookies en la respuesta).
pub struct SessionLookup {
    pub session: Option<Session>,
    pub refreshed: Option<(String, String)>,
}

/// Lee la sesión de la petición: `Authorization: Bearer` o cookie de
/// acceso y, si el acceso venció, la cookie de renovación.
pub async fn session_from_request(state: &ApiState, headers: &HeaderMap) -> SessionLookup {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| cookie_value(headers, ACCESS_COOKIE));
    if let Some(token) = token {
        if let Ok(session) = state.session.validate(&token, false).await {
            return SessionLookup {
                session: Some(session),
                refreshed: None,
            };
        }
    }
    if let Some(refresh_token) = cookie_value(headers, REFRESH_COOKIE) {
        if let Ok(tokens) = state.session.refresh(&refresh_token).await {
            if let Ok(session) = state.session.validate(&tokens.access_token, false).await {
                return SessionLookup {
                    session: Some(session),
                    refreshed: Some((tokens.access_token, tokens.refresh_token)),
                };
            }
        }
    }
    SessionLookup {
        session: None,
        refreshed: None,
    }
}

/// Redirección 302 a un destino interno.
pub fn redirect_to(dest: &str) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::LOCATION,
        dest.parse().expect("destino interno válido"),
    );
    (StatusCode::FOUND, headers).into_response()
}

/// Añade a la respuesta las `Set-Cookie` de una renovación.
pub fn attach_refreshed(response: &mut Response, refreshed: &Option<(String, String)>) {
    let Some((access, refresh)) = refreshed else {
        return;
    };
    let mut headers = HeaderMap::new();
    set_session_cookies(&mut headers, access, refresh);
    if let Ok(csrf) = random_token() {
        set_csrf_cookie(&mut headers, &csrf);
    }
    for value in headers.get_all(header::SET_COOKIE) {
        response
            .headers_mut()
            .append(header::SET_COOKIE, value.clone());
    }
}

/// Codifica un destino para usarlo como valor de `returnTo` en la
/// query (`?` y `&` deben ir codificados, o romperían el parámetro).
pub fn encode_return_to(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' | '/' => out.push(c),
            _ => {
                for byte in c.to_string().as_bytes() {
                    out.push_str(&format!("%{byte:02X}"));
                }
            }
        }
    }
    out
}

/// Capa de sesión de las páginas protegidas.
pub async fn ui_session(
    State(state): State<ApiState>,
    mut request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    let return_to = request
        .uri()
        .path_and_query()
        .map(|value| value.as_str().to_string())
        .unwrap_or_else(|| "/".to_string());
    let lookup = session_from_request(&state, request.headers()).await;
    let Some(session) = lookup.session else {
        let dest = format!("/login?returnTo={}", encode_return_to(&return_to));
        return redirect_to(&dest);
    };
    if session.must_change && path != "/change-password" && path != "/logout" {
        return redirect_to("/change-password");
    }
    request.extensions_mut().insert(session);
    let mut response = next.run(request).await;
    attach_refreshed(&mut response, &lookup.refreshed);
    response
}
