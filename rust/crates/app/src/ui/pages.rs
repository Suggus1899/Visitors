//! Páginas web (Leptos SSR).
//!
//! Cada handler resuelve la sesión (la guardia ya la dejó en las
//! extensiones en las rutas protegidas), lee los datos por los traits
//! de repositorio —la misma capa que usan los handlers de la API de
//! la fase 4— y renderiza componentes Leptos a HTML. **Ninguna
//! escritura vive aquí**: todas las mutaciones van por `fetch` a
//! `/api/v1/...` desde el JS del cliente, con cookies y CSRF.

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use leptos::prelude::*;
use serde::Deserialize;

use crate::common::RemoteAddr;
use crate::http::ApiState;
use crate::roles::{allows, Permission, Role};
use crate::routes::auth::logout_session;
use crate::session::{safe_return_to, Session};
use crate::ui::{
    components::{text, text_or, visitor_name, Dato, VisitTable},
    data, guard, layout,
};

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

// ---------------------------------------------------------------------
// Operación: punto de control, detalle de visita y de visitante.
// ---------------------------------------------------------------------
//
// Nota Leptos: los hijos de `Show`/`For` son closures `Fn` y no
// admiten valores movidos, así que en SSR los bloques condicionales
// y las filas se precalculan como `AnyView` antes del `view!`.

/// 403 de página: rol sin acceso a esta pantalla.
fn forbid(session: &Session, message: &str) -> Response {
    let (status, html) =
        layout::error_page(Some(session), StatusCode::FORBIDDEN, "Sin permiso", message);
    (status, html).into_response()
}

/// Fallo al cargar datos de una página (404 o 500).
fn page_error(session: &Session, error: &data::PageError) -> Response {
    let (status, html) = layout::error_page(
        Some(session),
        error.status(),
        "No se pudo cargar la página",
        error.message(),
    );
    (status, html).into_response()
}

/// Roles del punto de control (línea base §4): operador, admin, root
/// y demo. El auditor no opera: su pantalla es `/audit`.
fn can_operate(session: &Session) -> bool {
    matches!(
        Role::parse(&session.role),
        Some(Role::Operador | Role::Admin | Role::Root | Role::Demo)
    )
}

#[component]
fn CheckinForm() -> impl IntoView {
    view! {
        <section class="tarjeta">
            <h2>"Registrar check-in"</h2>
            <form id="checkin-form">
                <div class="alerta error" data-error="" hidden=true></div>
                <fieldset>
                    <legend>"Identificación"</legend>
                    <div class="fila">
                        <div class="campo">
                            <label>
                                "Cédula"
                                <input id="visitorCedula" name="visitorCedula" placeholder="V-12345678" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                " "
                                <button id="buscar-perfil-btn" type="button" class="secundario">"Buscar perfil"</button>
                            </label>
                        </div>
                    </div>
                    <p id="perfil-info" class="muted" hidden=true></p>
                </fieldset>
                <fieldset>
                    <legend>"Información personal"</legend>
                    <div class="fila">
                        <div class="campo">
                            <label>
                                "Nombres"
                                <input name="firstName" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Apellidos"
                                <input name="lastName" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Empresa"
                                <input name="company" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Cargo"
                                <input name="jobTitle" />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Correo"
                                <input name="email" type="email" />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Teléfono"
                                <input name="phone" />
                            </label>
                        </div>
                    </div>
                </fieldset>
                <fieldset>
                    <legend>"Fotos"</legend>
                    <div class="campo">
                        <label>
                            "Foto del visitante (archivo)"
                            <input id="foto-archivo" type="file" accept="image/png,image/jpeg,image/webp" />
                        </label>
                        <input id="photoBase64" name="photoBase64" type="hidden" />
                        <img id="foto-vista" class="foto" hidden=true alt="Foto del visitante" />
                    </div>
                    <div class="campo">
                        <label>
                            "Cámara"
                        </label>
                        <video id="camara" hidden=true autoplay playsinline></video>
                        <div class="acciones">
                            <button id="camara-btn" type="button" class="secundario">"Abrir cámara"</button>
                            <button id="capturar-btn" type="button" class="secundario" hidden=true>"Capturar foto"</button>
                        </div>
                    </div>
                    <div class="campo">
                        <label>
                            "Foto del documento (archivo)"
                            <input id="foto-documento-archivo" type="file" accept="image/png,image/jpeg,image/webp" />
                        </label>
                        <input id="idPhotoBase64" name="idPhotoBase64" type="hidden" />
                        <img id="foto-documento-vista" class="foto" hidden=true alt="Foto del documento" />
                    </div>
                    <p class="muted">"La cámara exige contexto seguro (localhost o HTTPS). Si el perfil ya existe, sus fotos se conservan."</p>
                </fieldset>
                <fieldset>
                    <legend>"Datos de visita"</legend>
                    <div class="fila">
                        <div class="campo">
                            <label>
                                "Motivo"
                                <input name="purpose" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Persona a visitar"
                                <input name="personToVisit" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Departamento destino"
                                <input name="targetDepartment" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Anfitrión"
                                <input name="hostPerson" required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Estado inicial"
                                <select name="status">
                                    <option value="active">"Activa (entra ahora)"</option>
                                    <option value="waiting">"En espera"</option>
                                </select>
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Acción"
                                <select name="action">
                                    <option value="Ninguna">"Ninguna"</option>
                                    <option value="Carga">"Carga"</option>
                                    <option value="Descarga">"Descarga"</option>
                                </select>
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Departamento"
                                <input name="department" />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Área"
                                <input name="area" />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Marca del vehículo"
                                <input name="vehicleBrand" />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Modelo del vehículo"
                                <input name="vehicleModel" />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Placa del vehículo"
                                <input name="vehiclePlate" />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Observaciones"
                                <textarea name="notes" rows="2"></textarea>
                            </label>
                        </div>
                    </div>
                </fieldset>
                <fieldset>
                    <legend>"Consentimiento"</legend>
                    <div class="campo">
                        <label>
                            <input id="consentimiento" type="checkbox" required />
                            " Acepto el tratamiento de mis datos personales para el control de acceso (política v1). Cada acompañante se registra con su propia visita y su propio consentimiento."
                        </label>
                    </div>
                </fieldset>
                <div class="acciones">
                    <button type="submit">"Registrar check-in"</button>
                </div>
            </form>
        </section>
    }
}

#[component]
fn HomePage(
    waiting: Vec<serde_json::Value>,
    active: Vec<serde_json::Value>,
    intermittent: Vec<serde_json::Value>,
    can_register: bool,
) -> impl IntoView {
    let checkin = if can_register {
        view! { <CheckinForm /> }.into_any()
    } else {
        view! { "" }.into_any()
    };
    view! {
        <h1>"Punto de control"</h1>
        <section class="tarjeta">
            <h2>"Buscar visitante por cédula"</h2>
            <form id="buscar-visitante">
                <div class="fila">
                    <div class="campo">
                        <label>
                            "Cédula"
                            <input id="buscar-cedula" name="cedula" placeholder="V-12345678" required />
                        </label>
                    </div>
                    <div class="campo">
                        <label>
                            " "
                            <button type="submit" class="secundario">"Buscar"</button>
                        </label>
                    </div>
                </div>
            </form>
        </section>
        {checkin}
        <div id="listas-vivo">
            <VisitTable title={"En espera".to_string()} status={"waiting".to_string()} visits=waiting />
            <VisitTable title={"Activas".to_string()} status={"active".to_string()} visits=active />
            <VisitTable title={"Salidas temporales".to_string()} status={"intermittent".to_string()} visits=intermittent />
        </div>
        <p>
            <a href="/admin">"Historial y administración"</a>
        </p>
    }
}

/// `/`: registro y listas de espera, activas e intermitentes.
pub async fn home_page(State(state): State<ApiState>, session: Session) -> Response {
    if !can_operate(&session) {
        return forbid(
            &session,
            "Esta página es para operación: operador, admin, root o demo. La auditoría está en /audit.",
        );
    }
    let can_register =
        Role::parse(&session.role).is_some_and(|role| allows(role, Permission::RegisterVisit));
    let (waiting, active, intermittent) = match data::visit_lists(&state).await {
        Ok(lists) => lists,
        Err(error) => return page_error(&session, &error),
    };
    let body = view! {
        <HomePage waiting=waiting active=active intermittent=intermittent can_register=can_register />
    }
    .to_html();
    page(Some(&session), "Punto de control", body)
}

#[component]
fn VisitPage(
    visit: serde_json::Value,
    intervals: Vec<serde_json::Value>,
    history: Vec<serde_json::Value>,
    can_register: bool,
) -> impl IntoView {
    let id = visit.get("id").and_then(|item| item.as_i64()).unwrap_or(0);
    let status = text(&visit, "status");
    let name = visitor_name(&visit);
    let cedula = text_or(&visit, "visitorCedula", "");
    let has_photo = !cedula.is_empty() && cedula != "Anonimizado";
    let photo_url = format!("/api/v1/visitors/{cedula}/photo");
    let action_base = format!("/api/v1/visits/{id}");
    let empresa = text_or(&visit, "visitorCompany", "");
    let motivo = text(&visit, "purpose");
    let persona = text(&visit, "personToVisit");
    let anfitrion = text(&visit, "hostPerson");
    let depto_destino = text(&visit, "targetDepartment");
    let departamento = text(&visit, "department");
    let area = text(&visit, "area");
    let accion = text(&visit, "action");
    let vehiculo = format!(
        "{} {} {}",
        text(&visit, "vehicleBrand"),
        text(&visit, "vehicleModel"),
        text(&visit, "vehiclePlate")
    )
    .trim()
    .to_string();
    let entrada = text_or(&visit, "checkInTime", "");
    let salida = text_or(&visit, "checkOutTime", "");
    let duracion = visit
        .get("durationMinutes")
        .map(|value| value.to_string())
        .unwrap_or_default();
    let notas = text(&visit, "notes");
    let motivo_cancel = text(&visit, "cancellationReason");
    let photo = if has_photo {
        view! {
            <p>
                <img class="foto" src={photo_url} alt="Foto del visitante" />
            </p>
        }
        .into_any()
    } else {
        view! { "" }.into_any()
    };
    let actions = if can_register {
        match status.as_str() {
            "waiting" => view! {
                <div class="acciones">
                    <button data-api={format!("{action_base}/admit")} data-confirm="¿Admitir esta visita?">"Admitir"</button>
                    <button data-api={format!("{action_base}/cancel")} data-confirm="¿Cancelar esta visita en espera?" data-reason="Motivo de cancelación:" class="peligro">"Cancelar visita"</button>
                </div>
            }
            .into_any(),
            "active" => view! {
                <div class="acciones">
                    <button data-api={format!("{action_base}/intermittent-exit")} data-confirm="¿Registrar la salida temporal?">"Salida temporal"</button>
                    <button data-api={format!("{action_base}/checkout")} data-confirm="¿Registrar la salida definitiva?">"Salida definitiva"</button>
                </div>
            }
            .into_any(),
            "intermittent" => view! {
                <div class="acciones">
                    <button data-api={format!("{action_base}/intermittent-reentry")} data-confirm="¿Registrar el reingreso?">"Reingreso"</button>
                </div>
            }
            .into_any(),
            _ => view! { "" }.into_any(),
        }
    } else {
        view! { "" }.into_any()
    };
    let interval_rows: Vec<AnyView> = if intervals.is_empty() {
        vec![
            view! { <tr><td colspan="3" class="muted">"Sin salidas temporales."</td></tr> }
                .into_any(),
        ]
    } else {
        intervals
            .into_iter()
            .map(|interval| {
                let exit = text(&interval, "exitTime");
                let reentry = text(&interval, "reentryTime");
                let notes = text(&interval, "notes");
                view! { <tr><td>{exit}</td><td>{reentry}</td><td>{notes}</td></tr> }.into_any()
            })
            .collect()
    };
    let history_rows: Vec<AnyView> = if history.is_empty() {
        vec![
            view! { <tr><td colspan="5" class="muted">"Sin cambios registrados."</td></tr> }
                .into_any(),
        ]
    } else {
        history
            .into_iter()
            .map(|entry| {
                let field = text(&entry, "field");
                let old = text(&entry, "oldValue");
                let new = text(&entry, "newValue");
                let by = text(&entry, "editedByUsername");
                let at = text(&entry, "editedAt");
                view! { <tr><td>{field}</td><td>{old}</td><td>{new}</td><td>{by}</td><td>{at}</td></tr> }.into_any()
            })
            .collect()
    };
    view! {
        <h1>
            "Visita #" {id} " · " <span class={format!("etiqueta {status}")}>{status.clone()}</span>
        </h1>
        <section class="tarjeta">
            <h2>{name}</h2>
            {photo}
            <dl class="datos">
                <Dato label="Cédula" value=cedula />
                <Dato label="Empresa" value=empresa />
                <Dato label="Motivo" value=motivo />
                <Dato label="Persona a visitar" value=persona />
                <Dato label="Anfitrión" value=anfitrion />
                <Dato label="Departamento destino" value=depto_destino />
                <Dato label="Departamento" value=departamento />
                <Dato label="Área" value=area />
                <Dato label="Acción" value=accion />
                <Dato label="Vehículo" value=vehiculo />
                <Dato label="Entrada" value=entrada />
                <Dato label="Salida" value=salida />
                <Dato label="Duración (min)" value=duracion />
                <Dato label="Observaciones" value=notas />
                <Dato label="Motivo de cancelación" value=motivo_cancel />
            </dl>
            {actions}
        </section>
        <section class="tarjeta">
            <h2>"Salidas temporales"</h2>
            <table>
                <thead>
                    <tr>
                        <th>"Salida"</th>
                        <th>"Reingreso"</th>
                        <th>"Observaciones"</th>
                    </tr>
                </thead>
                <tbody>{interval_rows}</tbody>
            </table>
        </section>
        <section class="tarjeta">
            <h2>"Historial de edición"</h2>
            <table>
                <thead>
                    <tr>
                        <th>"Campo"</th>
                        <th>"Antes"</th>
                        <th>"Después"</th>
                        <th>"Por"</th>
                        <th>"Fecha"</th>
                    </tr>
                </thead>
                <tbody>{history_rows}</tbody>
            </table>
        </section>
        <p>
            <a href="/">"Volver al punto de control"</a>
        </p>
    }
}

/// `/visits/{id}`: detalle de una visita con su ciclo.
pub async fn visit_page(
    State(state): State<ApiState>,
    session: Session,
    Path(raw): Path<String>,
) -> Response {
    let id: i64 = match raw.parse() {
        Ok(id) => id,
        Err(_) => {
            return page_error(&session, &data::PageError::NotFound("Visita no encontrada"));
        }
    };
    let can_register =
        Role::parse(&session.role).is_some_and(|role| allows(role, Permission::RegisterVisit));
    let (visit, intervals, history) = match data::visit_detail(&state, id).await {
        Ok(values) => values,
        Err(error) => return page_error(&session, &error),
    };
    let title = format!("Visita #{id}");
    let body = view! {
        <VisitPage visit=visit intervals=intervals history=history can_register=can_register />
    }
    .to_html();
    page(Some(&session), &title, body)
}

#[component]
fn VisitorPage(
    visitor: serde_json::Value,
    visits: Vec<serde_json::Value>,
    edits: Vec<serde_json::Value>,
    can_edit: bool,
    can_block: bool,
) -> impl IntoView {
    let cedula = text_or(&visitor, "cedula", "");
    let name = format!(
        "{} {}",
        text(&visitor, "firstName"),
        text(&visitor, "lastName")
    );
    let blocked = visitor
        .get("isBlocked")
        .and_then(|item| item.as_bool())
        .unwrap_or(false);
    let photo_url = format!("/api/v1/visitors/{cedula}/photo");
    let id_photo_url = format!("/api/v1/visitors/{cedula}/id-photo");
    let edit_api = format!("/api/v1/visitors/{cedula}");
    let empresa = text(&visitor, "company");
    let cargo = text(&visitor, "jobTitle");
    let correo = text(&visitor, "email");
    let telefono = text(&visitor, "phone");
    let observaciones = text(&visitor, "observations");
    let bloqueado_texto = if blocked {
        "Sí".to_string()
    } else {
        "No".to_string()
    };
    let first_name = text(&visitor, "firstName");
    let last_name = text(&visitor, "lastName");
    let block_field = if can_block {
        view! {
            <div class="campo">
                <label>
                    <input name="isBlocked" type="checkbox" checked=blocked />
                    " Bloqueado (no puede registrar visitas)"
                </label>
            </div>
        }
        .into_any()
    } else {
        view! { "" }.into_any()
    };
    let edit_form = if can_edit {
        view! {
            <div>
                <h2>"Editar perfil"</h2>
                <p class="muted">"Cada guardado exige la contraseña de edición. El bloqueo solo lo cambian admin y root."</p>
                <form data-api-form="" data-method="PATCH" data-api={edit_api}>
                    <div class="alerta error" data-error="" hidden=true></div>
                    <div class="fila">
                        <div class="campo">
                            <label>
                                "Nombres"
                                <input name="firstName" value={first_name} required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Apellidos"
                                <input name="lastName" value={last_name} required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Empresa"
                                <input name="company" value={empresa.clone()} required />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Cargo"
                                <input name="jobTitle" value={cargo.clone()} />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Correo"
                                <input name="email" type="email" value={correo.clone()} />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Teléfono"
                                <input name="phone" value={telefono.clone()} />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Observaciones"
                                <input name="observations" value={observaciones.clone()} />
                            </label>
                        </div>
                        <div class="campo">
                            <label>
                                "Contraseña de edición"
                                <input name="editPassword" type="password" autocomplete="off" required />
                            </label>
                        </div>
                    </div>
                    {block_field}
                    <div class="acciones">
                        <button type="submit">"Guardar cambios"</button>
                    </div>
                </form>
            </div>
        }
        .into_any()
    } else {
        view! { "" }.into_any()
    };
    let visit_rows: Vec<AnyView> = if visits.is_empty() {
        vec![
            view! { <tr><td colspan="5" class="muted">"Sin visitas registradas."</td></tr> }
                .into_any(),
        ]
    } else {
        visits
            .into_iter()
            .map(|visit| {
                let purpose = text(&visit, "purpose");
                let status = text(&visit, "status");
                let status_label = status.clone();
                let check_in = text(&visit, "checkInTime");
                let check_out = text(&visit, "checkOutTime");
                let id = visit.get("id").and_then(|item| item.as_i64()).unwrap_or(0);
                let detail = format!("/visits/{id}");
                view! {
                    <tr>
                        <td>{purpose}</td>
                        <td>
                            <span class={format!("etiqueta {status}")}>{status_label}</span>
                        </td>
                        <td>{check_in}</td>
                        <td>{check_out}</td>
                        <td>
                            <a href={detail}>"Ver"</a>
                        </td>
                    </tr>
                }
                .into_any()
            })
            .collect()
    };
    let edit_rows: Vec<AnyView> = if edits.is_empty() {
        vec![
            view! { <tr><td colspan="5" class="muted">"Sin cambios registrados."</td></tr> }
                .into_any(),
        ]
    } else {
        edits
            .into_iter()
            .map(|entry| {
                let field = text(&entry, "field");
                let old = text(&entry, "oldValue");
                let new = text(&entry, "newValue");
                let by = text(&entry, "editedByUsername");
                let at = text(&entry, "editedAt");
                view! { <tr><td>{field}</td><td>{old}</td><td>{new}</td><td>{by}</td><td>{at}</td></tr> }.into_any()
            })
            .collect()
    };
    view! {
        <h1>{name}</h1>
        <section class="tarjeta">
            <h2>"Perfil"</h2>
            <p>
                <img class="foto" src={photo_url} alt="Foto del visitante" />
                <img class="foto" src={id_photo_url} alt="Foto del documento" />
            </p>
            <dl class="datos">
                <Dato label="Cédula" value=cedula />
                <Dato label="Empresa" value=empresa />
                <Dato label="Cargo" value=cargo />
                <Dato label="Correo" value=correo />
                <Dato label="Teléfono" value=telefono />
                <Dato label="Observaciones" value=observaciones />
                <Dato label="Bloqueado" value=bloqueado_texto />
            </dl>
            {edit_form}
        </section>
        <section class="tarjeta">
            <h2>"Últimas visitas"</h2>
            <table>
                <thead>
                    <tr>
                        <th>"Motivo"</th>
                        <th>"Estado"</th>
                        <th>"Entrada"</th>
                        <th>"Salida"</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>{visit_rows}</tbody>
            </table>
        </section>
        <section class="tarjeta">
            <h2>"Historial de edición"</h2>
            <table>
                <thead>
                    <tr>
                        <th>"Campo"</th>
                        <th>"Antes"</th>
                        <th>"Después"</th>
                        <th>"Por"</th>
                        <th>"Fecha"</th>
                    </tr>
                </thead>
                <tbody>{edit_rows}</tbody>
            </table>
        </section>
        <p>
            <a href="/">"Volver al punto de control"</a>
        </p>
    }
}

/// `/visitors/{cedula}`: detalle de un visitante, con foto, edición
/// (contraseña adicional), historial de visitas y de edición.
pub async fn visitor_page(
    State(state): State<ApiState>,
    session: Session,
    Path(raw): Path<String>,
) -> Response {
    let role = Role::parse(&session.role);
    let can_edit = role.is_some_and(|role| allows(role, Permission::EditProfile));
    let can_block = role.is_some_and(|role| allows(role, Permission::BlockVisitor));
    let (visitor, visits, edits) = match data::visitor_detail(&state, &raw).await {
        Ok(values) => values,
        Err(error) => return page_error(&session, &error),
    };
    let title = format!(
        "{} {}",
        text(&visitor, "firstName"),
        text(&visitor, "lastName")
    );
    let body = view! {
        <VisitorPage visitor=visitor visits=visits edits=edits can_edit=can_edit can_block=can_block />
    }
    .to_html();
    page(Some(&session), title.trim(), body)
}
