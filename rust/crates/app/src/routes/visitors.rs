//! Familia `visitors` (8 rutas + historial por visita).
//!
//! Traducción de `server-go/internal/httpapi/visitors.go`:
//!
//! - Lista con búsqueda por trigramas (verificada tras descifrar) y
//!   filtro de empresa, detalle con `?history=true` (últimas 5
//!   visitas), empresas distintas y fotos binarias autenticadas
//!   (`Cache-Control: private, no-store`, como Go).
//! - Edición con contraseña adicional en cada guardado y un renglón
//!   de historial por campo, con los valores viejo y nuevo cifrados;
//!   `isBlocked` exige además admin o root.
//! - Lectura: cualquier sesión vigente. Escrituras: operador, admin
//!   o root (`EditProfile`); el bloqueo, solo admin o root.

use std::collections::HashSet;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, Method, StatusCode, Uri},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, patch, post},
    Router,
};
use logmaster_crypto::{decrypt, encrypt};
use logmaster_store::repos::traits::ProfileEdit;
use logmaster_store::repos::visitors::{NewEditHistory, VisitorFilter};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::common::{
    audit_entry, audit_meta, decode_photo, matching_visitor_ids, normalize_cedula, now_text,
    pagination, param, parse_id, parse_query, server_error, store_fail, valid_email,
    validation_error, visitor_tokens, RemoteAddr, StrictJson,
};
use crate::dto::{edit_history_json, visit_dtos, visitor_dto};
use crate::error;
use crate::http::ApiState;
use crate::roles::{authorize, require_permission, Permission};
use crate::session::Session;

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    let writes = Router::new()
        .route("/visitors/{cedula}", patch(edit_visitor))
        .route("/visitors/verify-edit-password", post(verify_edit_password))
        .layer(middleware::from_fn_with_state(
            Permission::EditProfile,
            require_permission,
        ));
    Router::new()
        .route("/visitors/companies", get(companies))
        .route("/visitors", get(list_visitors))
        .route("/visitors/{cedula}", get(get_visitor))
        .route("/visitors/{cedula}/photo", get(photo))
        .route("/visitors/{cedula}/id-photo", get(id_photo))
        .route(
            "/visitors/{cedula}/edit-history",
            get(edit_history_by_visitor),
        )
        .route("/visits/{id}/edit-history", get(edit_history_by_visit))
        .merge(writes)
}

async fn companies(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let query = param(&params, "q").unwrap_or("");
    let items = match state.repos.visitors.list_companies_filtered(query).await {
        Ok(items) => items,
        Err(e) => return store_fail(&e),
    };
    error::ok(json!(items)).into_response()
}

async fn list_visitors(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let (page, limit) = match pagination(&params, 50) {
        Ok(values) => values,
        Err(response) => return *response,
    };
    let company = param(&params, "company");
    let search = param(&params, "search");
    if let Err(response) = crate::common::validate_search(search.unwrap_or("")) {
        return *response;
    }
    if company.is_some_and(|value| value.len() > 500)
        || search.is_some_and(|value| value.len() > 500)
    {
        return validation_error("Filtro demasiado largo");
    }
    let search_ids = match search {
        Some(text) if !text.is_empty() => {
            match matching_visitor_ids(&state.repos, &state.encryption_key, text).await {
                Ok(ids) => Some(ids),
                Err(response) => return *response,
            }
        }
        _ => None,
    };
    let filter = VisitorFilter {
        company: company.map(str::to_string),
        search: search.map(str::to_string),
        search_ids,
        limit,
        offset: (page - 1) * limit,
    };
    let total = match state.repos.visitors.count_filtered(&filter).await {
        Ok(total) => total,
        Err(e) => return store_fail(&e),
    };
    let visitors = match state.repos.visitors.list_filtered(&filter).await {
        Ok(visitors) => visitors,
        Err(e) => return store_fail(&e),
    };
    let items: Vec<Value> = match visitors
        .iter()
        .map(|visitor| visitor_dto(&state.encryption_key, visitor))
        .collect::<Result<_, _>>()
    {
        Ok(items) => items,
        Err(e) => return server_error(&e.to_string()),
    };
    error::ok(json!({"visitors": items, "total": total, "page": page, "limit": limit}))
        .into_response()
}

async fn get_visitor(State(state): State<ApiState>, Path(raw): Path<String>, uri: Uri) -> Response {
    let cedula = match normalize_cedula(&raw) {
        Ok(value) => value,
        Err(()) => return validation_error("cédula inválida"),
    };
    let hash = logmaster_crypto::identity_hash(&state.encryption_key, &cedula);
    let visitor = match state.repos.visitors.find_by_cedula(&hash).await {
        Ok(visitor) => visitor,
        Err(e) => return store_fail(&e),
    };
    let mut data = match visitor_dto(&state.encryption_key, &visitor) {
        Ok(data) => data,
        Err(e) => return server_error(&e.to_string()),
    };
    if param(&parse_query(&uri), "history") == Some("true") {
        let visits = match state
            .repos
            .visits
            .history_by_visitor(visitor.id, &visitor.cedula, 5)
            .await
        {
            Ok(visits) => visits,
            Err(e) => return store_fail(&e),
        };
        match visit_dtos(&state.repos, &state.encryption_key, &visits).await {
            Ok(items) => data["history"] = json!(items),
            Err(e) => return server_error(&e.to_string()),
        }
    }
    error::ok(data).into_response()
}

/// Tipo de contenido por los bytes mágicos, como
/// `http.DetectContentType` de Go para estos formatos.
fn detect_image_content_type(data: &[u8]) -> &'static str {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        "image/png"
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if data.len() >= 12 && data.starts_with(b"RIFF") && data.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

async fn serve_photo(state: &ApiState, raw: &str, id_photo: bool) -> Response {
    let cedula = match normalize_cedula(raw) {
        Ok(value) => value,
        Err(()) => return validation_error("cédula inválida"),
    };
    let hash = logmaster_crypto::identity_hash(&state.encryption_key, &cedula);
    let visitor = match state.repos.visitors.find_by_cedula(&hash).await {
        Ok(visitor) => visitor,
        Err(e) => return store_fail(&e),
    };
    let data = if id_photo {
        visitor.id_photo_data
    } else {
        visitor.photo_data
    };
    let Some(data) = data.filter(|bytes| !bytes.is_empty()) else {
        return error::fail(
            StatusCode::NOT_FOUND,
            "PHOTO_NOT_FOUND",
            "Fotografía no disponible",
        )
        .into_response();
    };
    let mut response = Response::new(Body::from(data.clone()));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        detect_image_content_type(&data)
            .parse()
            .expect("tipo válido"),
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        "private, no-store".parse().expect("directiva válida"),
    );
    response
}

async fn photo(State(state): State<ApiState>, Path(raw): Path<String>) -> Response {
    serve_photo(&state, &raw, false).await
}

async fn id_photo(State(state): State<ApiState>, Path(raw): Path<String>) -> Response {
    serve_photo(&state, &raw, true).await
}

async fn edit_history_by_visitor(
    State(state): State<ApiState>,
    Path(raw): Path<String>,
) -> Response {
    let cedula = match normalize_cedula(&raw) {
        Ok(value) => value,
        Err(()) => return validation_error("cédula inválida"),
    };
    let hash = logmaster_crypto::identity_hash(&state.encryption_key, &cedula);
    let visitor = match state.repos.visitors.find_by_cedula(&hash).await {
        Ok(visitor) => visitor,
        Err(e) => return store_fail(&e),
    };
    let rows = match state
        .repos
        .visitors
        .list_edit_history_by_visitor(visitor.id)
        .await
    {
        Ok(rows) => rows,
        Err(e) => return store_fail(&e),
    };
    let items: Vec<Value> = match rows
        .iter()
        .map(|row| edit_history_json(&state.encryption_key, row))
        .collect::<Result<_, _>>()
    {
        Ok(items) => items,
        Err(e) => return server_error(&e.to_string()),
    };
    error::ok(json!(items)).into_response()
}

async fn edit_history_by_visit(State(state): State<ApiState>, Path(raw): Path<String>) -> Response {
    let id = match parse_id(&raw) {
        Ok(id) => id,
        Err(response) => return *response,
    };
    let rows = match state.repos.visitors.list_edit_history_by_visit(id).await {
        Ok(rows) => rows,
        Err(e) => return store_fail(&e),
    };
    let items: Vec<Value> = match rows
        .iter()
        .map(|row| edit_history_json(&state.encryption_key, row))
        .collect::<Result<_, _>>()
    {
        Ok(items) => items,
        Err(e) => return server_error(&e.to_string()),
    };
    error::ok(json!(items)).into_response()
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct VerifyEditPasswordBody {
    #[serde(default)]
    password: String,
}

async fn verify_edit_password(
    State(state): State<ApiState>,
    StrictJson(body): StrictJson<VerifyEditPasswordBody>,
) -> Response {
    if body.password.is_empty() || body.password.len() > 800 {
        return validation_error("Contraseña requerida");
    }
    error::ok(json!({"valid": state.session.valid_edit_password(&body.password)})).into_response()
}

/// Columna de `Visitors` de cada campo editable de Go, con sus alias
/// en `snake_case`. `None` si el campo no existe.
fn edit_column(field: &str) -> Option<&'static str> {
    match field {
        "firstName" | "first_name" => Some("first_name"),
        "lastName" | "last_name" => Some("last_name"),
        "jobTitle" | "job_title" => Some("job_title"),
        "company" => Some("company"),
        "email" => Some("email"),
        "phone" => Some("phone"),
        "observations" => Some("observations"),
        "isBlocked" => Some("isBlocked"),
        "photoBase64" => Some("photo_data"),
        "idPhotoBase64" => Some("id_photo_data"),
        _ => None,
    }
}

async fn edit_visitor(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
    uri: Uri,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<Map<String, Value>>,
) -> Response {
    edit_visitor_with_body(&state, &session, &headers, remote, &uri, &raw, body).await
}

/// Núcleo de la edición de perfil, compartido por el PATCH de
/// visitantes y por la rectificación ARCO (que solo restringe los
/// campos permitidos antes de llamar aquí).
///
/// La validación y el cálculo de valores viejos/nuevos se hacen en
/// el handler; la escritura (perfil + historial + trigramas +
/// auditoría) es una sola transacción por motor vía
/// `UnitOfWork::apply_profile_edit`.
pub(crate) async fn edit_visitor_with_body(
    state: &ApiState,
    session: &Session,
    headers: &HeaderMap,
    remote: RemoteAddr,
    uri: &Uri,
    raw: &str,
    body: Map<String, Value>,
) -> Response {
    let password = match body.get("editPassword") {
        Some(Value::String(password)) => password.clone(),
        _ => {
            return error::fail(
                StatusCode::FORBIDDEN,
                "INVALID_EDIT_PASSWORD",
                "Contraseña de edición incorrecta",
            )
            .into_response();
        }
    };
    if !state.session.valid_edit_password(&password) {
        return error::fail(
            StatusCode::FORBIDDEN,
            "INVALID_EDIT_PASSWORD",
            "Contraseña de edición incorrecta",
        )
        .into_response();
    }
    let mut visit_id: Option<i64> = None;
    if let Some(raw_id) = body.get("visitId") {
        match raw_id.as_i64() {
            Some(id) if id >= 0 => visit_id = if id == 0 { None } else { Some(id) },
            _ => {
                return error::fail(
                    StatusCode::BAD_REQUEST,
                    "INVALID_VISIT_CONTEXT",
                    "Visita inválida",
                )
                .into_response();
            }
        }
    }
    let mut body = body;
    body.remove("editPassword");
    body.remove("visitId");
    if body.is_empty() {
        return validation_error("No se enviaron cambios");
    }
    let cedula = match normalize_cedula(raw) {
        Ok(value) => value,
        Err(()) => return validation_error("cédula inválida"),
    };
    let now_text = now_text();
    let key = state.encryption_key;
    let hash = logmaster_crypto::identity_hash(&key, &cedula);
    let mut visitor = match state.repos.visitors.find_by_cedula(&hash).await {
        Ok(visitor) => visitor,
        Err(e) => return store_fail(&e),
    };
    if let Some(vid) = visit_id {
        // `editVisitor` de Go comprueba que la visita pertenece al
        // visitante (por id o por hash de cédula); si no existe o no
        // pertenece, el contexto es inválido (400, no 404).
        let owns = match state.repos.visits.find_by_id(vid).await {
            Ok(visit) => {
                visit.visitor_id == Some(visitor.id) || visit.visitor_cedula == visitor.cedula
            }
            Err(_) => false,
        };
        if !owns {
            return error::fail(
                StatusCode::BAD_REQUEST,
                "INVALID_VISIT_CONTEXT",
                "La visita no pertenece al visitante",
            )
            .into_response();
        }
    }
    // Valores viejos en claro, antes de mutar el perfil.
    let plain = |value: Option<&str>| -> Result<Option<String>, Box<Response>> {
        match decrypt(&key, value.unwrap_or("")) {
            Ok(text) => Ok(if text.is_empty() { None } else { Some(text) }),
            Err(e) => Err(Box::new(server_error(&e.to_string()))),
        }
    };
    let old_first = match plain(Some(&visitor.first_name)) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let old_last = match plain(Some(&visitor.last_name)) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let old_job = match plain(visitor.job_title.as_deref()) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let old_company = Some(visitor.company.clone());
    let old_email = match plain(visitor.email.as_deref()) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let old_phone = match plain(visitor.phone.as_deref()) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let old_observations = match plain(visitor.observations.as_deref()) {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let old_blocked = Some(visitor.is_blocked.unwrap_or(false).to_string());
    let enc = |value: &str| -> Result<String, Box<Response>> {
        encrypt(&key, value).map_err(|e| Box::new(server_error(&e.to_string())))
    };
    let enc_opt = |value: &Option<String>| -> Result<Option<String>, Box<Response>> {
        match value {
            Some(text) => Ok(Some(enc(text)?)),
            None => Ok(None),
        }
    };
    let mut seen: HashSet<&'static str> = HashSet::new();
    // (campo tal como llegó, valor viejo cifrado, valor nuevo cifrado)
    let mut changes: Vec<(String, Option<String>, Option<String>)> = Vec::new();
    for (field, raw) in &body {
        let column = match edit_column(field) {
            Some(column) => column,
            None => return validation_error("Campo de edición inválido o duplicado"),
        };
        if !seen.insert(column) {
            return validation_error("Campo de edición inválido o duplicado");
        }
        if column == "isBlocked" {
            if authorize(session, Permission::BlockVisitor).is_err() {
                return error::fail(
                    StatusCode::FORBIDDEN,
                    "FORBIDDEN",
                    "Solo admin y root pueden bloquear",
                )
                .into_response();
            }
            let blocked = match raw.as_bool() {
                Some(value) => value,
                None => return validation_error("Estado de bloqueo inválido"),
            };
            visitor.is_blocked = Some(blocked);
            let old_enc = match enc_opt(&old_blocked) {
                Ok(value) => value,
                Err(response) => return *response,
            };
            let new_enc = match enc(&blocked.to_string()) {
                Ok(value) => Some(value),
                Err(response) => return *response,
            };
            changes.push((field.clone(), old_enc, new_enc));
        } else if column == "photo_data" || column == "id_photo_data" {
            let text = match raw.as_str() {
                Some(text) => text,
                None => {
                    return error::fail(
                        StatusCode::BAD_REQUEST,
                        "INVALID_PHOTO",
                        "Fotografía inválida",
                    )
                    .into_response();
                }
            };
            let bytes = match decode_photo(text) {
                Ok(bytes) => bytes,
                Err(()) => {
                    return error::fail(
                        StatusCode::BAD_REQUEST,
                        "INVALID_PHOTO",
                        "Fotografía inválida",
                    )
                    .into_response();
                }
            };
            if column == "photo_data" {
                visitor.photo_data = Some(bytes);
            } else {
                visitor.id_photo_data = Some(bytes);
            }
            changes.push((field.clone(), None, None));
        } else {
            let value: Option<String> = match raw {
                Value::Null => None,
                Value::String(text) => Some(text.clone()),
                _ => return validation_error("Valor inválido"),
            };
            let required = matches!(column, "first_name" | "last_name" | "company");
            let max = match column {
                "first_name" | "last_name" => 100,
                "observations" => 2000,
                "phone" => 30,
                "email" => 254,
                _ => 200,
            };
            if value.is_none() && required {
                return validation_error("Datos de edición inválidos");
            }
            if let Some(text) = &value {
                if text.chars().count() > max
                    || (required && text.trim().is_empty())
                    || (column == "email" && !valid_email(text))
                {
                    return validation_error("Datos de edición inválidos");
                }
            }
            let old = match column {
                "first_name" => &old_first,
                "last_name" => &old_last,
                "job_title" => &old_job,
                "company" => &old_company,
                "email" => &old_email,
                "phone" => &old_phone,
                "observations" => &old_observations,
                _ => unreachable!("columna de texto"),
            };
            let old_enc = match enc_opt(old) {
                Ok(value) => value,
                Err(response) => return *response,
            };
            let new_enc = match &value {
                None => None,
                Some(text) => match enc(text.trim()) {
                    Ok(value) => Some(value),
                    Err(response) => return *response,
                },
            };
            match column {
                "first_name" => visitor.first_name = new_enc.clone().unwrap_or_default(),
                "last_name" => visitor.last_name = new_enc.clone().unwrap_or_default(),
                "job_title" => visitor.job_title = new_enc.clone(),
                "company" => {
                    visitor.company = value
                        .as_ref()
                        .map(|text| text.trim().to_string())
                        .unwrap_or_default()
                }
                "email" => visitor.email = new_enc.clone(),
                "phone" => visitor.phone = new_enc.clone(),
                "observations" => visitor.observations = new_enc.clone(),
                _ => unreachable!("columna de texto"),
            }
            changes.push((field.clone(), old_enc, new_enc));
        }
    }
    let history: Vec<NewEditHistory<'_>> = changes
        .iter()
        .map(|(field, old_value, new_value)| NewEditHistory {
            visit_id,
            visitor_id: visitor.id,
            field,
            old_value: old_value.as_deref(),
            new_value: new_value.as_deref(),
            edited_by: session.id,
            edited_by_username: &session.username,
            edited_at: &now_text,
            created_at: &now_text,
        })
        .collect();
    let tokens = match visitor_tokens(&key, &visitor) {
        Ok(tokens) => tokens,
        Err(e) => return server_error(&e.to_string()),
    };
    let meta = audit_meta(
        headers,
        remote.0,
        &state.trusted_proxies,
        session,
        &Method::PATCH,
        uri.path(),
    );
    let visitor_id_text = visitor.id.to_string();
    let entry = audit_entry(
        &meta,
        session,
        "VISITOR_UPDATE",
        "Visitor",
        &visitor_id_text,
        None,
        &now_text,
    );
    let visitor = match state
        .repos
        .uow
        .apply_profile_edit(&ProfileEdit {
            visitor: &visitor,
            history: &history,
            search_tokens: &tokens,
            audit: &entry,
            now: &now_text,
        })
        .await
    {
        Ok(visitor) => visitor,
        Err(e) => return store_fail(&e),
    };
    state.events.publish("visit:visitor-updated", 0);
    match visitor_dto(&state.encryption_key, &visitor) {
        Ok(dto) => error::ok(dto).into_response(),
        Err(e) => server_error(&e.to_string()),
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
    const PNG_1X1: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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
    ) -> (StatusCode, serde_json::Value, Vec<(String, String)>) {
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
        let headers: Vec<(String, String)> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, value, headers)
    }

    async fn checkin(
        router: &Router,
        token: &str,
        cedula: &str,
        first: &str,
        company: &str,
    ) -> i64 {
        let body = format!(
            r#"{{"visitorCedula":"{cedula}","purpose":"Reunión","personToVisit":"Anfitrión","targetDepartment":"Producción","hostPerson":"Jefe","status":"active","visitorData":{{"firstName":"{first}","lastName":"Pérez","company":"{company}"}},"consent":{{"accepted":true,"policyVersion":"v1","acceptedAt":"2026-11-10T00:00:00Z"}}}}"#
        );
        let (status, value, _) = request(
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
    async fn visitor_detail_companies_list_and_photo() {
        let (state, service) = test_state();
        let user_id = seed_user(&state, "operador-v", "operador").await;
        let token = token_for(&service, &state, user_id).await;
        let router = build_router_with_state(state.clone());
        checkin(&router, &token, "V-12345678", "Ana", "Trébol").await;

        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/V-12345678",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["firstName"], "Ana");
        assert_eq!(body["data"]["company"], "Trébol");

        // Con historial: la visita recién creada.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/V-12345678?history=true",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["history"].as_array().unwrap().len(), 1);

        // Empresas y lista con búsqueda.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/companies",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"], json!(["Trébol"]));
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors?search=Ana",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["total"], 1);
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors?search=An",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "SEARCH_TOO_SHORT");

        // Sin foto todavía: 404 PHOTO_NOT_FOUND.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/V-12345678/photo",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "PHOTO_NOT_FOUND");

        // Cédula inválida y visitante inexistente.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/X-1",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/V-99999999",
            Some(&token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "VISITOR_NOT_FOUND");
    }

    #[tokio::test]
    async fn edit_visitor_with_password_history_and_photo() {
        let (state, service) = test_state();
        let operator_id = seed_user(&state, "operador-e", "operador").await;
        let admin_id = seed_user(&state, "admin-e", "admin").await;
        let operator = token_for(&service, &state, operator_id).await;
        let admin = token_for(&service, &state, admin_id).await;
        let router = build_router_with_state(state.clone());
        let visit_id = checkin(&router, &operator, "V-12345678", "Ana", "Trébol").await;

        // Sin contraseña de edición: 403.
        let (status, body, _) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/visitors/V-12345678",
            Some(&operator),
            Some(r#"{"firstName":"Ana María"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "INVALID_EDIT_PASSWORD");

        // Contraseña correcta: edita, guarda foto y deja historial.
        let body = format!(
            r#"{{"editPassword":"fixture-edit-password","firstName":"Ana María","photoBase64":"{PNG_1X1}","visitId":{visit_id}}}"#
        );
        let (status, value, _) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/visitors/V-12345678",
            Some(&operator),
            Some(&body),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{value}");
        assert_eq!(value["data"]["firstName"], "Ana María");

        // La foto se sirve con su tipo y sin caché.
        let (status, _, headers) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/V-12345678/photo",
            Some(&operator),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let content_type = headers
            .iter()
            .find(|(k, _)| k == "content-type")
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        assert_eq!(content_type, "image/png");
        let cache = headers
            .iter()
            .find(|(k, _)| k == "cache-control")
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        assert_eq!(cache, "private, no-store");

        // Historial por visitante y por visita, con valores descifrados.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/visitors/V-12345678/edit-history",
            Some(&operator),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let items = body["data"].as_array().unwrap();
        assert_eq!(items.len(), 2);
        let first = items
            .iter()
            .find(|item| item["field"] == "firstName")
            .unwrap();
        assert_eq!(first["oldValue"], "Ana");
        assert_eq!(first["newValue"], "Ana María");
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            &format!("/api/v1/visits/{visit_id}/edit-history"),
            Some(&operator),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"].as_array().unwrap().len(), 2);

        // Operador no puede bloquear; admin sí.
        let (status, body, _) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/visitors/V-12345678",
            Some(&operator),
            Some(r#"{"editPassword":"fixture-edit-password","isBlocked":true}"#),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "FORBIDDEN");
        let (status, value, _) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/visitors/V-12345678",
            Some(&admin),
            Some(r#"{"editPassword":"fixture-edit-password","isBlocked":true}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{value}");
        assert_eq!(value["data"]["isBlocked"], true);

        // Verificación de contraseña y campo desconocido.
        let (status, body, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visitors/verify-edit-password",
            Some(&operator),
            Some(r#"{"password":"fixture-edit-password"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["valid"], true);
        let (status, body, _) = request(
            router.clone(),
            Method::POST,
            "/api/v1/visitors/verify-edit-password",
            Some(&operator),
            Some(r#"{"password":"otra"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"]["valid"], false);
        let (status, body, _) = request(
            router.clone(),
            Method::PATCH,
            "/api/v1/visitors/V-12345678",
            Some(&operator),
            Some(r#"{"editPassword":"fixture-edit-password","apodo":"Anita"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
    }
}
