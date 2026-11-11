//! Familia `privacy` (7 rutas).
//!
//! Traducción de `server-go/internal/httpapi/privacy.go`:
//!
//! - Solicitudes ARCO: crear (con oposición por ruta de titular),
//!   listar con filtros y cambiar de estado.
//! - Acceso del titular: perfil descifrado + visitas, con auditoría
//!   `ARCO_ACCESS_EXECUTED` en la misma transacción.
//! - Rectificación: delega en la edición de perfil, con los campos
//!   restringidos a los de Go.
//! - Cancelación: exige constancia de verificación de identidad y
//!   que no haya visitas abiertas; anonimiza en una sola transacción
//!   (`cancel_subject`) y deja la solicitud resuelta como constancia.
//! - Crear y oponerse: operador, admin o root (`CreateArco`).
//!   Consultar solicitudes y datos: admin, root o auditor
//!   (`ReadArco`). Cambiar estado y cancelar: admin o root
//!   (`ManageArco`).

use axum::{
    extract::{Path, State},
    http::{HeaderMap, Method, StatusCode, Uri},
    middleware,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Router,
};
use logmaster_crypto::{encrypt, identity_hash, random_token};
use logmaster_store::repos::privacy::{ArcoFilter, CancelAudit, NewArcoRequest};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::common::{
    actor, audit_entry, audit_meta, normalize_cedula, now_text, pagination, param, parse_id,
    parse_query, server_error, store_fail, valid_email, valid_text, validation_error, RemoteAddr,
    StrictJson,
};
use crate::dto::{arco_dto, visitor_dto};
use crate::error;
use crate::http::ApiState;
use crate::roles::{require_permission, Permission};
use crate::routes::visitors::edit_visitor_with_body;
use crate::session::Session;

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    let reads = Router::new()
        .route("/privacy/arco-requests", get(arco_list))
        .route("/privacy/subjects/{cedula}", get(subject_access))
        .layer(middleware::from_fn_with_state(
            Permission::ReadArco,
            require_permission,
        ));
    let manages = Router::new()
        .route("/privacy/arco-requests/{id}/status", patch(arco_status))
        .route("/privacy/subjects/{cedula}", delete(subject_cancel))
        .layer(middleware::from_fn_with_state(
            Permission::ManageArco,
            require_permission,
        ));
    let creates = Router::new()
        .route("/privacy/arco-requests", post(arco_create))
        .route(
            "/privacy/subjects/{cedula}/opposition",
            post(arco_opposition),
        )
        .route("/privacy/subjects/{cedula}", patch(subject_rectify))
        .layer(middleware::from_fn_with_state(
            Permission::CreateArco,
            require_permission,
        ));
    // La rectificación lleva el mismo permiso que la creación
    // (operador, admin, root) en Go; el núcleo de edición aplica
    // además sus propias comprobaciones por campo.
    Router::new().merge(reads).merge(manages).merge(creates)
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ArcoCreateBody {
    #[serde(default)]
    request_type: String,
    #[serde(default)]
    cedula: String,
    #[serde(default)]
    requested_by_name: String,
    #[serde(default)]
    contact_email: String,
    #[serde(default)]
    reason: String,
    #[serde(default)]
    request_payload: Option<Map<String, Value>>,
}

async fn arco_create_inner(
    state: &ApiState,
    session: &Session,
    headers: &HeaderMap,
    remote: RemoteAddr,
    uri: &Uri,
    mut body: ArcoCreateBody,
    cedula_override: Option<String>,
    type_override: Option<&str>,
) -> Response {
    if let Some(cedula) = cedula_override {
        body.cedula = cedula;
    }
    if let Some(kind) = type_override {
        body.request_type = kind.to_string();
    }
    let cedula = match normalize_cedula(&body.cedula) {
        Ok(value) => value,
        Err(()) => return validation_error("Solicitud de privacidad inválida"),
    };
    let allowed = matches!(
        body.request_type.as_str(),
        "access" | "rectification" | "cancellation" | "opposition"
    );
    if !allowed
        || !valid_text(&body.requested_by_name, 120, true)
        || body.requested_by_name.trim().chars().count() < 2
        || !valid_text(&body.contact_email, 200, false)
        || (!body.contact_email.is_empty() && !valid_email(&body.contact_email))
        || !valid_text(&body.reason, 1000, false)
    {
        return validation_error("Solicitud de privacidad inválida");
    }
    let payload = match &body.request_payload {
        Some(map) => match serde_json::to_string(map) {
            Ok(text) => Some(text),
            Err(_) => return validation_error("Contenido inválido"),
        },
        None => None,
    };
    let key = state.encryption_key;
    let encrypted = match encrypt(&key, &cedula) {
        Ok(value) => value,
        Err(e) => return server_error(&e.to_string()),
    };
    let hash = identity_hash(&key, &cedula);
    let now_text = now_text();
    let meta = audit_meta(
        headers,
        remote.0,
        &state.trusted_proxies,
        session,
        &Method::POST,
        uri.path(),
    );
    let requested_by_name = body.requested_by_name.trim().to_string();
    let contact_email = if body.contact_email.is_empty() {
        None
    } else {
        Some(body.contact_email.clone())
    };
    let reason = if body.reason.is_empty() {
        None
    } else {
        Some(body.reason.clone())
    };
    // El `entity_id` lo rellena `UnitOfWork::create_arco` con el id
    // real de la solicitud, como en Go.
    let entry = audit_entry(
        &meta,
        &session,
        "ARCO_REQUEST_CREATED",
        "ArcoRequest",
        "",
        None,
        &now_text,
    );
    let id = match state
        .repos
        .uow
        .create_arco(
            &NewArcoRequest {
                request_type: &body.request_type,
                subject_cedula_hash: &hash,
                subject_cedula_encrypted: Some(&encrypted),
                requested_by_name: &requested_by_name,
                requested_by_user_id: Some(session.id),
                contact_email: contact_email.as_deref(),
                reason: reason.as_deref(),
                request_payload: payload.as_deref(),
                created_at: &now_text,
                updated_at: &now_text,
            },
            &entry,
        )
        .await
    {
        Ok(id) => id,
        Err(e) => return store_fail(&e),
    };
    let request = match state.repos.arco.find_request_by_id(id).await {
        Ok(request) => request,
        Err(e) => return store_fail(&e),
    };
    match arco_dto(&key, &request) {
        Ok(dto) => (StatusCode::CREATED, error::ok(dto)).into_response(),
        Err(e) => server_error(&e.to_string()),
    }
}

async fn arco_create(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    StrictJson(body): StrictJson<ArcoCreateBody>,
) -> Response {
    arco_create_inner(&state, &session, &headers, remote, &uri, body, None, None).await
}

async fn arco_opposition(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<ArcoCreateBody>,
) -> Response {
    arco_create_inner(
        &state,
        &session,
        &headers,
        remote,
        &uri,
        body,
        Some(raw),
        Some("opposition"),
    )
    .await
}

async fn arco_list(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let (page, limit) = match pagination(&params, 20) {
        Ok(values) => values,
        Err(response) => return *response,
    };
    let status = param(&params, "status");
    let kind = param(&params, "requestType");
    let search = param(&params, "search");
    if status
        .is_some_and(|value| !matches!(value, "pending" | "in_progress" | "completed" | "rejected"))
        || kind.is_some_and(|value| {
            !matches!(
                value,
                "access" | "rectification" | "cancellation" | "opposition"
            )
        })
        || search.is_some_and(|value| value.len() > 500)
    {
        return validation_error("Filtros inválidos");
    }
    let cedula_hash = match search {
        Some(text) => normalize_cedula(text)
            .ok()
            .map(|cedula| identity_hash(&state.encryption_key, &cedula)),
        None => None,
    };
    let filter = ArcoFilter {
        status: status.filter(|value| !value.is_empty()).map(str::to_string),
        request_type: kind.filter(|value| !value.is_empty()).map(str::to_string),
        search: search.filter(|value| !value.is_empty()).map(str::to_string),
        cedula_hash,
        limit,
        offset: (page - 1) * limit,
    };
    let (requests, total) = match state.repos.arco.list_filtered(&filter).await {
        Ok(values) => values,
        Err(e) => return store_fail(&e),
    };
    let items: Vec<Value> = match requests
        .iter()
        .map(|request| arco_dto(&state.encryption_key, request))
        .collect::<Result<_, _>>()
    {
        Ok(items) => items,
        Err(e) => return server_error(&e.to_string()),
    };
    let pages = (total + limit - 1) / limit;
    error::ok(json!({"requests": items, "pagination": {"page": page, "limit": limit, "total": total, "pages": pages}}))
        .into_response()
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ArcoStatusBody {
    #[serde(default)]
    status: String,
    #[serde(default)]
    resolution_notes: Option<String>,
}

async fn arco_status(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<ArcoStatusBody>,
) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    if !matches!(
        body.status.as_str(),
        "pending" | "in_progress" | "completed" | "rejected"
    ) || body
        .resolution_notes
        .as_deref()
        .is_some_and(|notes| !valid_text(notes, 1000, false))
    {
        return validation_error("Estado inválido");
    }
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::PATCH,
        uri.path(),
    );
    let resolved_at = if matches!(body.status.as_str(), "completed" | "rejected") {
        Some(now_text.clone())
    } else {
        None
    };
    let existing = match state.repos.arco.find_request_by_id(id).await {
        Ok(request) => request,
        Err(logmaster_store::error::StoreError::NotFound { .. }) => {
            return error::fail(
                StatusCode::NOT_FOUND,
                "NOT_FOUND",
                "Solicitud no encontrada",
            )
            .into_response();
        }
        Err(e) => return store_fail(&e),
    };
    // Go fuerza las notas a NULL cuando la solicitud no guarda la
    // cédula cifrada (la constancia de cancelación, por ejemplo).
    let notes = if existing.subject_cedula_encrypted.is_none() {
        None
    } else {
        body.resolution_notes.as_deref()
    };
    let id_text = id.to_string();
    let entry = audit_entry(
        &meta,
        &session,
        "ARCO_REQUEST_STATUS_UPDATED",
        "ArcoRequest",
        &id_text,
        None,
        &now_text,
    );
    let request = match state
        .repos
        .uow
        .update_arco_status(
            id,
            &body.status,
            notes,
            resolved_at.as_deref(),
            &now_text,
            &entry,
        )
        .await
    {
        Ok(request) => request,
        Err(e) => return store_fail(&e),
    };
    match arco_dto(&state.encryption_key, &request) {
        Ok(dto) => error::ok(dto).into_response(),
        Err(e) => server_error(&e.to_string()),
    }
}

async fn subject_access(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
) -> Response {
    let params = parse_query(&uri);
    let (_, limit) = match pagination(&params, 50) {
        Ok(values) => values,
        Err(response) => return *response,
    };
    let cedula = match normalize_cedula(&raw) {
        Ok(value) => value,
        Err(()) => return validation_error("cédula inválida"),
    };
    let hash = identity_hash(&state.encryption_key, &cedula);
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::GET,
        uri.path(),
    );
    let entry = audit_entry(
        &meta,
        &session,
        "ARCO_ACCESS_EXECUTED",
        "Visitor",
        "",
        None,
        &now_text,
    );
    let (visitor, visits) = match state.repos.uow.subject_access(&hash, limit, &entry).await {
        Ok(values) => values,
        Err(e) => return store_fail(&e),
    };
    let profile = match visitor_dto(&state.encryption_key, &visitor) {
        Ok(profile) => profile,
        Err(e) => return server_error(&e.to_string()),
    };
    let items: Vec<Value> = visits
        .iter()
        .map(|visit| {
            json!({
                "id": visit.id,
                "status": visit.status,
                "purpose": visit.purpose,
                "personToVisit": visit.person_to_visit,
                "checkInTime": visit.check_in_time,
                "checkOutTime": visit.check_out_time,
                "notes": visit.notes,
            })
        })
        .collect();
    error::ok(json!({"visitor": profile, "visits": items})).into_response()
}

async fn subject_rectify(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<Map<String, Value>>,
) -> Response {
    for field in body.keys() {
        if !matches!(
            field.as_str(),
            "editPassword"
                | "visitId"
                | "firstName"
                | "lastName"
                | "company"
                | "jobTitle"
                | "email"
                | "phone"
        ) {
            return validation_error("Campo de rectificación inválido");
        }
    }
    edit_visitor_with_body(&state, &session, &headers, remote, &uri, &raw, body).await
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SubjectCancelBody {
    #[serde(default)]
    identity_verified: bool,
    #[serde(default)]
    verification_method: String,
}

async fn subject_cancel(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<SubjectCancelBody>,
) -> Response {
    let method = body.verification_method.trim().to_string();
    if !body.identity_verified || !valid_text(&method, 100, true) || method.chars().count() < 3 {
        return error::fail(
            StatusCode::BAD_REQUEST,
            "IDENTITY_VERIFICATION_REQUIRED",
            "Confirma la verificación de identidad e indica el procedimiento aplicado",
        )
        .into_response();
    }
    let cedula = match normalize_cedula(&raw) {
        Ok(value) => value,
        Err(()) => return validation_error("cédula inválida"),
    };
    let hash = identity_hash(&state.encryption_key, &cedula);
    let reference = match random_token() {
        Ok(token) => token,
        Err(e) => return server_error(&e.to_string()),
    };
    let now_text = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::DELETE,
        uri.path(),
    );
    let audit_path = format!("/api/v1/privacy/subjects/{reference}");
    let visitor = match state.repos.visitors.find_by_cedula(&hash).await {
        Ok(visitor) => visitor,
        Err(e) => return store_fail(&e),
    };
    if let Err(e) = state
        .repos
        .arco
        .cancel_subject(
            visitor.id,
            &cedula,
            &hash,
            &reference,
            &actor(&session),
            &method,
            &now_text,
            Some(&CancelAudit {
                ip_address: meta.ip.as_deref(),
                user_agent: meta.user_agent.as_deref(),
                role: meta.role.as_deref(),
                method: meta.method.as_deref(),
                path: Some(&audit_path),
            }),
        )
        .await
    {
        return store_fail(&e);
    }
    state.events.publish("visit:anonymized", 0);
    error::ok(
        json!({"message": "Datos personales cancelados; eventos conservados de forma anónima"}),
    )
    .into_response()
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
        Config {
            bind: "127.0.0.1".to_string(),
            port: 8443,
            db_path: "data/logmaster.db".into(),
            database_engine: logmaster_store::DatabaseEngine::Sqlite,
            database_url: None,
            test_connection_on_startup: true,
            install_folder: r"C:\LogMaster".to_string(),
            desktop_shortcut: true,
            config_path: None,
            jwt_secret: "fixture-only-not-a-real-secret-fixture-only-not-a-real-secret-"
                .to_string(),
            refresh_secret: "fixture-refresh-secret-fixture-refresh-secret-fixture--".to_string(),
            encryption_key: [0x19u8; 32],
            edit_password: "fixture-edit-password".to_string(),
            access_ttl: std::time::Duration::from_secs(15 * 60),
            refresh_ttl: std::time::Duration::from_secs(7 * 24 * 3600),
            absolute_session_ttl: std::time::Duration::from_secs(7 * 24 * 3600),
            max_login_attempts: 5,
            lockout_minutes: 15,
            audit_retention_days: 365,
            retention_enabled: false,
            backup_path: None,
            rate_window_ms: 60_000,
            rate_max_requests: 100,
            app_url: APP_ORIGIN.to_string(),
            cors_origins: vec![],
            trusted_proxies: vec![],
        }
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

    async fn checkin(router: &Router, token: &str, cedula: &str) -> i64 {
        let body = format!(
            r#"{{"visitorCedula":"{cedula}","purpose":"Reunión","personToVisit":"Anfitrión","targetDepartment":"Producción","hostPerson":"Jefe","status":"active","visitorData":{{"firstName":"Ana","lastName":"Pérez","company":"Trébol"}},"consent":{{"accepted":true,"policyVersion":"v1","acceptedAt":"2026-11-10T00:00:00Z"}}}}"#
        );
        let (status, value) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(token),
            Some(&body),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{value}");
        value["data"]["id"].as_i64().unwrap()
    }

    #[tokio::test]
    async fn arco_create_list_and_status_flow() {
        let (state, service) = test_state();
        let operator_id = seed_user(&state, "operador-p", "operador").await;
        let admin_id = seed_user(&state, "admin-p", "admin").await;
        let auditor_id = seed_user(&state, "auditor-p", "auditor").await;
        let operator = token_for(&service, &state, operator_id).await;
        let admin = token_for(&service, &state, admin_id).await;
        let auditor = token_for(&service, &state, auditor_id).await;
        let router = build_router_with_state(state.clone());

        // Crear solicitud de acceso.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/privacy/arco-requests",
            Some(&operator),
            Some(r#"{"requestType":"access","cedula":"V-12345678","requestedByName":"Ana Pérez","contactEmail":"ana@example.test","reason":"Quiero mis datos"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        assert_eq!(body["data"]["status"], "pending");
        assert_eq!(body["data"]["subjectCedula"], "V-12345678");
        let request_id = body["data"]["id"].as_i64().unwrap();

        // Oposición por ruta de titular.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/privacy/subjects/V-12345678/opposition",
            Some(&operator),
            Some(r#"{"requestedByName":"Ana Pérez","reason":"No quiero marketing"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        assert_eq!(body["data"]["requestType"], "opposition");

        // Tipo inválido: 400.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/privacy/arco-requests",
            Some(&operator),
            Some(r#"{"requestType":"borrar","cedula":"V-12345678","requestedByName":"Ana Pérez"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

        // Operador no puede listar (ReadArco es admin/root/auditor).
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/privacy/arco-requests",
            Some(&operator),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        // Auditor lista y filtra por tipo.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/privacy/arco-requests?requestType=access",
            Some(&auditor),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["pagination"]["total"], 1);
        assert_eq!(body["data"]["requests"].as_array().unwrap().len(), 1);

        // Cambiar estado a completado con notas.
        let (status, body) = request(
            router.clone(),
            Method::PATCH,
            &format!("/api/v1/privacy/arco-requests/{request_id}/status"),
            Some(&admin),
            Some(r#"{"status":"completed","resolutionNotes":"Entregado"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["status"], "completed");
        assert_eq!(body["data"]["resolutionNotes"], "Entregado");
        assert!(body["data"]["resolvedAt"].is_string());

        // Estado inexistente: 404 NOT_FOUND como Go.
        let (status, body) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/privacy/arco-requests/9999/status",
            Some(&admin),
            Some(r#"{"status":"completed"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "NOT_FOUND");
    }

    #[tokio::test]
    async fn subject_access_rectify_and_cancel() {
        let (state, service) = test_state();
        let operator_id = seed_user(&state, "operador-a", "operador").await;
        let admin_id = seed_user(&state, "admin-a", "admin").await;
        let operator = token_for(&service, &state, operator_id).await;
        let admin = token_for(&service, &state, admin_id).await;
        let router = build_router_with_state(state.clone());
        let visit_id = checkin(&router, &operator, "V-12345678").await;

        // Acceso del titular: perfil + visitas.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/privacy/subjects/V-12345678",
            Some(&admin),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["visitor"]["firstName"], "Ana");
        assert_eq!(body["data"]["visits"].as_array().unwrap().len(), 1);
        assert_eq!(body["data"]["visits"][0]["purpose"], "Reunión");

        // Rectificación con campo no permitido: 400.
        let (status, body) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/privacy/subjects/V-12345678",
            Some(&operator),
            Some(r#"{"editPassword":"fixture-edit-password","isBlocked":true}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

        // Rectificación válida: cambia la empresa.
        let (status, body) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/privacy/subjects/V-12345678",
            Some(&operator),
            Some(r#"{"editPassword":"fixture-edit-password","company":"Trébol 2"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["company"], "Trébol 2");

        // Cancelar con la visita abierta: 409.
        let (status, body) = request(
            router.clone(),
            Method::DELETE,
            "/api/v1/privacy/subjects/V-12345678",
            Some(&admin),
            Some(r#"{"identityVerified":true,"verificationMethod":"cédula laminada"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"]["code"], "OPEN_VISIT_EXISTS");

        // Cancelar sin verificación: 400 específico.
        let (status, body) = request(
            router.clone(),
            Method::DELETE,
            "/api/v1/privacy/subjects/V-12345678",
            Some(&admin),
            Some(r#"{"identityVerified":false,"verificationMethod":"cédula laminada"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "IDENTITY_VERIFICATION_REQUIRED");

        // Cerrar la visita y cancelar: anonimiza.
        let (status, _) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/checkout"),
            Some(&operator),
            Some(r#"{}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let (status, body) = request(
            router.clone(),
            Method::DELETE,
            "/api/v1/privacy/subjects/V-12345678",
            Some(&admin),
            Some(r#"{"identityVerified":true,"verificationMethod":"cédula laminada"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(
            body["data"]["message"],
            "Datos personales cancelados; eventos conservados de forma anónima"
        );

        // El perfil ya no existe por su cédula.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/V-12345678",
            Some(&admin),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "VISITOR_NOT_FOUND");
    }
}
