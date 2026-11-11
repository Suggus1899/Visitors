//! Páginas web (Leptos SSR).
//!
//! Cada handler resuelve la sesión (la guardia ya la dejó en las
//! extensiones en las rutas protegidas), lee los datos por los traits
//! de repositorio —la misma capa que usan los handlers de la API de
//! la fase 4— y renderiza componentes Leptos a HTML. **Ninguna
//! escritura vive aquí**: todas las mutaciones van por `fetch` a
//! `/api/v1/...` desde el JS del cliente, con cookies y CSRF.

use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use leptos::prelude::*;
use serde::Deserialize;

use crate::common::RemoteAddr;
use crate::http::ApiState;
use crate::routes::auth::logout_session;
use crate::session::{safe_return_to, Session};
use crate::ui::{guard, layout};

/// Renderiza un componente Leptos dentro de la cáscara de la página.
fn page(session: Option<&Session>, title: &str, body: String) -> Response {
    layout::render(session, title, &body).into_response()
}

#[derive(Deserialize, Default)]
pub(crate) struct LoginQuery {
    #[serde(default, rename = "returnTo")]
    return_to: Option<String>,
}

#[derive(Deserialize, Default)]
pub(crate) struct ResetQuery {
    #[serde(default)]
    token: Option<String>,
}

#[component]
fn LoginPage() -> impl IntoView {
    view! {
        <div class="centrado">
            <div class="tarjeta">
                <h1>"Iniciar sesión"</h1>
                <form id="login-form">
                    <div class="alerta error" data-error="" hidden=true></div>
                    <div class="campo">
                        <label>
                            "Usuario"
                            <input name="username" autocomplete="username" required />
                        </label>
                    </div>
                    <div class="campo">
                        <label>
                            "Contraseña"
                            <input name="password" type="password" autocomplete="current-password" required />
                        </label>
                    </div>
                    <div class="acciones">
                        <button type="submit">"Entrar"</button>
                    </div>
                </form>
                <p>
                    <a href="/forgot-password">"¿Olvidaste tu contraseña?"</a>
                </p>
            </div>
        </div>
    }
}

#[component]
fn ForgotPage() -> impl IntoView {
    view! {
        <div class="centrado">
            <div class="tarjeta">
                <h1>"Recuperar contraseña"</h1>
                <p class="muted">
                    "Escribe tu usuario: si la cuenta existe y tiene correo, recibirás instrucciones de recuperación."
                </p>
                <form id="forgot-form">
                    <div class="alerta error" data-error="" hidden=true></div>
                    <div class="alerta ok" data-ok="" hidden=true></div>
                    <div class="campo">
                        <label>
                            "Usuario"
                            <input name="username" autocomplete="username" required />
                        </label>
                    </div>
                    <div class="acciones">
                        <button type="submit">"Enviar instrucciones"</button>
                    </div>
                </form>
                <p>
                    <a href="/login">"Volver al inicio de sesión"</a>
                </p>
            </div>
        </div>
    }
}

#[component]
fn ResetPage(token: String) -> impl IntoView {
    view! {
        <div class="centrado">
            <div class="tarjeta">
                <h1>"Restablecer contraseña"</h1>
                <form id="reset-form">
                    <div class="alerta error" data-error="" hidden=true></div>
                    <input type="hidden" name="token" value={token} />
                    <div class="campo">
                        <label>
                            "Contraseña nueva"
                            <input name="newPassword" type="password" autocomplete="new-password" required />
                        </label>
                    </div>
                    <div class="campo">
                        <label>
                            "Repite la contraseña nueva"
                            <input name="confirmPassword" type="password" autocomplete="new-password" required />
                        </label>
                    </div>
                    <div class="acciones">
                        <button type="submit">"Restablecer"</button>
                    </div>
                </form>
            </div>
        </div>
    }
}

#[component]
fn ChangePasswordPage() -> impl IntoView {
    view! {
        <div class="centrado">
            <div class="tarjeta">
                <h1>"Cambiar contraseña"</h1>
                <form id="change-password-form">
                    <div class="alerta error" data-error="" hidden=true></div>
                    <div class="campo">
                        <label>
                            "Contraseña actual"
                            <input name="currentPassword" type="password" autocomplete="current-password" required />
                        </label>
                    </div>
                    <div class="campo">
                        <label>
                            "Contraseña nueva"
                            <input name="newPassword" type="password" autocomplete="new-password" required />
                        </label>
                    </div>
                    <div class="campo">
                        <label>
                            "Repite la contraseña nueva"
                            <input name="confirmPassword" type="password" autocomplete="new-password" required />
                        </label>
                    </div>
                    <div class="acciones">
                        <button type="submit">"Cambiar contraseña"</button>
                    </div>
                </form>
            </div>
        </div>
    }
}

/// `/login`: con sesión vigente redirige al destino (o a `/`).
pub async fn login_page(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(query): Query<LoginQuery>,
) -> Response {
    let dest = safe_return_to(query.return_to.as_deref());
    let lookup = guard::session_from_request(&state, &headers).await;
    if lookup.session.is_some() {
        let mut response = guard::redirect_to(&dest);
        guard::attach_refreshed(&mut response, &lookup.refreshed);
        return response;
    }
    let body = view! { <LoginPage /> }.to_html();
    page(None, "Iniciar sesión", body)
}

/// `/forgot-password`: el envío del correo es fase 6; el formulario
/// llama a la API, que responde el mensaje genérico.
pub async fn forgot_page() -> Response {
    let body = view! { <ForgotPage /> }.to_html();
    page(None, "Recuperar contraseña", body)
}

/// `/reset-password?token=...`: sin token, aviso en la propia página.
pub async fn reset_page(Query(query): Query<ResetQuery>) -> Response {
    let token = query.token.unwrap_or_default();
    if token.is_empty() {
        let body = "<div class=\"centrado\"><div class=\"tarjeta\"><h1>Restablecer contraseña</h1><div class=\"alerta error\">Falta el enlace de recuperación: usa el enlace que recibiste por correo.</div><p><a href=\"/forgot-password\">Pedir un enlace nuevo</a></p></div></div>"
            .to_string();
        return page(None, "Restablecer contraseña", body);
    }
    let body = view! { <ResetPage token=token /> }.to_html();
    page(None, "Restablecer contraseña", body)
}

/// `/change-password`: cambio propio, incluido el flujo obligatorio.
pub async fn change_password_page(session: Session) -> Response {
    let body = view! { <ChangePasswordPage /> }.to_html();
    page(Some(&session), "Cambiar contraseña", body)
}

/// `POST /logout`: revoca la sesión leída de las cookies (el
/// navegador no puede leer la cookie de acceso, `HttpOnly`, así que
/// no puede llamar a la API con los tokens en el cuerpo).
pub async fn logout(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
) -> Response {
    logout_session(&state, &session, &headers, remote, "/logout").await
}
