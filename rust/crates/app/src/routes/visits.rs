//! Familia `visits` (16 rutas).
//!
//! Traducción de `server-go/internal/httpapi/visits.go`,
//! `calendar.go` y `queries.go`:
//!
//! - Check-in con consentimiento individual, validación de campos y
//!   creación del perfil cuando la cédula no existe; la visita y la
//!   auditoría se escriben en la misma transacción inmediata y el
//!   aviso SSE se publica después del commit.
//! - Transiciones con la máquina de estados de la línea base (§3) y
//!   409 `OPEN_VISIT_EXISTS` / `INVALID_VISIT_STATE`.
//! - Listas por estado (sin paginación, como Go), visitas filtradas
//!   con el orden permitido y límite 10 por defecto, calendario por
//!   día de Caracas (hasta 62 días) y exportación.
//! - La exportación genera el binario en el servidor (fase 6):
//!   PDF con printpdf (hasta 2.000 visitas) y XLSX con
//!   rust_xlsxwriter (hasta 20.000), con las columnas fijas del DTO.
//! - Todo el acceso a datos va por los traits (`Repositories`) y el
//!   check-in por `UnitOfWork::checkin` (una sola transacción en
//!   ambos motores). La comprobación de bloqueo se lee antes de la
//!   transacción; la visita abierta la rechaza el índice parcial
//!   dentro de ella (`OPEN_VISIT_EXISTS`).
//! - Lectura: cualquier sesión vigente. Escrituras (check-in y
//!   transiciones): operador, admin o root (`RegisterVisit`).

use axum::{
    extract::{Path, State},
    http::{HeaderMap, Method, StatusCode, Uri},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use chrono::Duration as ChronoDuration;
use logmaster_crypto::{encrypt, identity_hash};
use logmaster_store::models::Visitor;
use logmaster_store::repos::traits::CheckinInput;
use logmaster_store::repos::visitors::NewVisitor;
use logmaster_store::repos::visits::{
    NewVisit, Transition, TransitionAudit, TransitionCall, VisitFilter,
};
use serde::Deserialize;
use serde_json::json;

use crate::common::{
    actor, audit_entry, audit_meta, date_range, decode_photo, format_instant, matching_visitor_ids,
    normalize_cedula, now_text, ok_with_extra, pagination, param, param_all, parse_id,
    parse_instant, parse_query, server_error, store_fail, valid_email, valid_text,
    validation_error, visitor_tokens, AuditMeta, MaybeJson, Params, RemoteAddr, StrictJson,
};
use crate::dto::{visit_dto, visit_dtos};
use crate::error;
use crate::http::ApiState;
use crate::roles::{require_permission, Permission};
use crate::session::Session;

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    let writes = Router::new()
        .route("/visits/checkin", post(check_in))
        .route("/visits/{id}/admit", post(admit))
        .route("/visits/{id}/checkout", post(checkout))
        .route("/visits/{id}/cancel", post(cancel))
        .route("/visits/{id}/intermittent", post(exit))
        .route("/visits/{id}/intermittent-exit", post(exit))
        .route("/visits/{id}/reactivate", post(reentry))
        .route("/visits/{id}/intermittent-reentry", post(reentry))
        .layer(middleware::from_fn_with_state(
            Permission::RegisterVisit,
            require_permission,
        ));
    Router::new()
        .route("/visits/calendar", get(calendar))
        .route("/visits/export", get(export_visits))
        .route("/visits", get(filtered_visits))
        .route("/visits/waiting", get(waiting_visits))
        .route("/visits/active", get(active_visits))
        .route("/visits/intermittent", get(intermittent_visits))
        .route("/visits/cancelled", get(cancelled_visits))
        .merge(writes)
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct VisitorDataBody {
    #[serde(default)]
    first_name: String,
    #[serde(default)]
    last_name: String,
    #[serde(default)]
    company: String,
    #[serde(default)]
    job_title: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    phone: String,
    #[serde(default)]
    photo_base64: String,
    #[serde(default)]
    id_photo_base64: String,
    #[serde(default)]
    // Go acepta `photo` en el check-in pero nunca lo lee (solo
    // `photoBase64` / `idPhotoBase64`); se conserva para no rechazar
    // el cuerpo que envía el cliente.
    #[allow(dead_code)]
    photo: String,
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ConsentBody {
    #[serde(default)]
    accepted: bool,
    #[serde(default)]
    policy_version: String,
    #[serde(default)]
    accepted_at: String,
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CheckInBody {
    #[serde(default)]
    visitor_cedula: String,
    #[serde(default)]
    purpose: String,
    #[serde(default)]
    person_to_visit: String,
    #[serde(default)]
    target_department: String,
    #[serde(default)]
    host_person: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    companion_name: String,
    #[serde(default)]
    companion_cedula: String,
    #[serde(default)]
    vehicle_brand: String,
    #[serde(default)]
    vehicle_model: String,
    #[serde(default)]
    vehicle_plate: String,
    #[serde(default)]
    area: String,
    #[serde(default)]
    action: String,
    #[serde(default)]
    department: String,
    // Go acepta estas tres horas en el check-in pero nunca las lee:
    // el servidor pone la hora real de llegada/entrada/salida. Se
    // conservan para no rechazar el cuerpo que envía el cliente.
    #[serde(default)]
    #[allow(dead_code)]
    arrival_time: String,
    #[serde(default)]
    #[allow(dead_code)]
    entry_time: String,
    #[serde(default)]
    #[allow(dead_code)]
    exit_time: String,
    #[serde(default)]
    visitor_data: Option<VisitorDataBody>,
    #[serde(default)]
    consent: ConsentBody,
}

async fn check_in(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    StrictJson(body): StrictJson<CheckInBody>,
) -> Response {
    let cedula = match normalize_cedula(&body.visitor_cedula) {
        Ok(value) => value,
        Err(()) => return validation_error("cédula inválida"),
    };
    if !body.companion_name.trim().is_empty() || !body.companion_cedula.trim().is_empty() {
        return error::fail(
            StatusCode::BAD_REQUEST,
            "INDIVIDUAL_REGISTRATION_REQUIRED",
            "Cada acompañante debe registrarse como visitante por separado",
        )
        .into_response();
    }
    let status = if body.status.is_empty() {
        "active".to_string()
    } else {
        body.status.clone()
    };
    let action = if body.action.is_empty() {
        "Ninguna".to_string()
    } else {
        body.action.clone()
    };
    let now = chrono::Utc::now();
    let accepted = parse_instant(&body.consent.accepted_at);
    if !body.consent.accepted
        || accepted.is_none()
        || accepted.is_some_and(|at| at > now + ChronoDuration::minutes(5))
        || !valid_text(&body.consent.policy_version, 20, true)
        || !valid_text(&body.purpose, 500, true)
        || !valid_text(&body.person_to_visit, 200, true)
        || !valid_text(&body.target_department, 200, true)
        || !valid_text(&body.host_person, 200, true)
        || !valid_text(&body.notes, 1000, false)
        || (status != "active" && status != "waiting")
        || (action != "Carga" && action != "Descarga" && action != "Ninguna")
    {
        return validation_error("Datos de visita o consentimiento inválidos");
    }
    for (value, max) in [
        (&body.companion_name, 200),
        (&body.companion_cedula, 255),
        (&body.vehicle_brand, 100),
        (&body.vehicle_model, 100),
        (&body.vehicle_plate, 50),
        (&body.area, 200),
        (&body.department, 200),
    ] {
        if !valid_text(value, max, false) {
            return validation_error("Datos operativos demasiado largos");
        }
    }
    let accepted_text = format_instant(accepted.expect("consentimiento ya validado"));
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        uri.path(),
    );
    let key = state.encryption_key;
    let hash = identity_hash(&key, &cedula);
    // Perfil existente: se reutiliza y se comprueba el bloqueo antes
    // de la transacción; el perfil nuevo se construye aquí y lo
    // inserta `UnitOfWork::checkin` junto a la visita, los trigramas
    // y la auditoría, en una sola transacción por motor.
    let existing = match state.repos.visitors.find_by_cedula(&hash).await {
        Ok(visitor) => Some(visitor),
        Err(logmaster_store::error::StoreError::NotFound { .. }) => None,
        Err(e) => return store_fail(&e),
    };
    if let Some(visitor) = &existing {
        if visitor.is_blocked.unwrap_or(false) {
            return error::fail(
                StatusCode::FORBIDDEN,
                "VISITOR_BLOCKED",
                "El visitante está bloqueado",
            )
            .into_response();
        }
    }
    let enc = |value: &str| -> Result<Option<String>, logmaster_crypto::CryptoError> {
        if value.is_empty() {
            Ok(None)
        } else {
            Ok(Some(encrypt(&key, value)?))
        }
    };
    // Datos del perfil nuevo (si la cédula no existe): valores
    // propios que viven hasta el `checkin`, porque `NewVisitor`
    // solo los presta.
    struct Fresh {
        first_name: String,
        last_name: String,
        encrypted_cedula: Option<String>,
        job_title: Option<String>,
        email: Option<String>,
        phone: Option<String>,
        face: Option<Vec<u8>>,
        document: Option<Vec<u8>>,
    }
    let fresh: Option<Fresh> = match &existing {
        Some(_) => None,
        None => {
            let data = match body.visitor_data.as_ref() {
                Some(data) => data,
                None => {
                    return error::fail(
                        StatusCode::BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "Datos del nuevo visitante requeridos",
                    )
                    .into_response();
                }
            };
            if !valid_text(&data.first_name, 100, true)
                || !valid_text(&data.last_name, 100, true)
                || !valid_text(&data.company, 200, true)
                || !valid_text(&data.job_title, 200, false)
                || !valid_text(&data.phone, 30, false)
                || (!data.email.is_empty() && !valid_email(&data.email))
            {
                return validation_error("Datos del nuevo visitante requeridos");
            }
            let face = if data.photo_base64.is_empty() {
                None
            } else {
                match decode_photo(&data.photo_base64) {
                    Ok(bytes) => Some(bytes),
                    Err(()) => {
                        return error::fail(
                            StatusCode::BAD_REQUEST,
                            "INVALID_PHOTO",
                            "Fotografía inválida",
                        )
                        .into_response();
                    }
                }
            };
            let document = if data.id_photo_base64.is_empty() {
                None
            } else {
                match decode_photo(&data.id_photo_base64) {
                    Ok(bytes) => Some(bytes),
                    Err(()) => {
                        return error::fail(
                            StatusCode::BAD_REQUEST,
                            "INVALID_PHOTO",
                            "Fotografía de documento inválida",
                        )
                        .into_response();
                    }
                }
            };
            // Los errores de cifrado son 500 y se devuelven
            // directamente (no hay `?` en un handler que devuelve
            // `Response`).
            let first_name = match enc(&data.first_name) {
                Ok(value) => value.unwrap_or_default(),
                Err(e) => return server_error(&e.to_string()),
            };
            let last_name = match enc(&data.last_name) {
                Ok(value) => value.unwrap_or_default(),
                Err(e) => return server_error(&e.to_string()),
            };
            let encrypted_cedula = match enc(&cedula) {
                Ok(value) => value,
                Err(e) => return server_error(&e.to_string()),
            };
            let job_title = match enc(&data.job_title) {
                Ok(value) => value,
                Err(e) => return server_error(&e.to_string()),
            };
            let email = match enc(&data.email) {
                Ok(value) => value,
                Err(e) => return server_error(&e.to_string()),
            };
            let phone = match enc(&data.phone) {
                Ok(value) => value,
                Err(e) => return server_error(&e.to_string()),
            };
            Some(Fresh {
                first_name,
                last_name,
                encrypted_cedula,
                job_title,
                email,
                phone,
                face,
                document,
            })
        }
    };
    // Trigramas: del perfil existente (reindexado) o del nuevo.
    let tokens = match (&existing, &fresh) {
        (Some(visitor), _) => match visitor_tokens(&key, visitor) {
            Ok(tokens) => tokens,
            Err(e) => return server_error(&e.to_string()),
        },
        (None, Some(data)) => {
            let transient = Visitor {
                id: 0,
                anonymized_at: None,
                cedula: hash.clone(),
                encrypted_cedula: data.encrypted_cedula.clone(),
                first_name: data.first_name.clone(),
                last_name: data.last_name.clone(),
                company: body
                    .visitor_data
                    .as_ref()
                    .map(|d| d.company.clone())
                    .unwrap_or_default(),
                job_title: data.job_title.clone(),
                photo_url: None,
                id_photo_url: None,
                email: data.email.clone(),
                phone: data.phone.clone(),
                updated_at: now_text.clone(),
                photo_data: data.face.clone(),
                id_photo_data: data.document.clone(),
                is_blocked: Some(false),
                observations: None,
                created_at: Some(now_text.clone()),
            };
            match visitor_tokens(&key, &transient) {
                Ok(tokens) => tokens,
                Err(e) => return server_error(&e.to_string()),
            }
        }
        (None, None) => unreachable!("sin perfil existente hay datos de visitante nuevo"),
    };
    let new_visitor = fresh.as_ref().map(|data| NewVisitor {
        cedula_hash: &hash,
        encrypted_cedula: data.encrypted_cedula.as_deref(),
        first_name: &data.first_name,
        last_name: &data.last_name,
        company: body
            .visitor_data
            .as_ref()
            .map(|d| d.company.as_str())
            .unwrap_or(""),
        job_title: data.job_title.as_deref(),
        email: data.email.as_deref(),
        phone: data.phone.as_deref(),
        photo_data: data.face.as_deref(),
        id_photo_data: data.document.as_deref(),
        created_at: &now_text,
        updated_at: &now_text,
    });
    let visit = NewVisit {
        visitor_cedula: &hash,
        visitor_id: 0,
        purpose: &body.purpose,
        person_to_visit: &body.person_to_visit,
        status: &status,
        notes: Some(body.notes.as_str()),
        companion_name: Some(body.companion_name.as_str()),
        companion_cedula: Some(body.companion_cedula.as_str()),
        vehicle_brand: Some(body.vehicle_brand.as_str()),
        vehicle_model: Some(body.vehicle_model.as_str()),
        vehicle_plate: Some(body.vehicle_plate.as_str()),
        area: Some(body.area.as_str()),
        action: &action,
        department: Some(body.department.as_str()),
        target_department: Some(body.target_department.as_str()),
        host_person: Some(body.host_person.as_str()),
        arrival_time: &now_text,
        entry_time: if status == "active" {
            Some(now_text.as_str())
        } else {
            None
        },
        check_in_time: &now_text,
        consent_policy_version: &body.consent.policy_version,
        consent_accepted_at: &accepted_text,
        consent_recorded_by: session.id,
        created_at: &now_text,
        updated_at: &now_text,
    };
    let entry = audit_entry(
        &meta,
        &session,
        "VISIT_CHECKIN",
        "Visit",
        "",
        None,
        &now_text,
    );
    let outcome = match state
        .repos
        .uow
        .checkin(&CheckinInput {
            cedula_hash: &hash,
            new_visitor: new_visitor.as_ref(),
            visit: &visit,
            search_tokens: &tokens,
            actor: &actor(&session),
            audit: &entry,
        })
        .await
    {
        Ok(outcome) => outcome,
        Err(e) => return store_fail(&e),
    };
    let visit_id = outcome.visit_id;
    state.events.publish("visit:checked-in", visit_id);
    let visit = match state.repos.visits.find_by_id(visit_id).await {
        Ok(visit) => visit,
        Err(e) => return store_fail(&e),
    };
    match visit_dto(&state.repos, &state.encryption_key, &visit).await {
        Ok(dto) => (StatusCode::CREATED, error::ok(dto)).into_response(),
        Err(e) => server_error(&e.to_string()),
    }
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct TransitionBody {
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    reason: String,
}

/// Metadatos de auditoría de una transición (POST a una ruta de visita).
fn transition_meta(
    state: &ApiState,
    session: &Session,
    headers: &HeaderMap,
    remote: RemoteAddr,
    uri: &Uri,
) -> AuditMeta {
    audit_meta(
        headers,
        remote.0,
        &state.trusted_proxies,
        session,
        &Method::POST,
        uri.path(),
    )
}

async fn transition_op(
    state: &ApiState,
    session: &Session,
    meta: AuditMeta,
    id: i64,
    operation: Transition,
    event: &str,
    body: TransitionBody,
) -> Response {
    if operation == Transition::Cancel && !valid_text(&body.reason, 1000, true) {
        return validation_error("Indica el motivo de cancelación");
    }
    if let Some(notes) = &body.notes {
        if !valid_text(notes, 1000, false) {
            return validation_error("Observaciones demasiado largas");
        }
    }
    let now_text = now_text();
    let reason = if operation == Transition::Cancel {
        Some(body.reason.as_str())
    } else {
        None
    };
    let visit = match state
        .repos
        .visits
        .transition(
            id,
            operation,
            &TransitionCall {
                actor: &actor(session),
                notes: body.notes.as_deref(),
                reason,
                now: &now_text,
                audit: Some(&TransitionAudit {
                    ip_address: meta.ip.as_deref(),
                    user_agent: meta.user_agent.as_deref(),
                    role: meta.role.as_deref(),
                    method: meta.method.as_deref(),
                    path: meta.path.as_deref(),
                }),
            },
        )
        .await
    {
        Ok(visit) => visit,
        Err(e) => return store_fail(&e),
    };
    state.events.publish(event, visit.id);
    let visit = match state.repos.visits.find_by_id(visit.id).await {
        Ok(visit) => visit,
        Err(e) => return store_fail(&e),
    };
    match visit_dto(&state.repos, &state.encryption_key, &visit).await {
        Ok(dto) => error::ok(dto).into_response(),
        Err(e) => server_error(&e.to_string()),
    }
}

async fn admit(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    MaybeJson(body): MaybeJson<TransitionBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    let meta = transition_meta(&state, &session, &headers, remote, &uri);
    transition_op(
        &state,
        &session,
        meta,
        id,
        Transition::Admit,
        "visit:admitted",
        body,
    )
    .await
}

async fn checkout(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    MaybeJson(body): MaybeJson<TransitionBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    let meta = transition_meta(&state, &session, &headers, remote, &uri);
    transition_op(
        &state,
        &session,
        meta,
        id,
        Transition::Checkout,
        "visit:checked-out",
        body,
    )
    .await
}

async fn cancel(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    MaybeJson(body): MaybeJson<TransitionBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    let meta = transition_meta(&state, &session, &headers, remote, &uri);
    transition_op(
        &state,
        &session,
        meta,
        id,
        Transition::Cancel,
        "visit:cancelled",
        body,
    )
    .await
}

async fn exit(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    MaybeJson(body): MaybeJson<TransitionBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    let meta = transition_meta(&state, &session, &headers, remote, &uri);
    transition_op(
        &state,
        &session,
        meta,
        id,
        Transition::Exit,
        "visit:intermittent-exit",
        body,
    )
    .await
}

async fn reentry(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    MaybeJson(body): MaybeJson<TransitionBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    let meta = transition_meta(&state, &session, &headers, remote, &uri);
    transition_op(
        &state,
        &session,
        meta,
        id,
        Transition::Reentry,
        "visit:intermittent-reentry",
        body,
    )
    .await
}

async fn status_visits(state: &ApiState, status: &str) -> Response {
    let visits = match state.repos.visits.list_by_status(status, i64::MAX, 0).await {
        Ok(visits) => visits,
        Err(e) => return store_fail(&e),
    };
    match visit_dtos(&state.repos, &state.encryption_key, &visits).await {
        Ok(items) => error::ok(json!(items)).into_response(),
        Err(e) => server_error(&e.to_string()),
    }
}

async fn waiting_visits(State(state): State<ApiState>) -> Response {
    status_visits(&state, "waiting").await
}

async fn active_visits(State(state): State<ApiState>) -> Response {
    status_visits(&state, "active").await
}

async fn intermittent_visits(State(state): State<ApiState>) -> Response {
    status_visits(&state, "intermittent").await
}

async fn cancelled_visits(State(state): State<ApiState>) -> Response {
    status_visits(&state, "cancelled").await
}

/// Orden permitido de Go (`parseVisitSort` en `queries.go`).
fn parse_visit_sort(params: &Params) -> Result<(String, String), Box<Response>> {
    if param_all(params, "sortField").len() > 1 || param_all(params, "sortDirection").len() > 1 {
        return Err(Box::new(validation_error("ordenamiento inválido")));
    }
    let field = param(params, "sortField").unwrap_or("check_in_time");
    let direction = param(params, "sortDirection")
        .unwrap_or("desc")
        .to_lowercase();
    let known = matches!(
        field,
        "arrival_time"
            | "check_in_time"
            | "entry_time"
            | "exit_time"
            | "check_out_time"
            | "status"
            | "company"
    );
    if !known || (direction != "asc" && direction != "desc") {
        return Err(Box::new(validation_error("ordenamiento inválido")));
    }
    Ok((field.to_string(), direction))
}

/// Filtro común de las visitas filtradas y la exportación
/// (`visitFilter` en `queries.go`).
async fn build_visit_filter(
    state: &ApiState,
    params: &Params,
    sort_field: String,
    sort_dir: String,
    limit: i64,
    offset: i64,
) -> Result<VisitFilter, Box<Response>> {
    let (start, end) = date_range(params)?;
    let status = param(params, "status");
    if let Some(status) = status {
        if !matches!(
            status,
            "active" | "waiting" | "intermittent" | "completed" | "cancelled"
        ) {
            return Err(Box::new(validation_error("estado inválido")));
        }
    }
    let company = param(params, "company");
    if let Some(company) = company {
        if company.len() > 500 {
            return Err(Box::new(validation_error("empresa inválida")));
        }
    }
    let cedula_hash = match param(params, "visitorCedula") {
        Some(raw) => Some(
            normalize_cedula(raw)
                .map(|cedula| identity_hash(&state.encryption_key, &cedula))
                .map_err(|()| Box::new(validation_error("cédula inválida")))?,
        ),
        None => None,
    };
    let search = param(params, "search");
    if let Some(search) = search {
        if search.len() > 500 {
            return Err(Box::new(validation_error("búsqueda demasiado larga")));
        }
    }
    // La búsqueda por trigramas se resuelve antes de la consulta, como
    // en Go.
    let visitor_ids = match search {
        Some(text) => Some(matching_visitor_ids(&state.repos, &state.encryption_key, text).await?),
        None => None,
    };
    Ok(VisitFilter {
        start: start.map(format_instant),
        end: end.map(format_instant),
        status: status.map(str::to_string),
        company: company.map(str::to_string),
        cedula_hash,
        visitor_ids,
        search: search.map(str::to_string),
        sort_field,
        sort_dir,
        limit,
        offset,
    })
}

async fn filtered_visits(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let (sort_field, sort_dir) = match parse_visit_sort(&params) {
        Ok(sort) => sort,
        Err(response) => return *response,
    };
    let (page, limit) = match pagination(&params, 10) {
        Ok(values) => values,
        Err(response) => return *response,
    };
    let filter = match build_visit_filter(
        &state,
        &params,
        sort_field,
        sort_dir,
        limit,
        (page - 1) * limit,
    )
    .await
    {
        Ok(filter) => filter,
        Err(response) => return *response,
    };
    let (visits, total) = match state.repos.visits.list_filtered(&filter).await {
        Ok(values) => values,
        Err(e) => return store_fail(&e),
    };
    let items = match visit_dtos(&state.repos, &state.encryption_key, &visits).await {
        Ok(items) => items,
        Err(e) => return server_error(&e.to_string()),
    };
    let total_pages = (total + limit - 1) / limit;
    ok_with_extra(
        json!({"visits": items, "total": total, "page": page, "limit": limit}),
        json!({"meta": {"page": page, "limit": limit, "total": total, "totalPages": total_pages}}),
    )
    .into_response()
}

async fn calendar(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let (start, end) = match date_range(&params) {
        Ok(range) => range,
        Err(response) => return *response,
    };
    let (Some(start), Some(end)) = (start, end) else {
        return validation_error("Selecciona un rango de hasta 62 días");
    };
    if end - start > ChronoDuration::hours(24 * 62) {
        return validation_error("Selecciona un rango de hasta 62 días");
    }
    let status = param(&params, "status").unwrap_or("");
    if !matches!(
        status,
        "" | "active" | "completed" | "waiting" | "intermittent" | "cancelled"
    ) {
        return validation_error("Estado inválido");
    }
    let days = match state
        .repos
        .visits
        .calendar_counts(&format_instant(start), &format_instant(end), status)
        .await
    {
        Ok(days) => days,
        Err(e) => return store_fail(&e),
    };
    error::ok(json!({"days": days
        .iter()
        .map(|(date, count)| json!({"date": date, "count": count}))
        .collect::<Vec<_>>()}))
    .into_response()
}

async fn export_visits(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let maximum = match param(&params, "format") {
        Some("pdf") => 2000,
        Some("xlsx") => 20000,
        _ => return validation_error("formato de exportación inválido"),
    };
    let (sort_field, sort_dir) = match parse_visit_sort(&params) {
        Ok(sort) => sort,
        Err(response) => return *response,
    };
    let filter = match build_visit_filter(&state, &params, sort_field, sort_dir, maximum, 0).await {
        Ok(filter) => filter,
        Err(response) => return *response,
    };
    let (visits, total) = match state.repos.visits.list_filtered(&filter).await {
        Ok(values) => values,
        Err(e) => return store_fail(&e),
    };
    if total > maximum {
        return error::fail(
            StatusCode::PAYLOAD_TOO_LARGE,
            "EXPORT_LIMIT_EXCEEDED",
            &format!("El formato admite hasta {maximum} visitas; aplica filtros más estrechos"),
        )
        .into_response();
    }
    let items = match visit_dtos(&state.repos, &state.encryption_key, &visits).await {
        Ok(items) => items,
        Err(e) => return server_error(&e.to_string()),
    };
    let format = param(&params, "format").unwrap_or("");
    match format {
        "pdf" => match crate::export::visits_pdf(&items, total) {
            Ok(bytes) => (
                [
                    (axum::http::header::CONTENT_TYPE, "application/pdf"),
                    (
                        axum::http::header::CONTENT_DISPOSITION,
                        "attachment; filename=\"visitas.pdf\"",
                    ),
                ],
                bytes,
            )
                .into_response(),
            Err(e) => server_error(&e.to_string()),
        },
        "xlsx" => match crate::export::visits_xlsx(&items) {
            Ok(bytes) => (
                [
                    (
                        axum::http::header::CONTENT_TYPE,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    ),
                    (
                        axum::http::header::CONTENT_DISPOSITION,
                        "attachment; filename=\"visitas.xlsx\"",
                    ),
                ],
                bytes,
            )
                .into_response(),
            Err(e) => server_error(&e.to_string()),
        },
        _ => validation_error("formato de exportación inválido"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request},
        Router,
    };
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use tower::ServiceExt;

    use crate::config::Config;
    use crate::http::build_router_with_state;
    use crate::session::SessionService;

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config::fixture()
    }

    fn test_state() -> (ApiState, SessionService) {
        let store = logmaster_store::Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state = ApiState::new(logmaster_store::Database::Sqlite(store), &test_config());
        let service = state.session.clone();
        (state, service)
    }

    async fn seed_user(state: &ApiState, username: &str, role: &str) -> i64 {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .repos
            .users
            .insert(&NewUser {
                username,
                email: Some("usuario@example.test"),
                password_hash: &hash,
                role,
                must_change_password: false,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap()
    }

    async fn token_for(service: &SessionService, state: &ApiState, user_id: i64) -> String {
        let user = state.repos.users.find_by_id(user_id).await.unwrap();
        service
            .issue(&Session::from_user(&user))
            .unwrap()
            .access_token
    }

    async fn request(
        router: Router,
        method: Method,
        uri: &str,
        token: Option<&str>,
        body: Option<&str>,
    ) -> (StatusCode, serde_json::Value) {
        let mut builder = Request::builder().method(method.clone()).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        // Las escrituras exigen origen (como en Go); las lecturas no.
        if !matches!(method, Method::GET | Method::HEAD) {
            builder = builder.header("origin", APP_ORIGIN);
        }
        if body.is_some() {
            builder = builder.header("content-type", "application/json");
        }
        let request = builder
            .body(Body::from(body.unwrap_or_default().to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, value)
    }

    /// Como `request`, pero devuelve los bytes crudos y el
    /// content-type (para las exportaciones binarias).
    async fn request_bytes(
        router: Router,
        method: Method,
        uri: &str,
        token: Option<&str>,
    ) -> (StatusCode, Option<String>, Vec<u8>) {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        let request = builder.body(Body::empty()).unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let content_type = response
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string());
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec();
        (status, content_type, bytes)
    }

    fn checkin_body(cedula: &str) -> String {
        format!(
            r#"{{"visitorCedula":"{cedula}","purpose":"Reunión","personToVisit":"Anfitrión","targetDepartment":"Producción","hostPerson":"Jefe","status":"waiting","visitorData":{{"firstName":"Ana","lastName":"Pérez","company":"Trébol"}},"consent":{{"accepted":true,"policyVersion":"v1","acceptedAt":"2026-11-10T00:00:00Z"}}}}"#
        )
    }

    #[tokio::test]
    async fn checkin_creates_visitor_and_visit_then_full_cycle() {
        let (state, service) = test_state();
        let user_id = seed_user(&state, "operador-1", "operador").await;
        let token = token_for(&service, &state, user_id).await;
        let router = build_router_with_state(state.clone());

        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(&token),
            Some(&checkin_body("V-12345678")),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        assert_eq!(body["data"]["status"], "waiting");
        assert_eq!(body["data"]["visitorName"], "Ana Pérez");
        assert_eq!(body["data"]["visitorCedula"], "V-12345678");
        let visit_id = body["data"]["id"].as_i64().unwrap();

        // Segunda visita abierta para la misma cédula: 409.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(&token),
            Some(&checkin_body("V-12345678")),
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"]["code"], "OPEN_VISIT_EXISTS");

        // Lista de espera la contiene; admitir, salir, reingresar y salir.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits/waiting",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"].as_array().unwrap().len(), 1);

        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/admit"),
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["status"], "active");

        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/admit"),
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"]["code"], "INVALID_VISIT_STATE");

        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/intermittent-exit"),
            Some(&token),
            Some(r#"{"notes":"Almuerzo"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["status"], "intermittent");
        assert_eq!(body["data"]["totalIntermittentEvents"], 1);

        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/intermittent-reentry"),
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["status"], "active");

        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/checkout"),
            Some(&token),
            Some(r#"{"notes":"Salió"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["status"], "completed");
        assert_eq!(body["data"]["notes"], "Salió");
    }

    #[tokio::test]
    async fn checkin_validation_and_roles() {
        let (state, service) = test_state();
        let operator_id = seed_user(&state, "operador-2", "operador").await;
        let auditor_id = seed_user(&state, "auditor-2", "auditor").await;
        let operator = token_for(&service, &state, operator_id).await;
        let auditor = token_for(&service, &state, auditor_id).await;
        let router = build_router_with_state(state.clone());

        // Sin sesión: 401.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            None,
            Some(&checkin_body("V-12345678")),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"]["code"], "UNAUTHORIZED");

        // Auditor no puede registrar: 403.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(&auditor),
            Some(&checkin_body("V-12345678")),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "FORBIDDEN");

        // Acompañante en el mismo registro: 400 específico.
        let body_with_companion = checkin_body("V-12345678").replace(
            "\"status\":\"waiting\"",
            "\"status\":\"waiting\",\"companionName\":\"Luis\"",
        );
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(&operator),
            Some(&body_with_companion),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "INDIVIDUAL_REGISTRATION_REQUIRED");

        // Sin consentimiento: 400.
        let no_consent =
            checkin_body("V-12345678").replace("\"accepted\":true", "\"accepted\":false");
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(&operator),
            Some(&no_consent),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

        // Visitante nuevo sin datos: 400.
        let no_data = checkin_body("V-12345678").replace(
            r#","visitorData":{"firstName":"Ana","lastName":"Pérez","company":"Trébol"}"#,
            "",
        );
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(&operator),
            Some(&no_data),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
    }

    #[tokio::test]
    async fn cancel_requires_reason_and_filtered_lists_work() {
        let (state, service) = test_state();
        let user_id = seed_user(&state, "operador-3", "operador").await;
        let token = token_for(&service, &state, user_id).await;
        let router = build_router_with_state(state.clone());

        let (_, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(&token),
            Some(&checkin_body("V-87654321")),
        )
        .await;
        let visit_id = body["data"]["id"].as_i64().unwrap();

        // Cancelar sin motivo: 400.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/cancel"),
            Some(&token),
            Some(r#"{}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/cancel"),
            Some(&token),
            Some(r#"{"reason":"No vino"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["status"], "cancelled");
        assert_eq!(body["data"]["cancellationReason"], "No vino");

        // Filtrado por estado y paginación con meta.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits?status=cancelled",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["total"], 1);
        assert_eq!(body["meta"]["totalPages"], 1);
        assert_eq!(body["data"]["visits"][0]["id"], visit_id);

        // Orden inválido: 400.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits?sortField=nombre",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

        // Búsqueda corta: 400 SEARCH_TOO_SHORT.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits?search=An",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "SEARCH_TOO_SHORT");

        // Búsqueda por nombre encuentra la visita cancelada.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits?search=Ana",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["total"], 1);

        // Calendario: la visita cae hoy en Caracas.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits/calendar?startDate=2026-11-01&endDate=2026-12-01",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["days"].as_array().unwrap().len(), 1);

        // Rango de más de 62 días: 400.
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits/calendar?startDate=2026-01-01&endDate=2026-12-01",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Exportación sin formato: 400; con formato: binario real.
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visits/export",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let (status, content_type, bytes) = request_bytes(
            router.clone(),
            Method::GET,
            "/api/v1/visits/export?format=pdf",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("application/pdf"));
        assert!(bytes.starts_with(b"%PDF-"));
        let (status, content_type, bytes) = request_bytes(
            router.clone(),
            Method::GET,
            "/api/v1/visits/export?format=xlsx",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            content_type.as_deref(),
            Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        );
        assert!(bytes.starts_with(b"PK\x03\x04"));
    }
}
