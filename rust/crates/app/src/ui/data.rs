//! Lecturas de presentación para el SSR: los mismos DTOs JSON que
//! devuelve la API de la fase 4 (`dto.rs`), leídos por los traits de
//! repositorio. Las páginas no reimplementan reglas de dominio: solo
//! presentan lo que la API ya calcula.

use axum::http::StatusCode;
use logmaster_crypto::identity_hash;
use logmaster_store::error::StoreError;
use serde_json::{json, Value};

use crate::common::{
    caracas_day_start, date_range, format_instant, matching_visitor_ids, normalize_cedula,
    pagination, param, parse_query,
};
use crate::dto::{
    activity_log_json, arco_dto, edit_history_json, visit_dto, visit_dtos, visitor_dto,
};
use crate::http::ApiState;
use axum::http::Uri;

/// Fallo al cargar una página: recurso inexistente (404) o error
/// interno (500, sin detallar el motivo al navegador).
pub enum PageError {
    NotFound(&'static str),
    BadRequest(&'static str),
    Server,
}

impl PageError {
    pub fn status(&self) -> StatusCode {
        match self {
            PageError::NotFound(_) => StatusCode::NOT_FOUND,
            PageError::BadRequest(_) => StatusCode::BAD_REQUEST,
            PageError::Server => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            PageError::NotFound(message) => message,
            PageError::BadRequest(message) => message,
            PageError::Server => "No se pudo cargar la página",
        }
    }
}

impl From<StoreError> for PageError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::NotFound { .. } => PageError::NotFound("Recurso no encontrado"),
            other => {
                tracing::error!(error = %other, "fallo al cargar una página");
                PageError::Server
            }
        }
    }
}

impl From<std::io::Error> for PageError {
    fn from(error: std::io::Error) -> Self {
        tracing::error!(error = %error, "error de E/S al cargar datos de pagina");
        PageError::Server
    }
}

impl From<crate::dto::DtoError> for PageError {
    fn from(error: crate::dto::DtoError) -> Self {
        tracing::error!(error = %error, "fallo al cargar una página");
        PageError::Server
    }
}

pub type PageResult<T> = Result<T, PageError>;

/// Las tres listas del punto de control, como DTOs de visita.
pub async fn visit_lists(state: &ApiState) -> PageResult<(Vec<Value>, Vec<Value>, Vec<Value>)> {
    let mut lists = (Vec::new(), Vec::new(), Vec::new());
    for (status, slot) in [("waiting", 0), ("active", 1), ("intermittent", 2)] {
        let visits = state
            .repos
            .visits
            .list_by_status(status, i64::MAX, 0)
            .await?;
        let items = visit_dtos(&state.repos, &state.encryption_key, &visits).await?;
        match slot {
            0 => lists.0 = items,
            1 => lists.1 = items,
            _ => lists.2 = items,
        }
    }
    Ok(lists)
}

/// Detalle de una visita (DTO + intervalos + historial de edición).
pub async fn visit_detail(
    state: &ApiState,
    id: i64,
) -> PageResult<(Value, Vec<Value>, Vec<Value>)> {
    let visit = state.repos.visits.find_by_id(id).await?;
    let dto = visit_dto(&state.repos, &state.encryption_key, &visit).await?;
    let intervals: Vec<Value> = dto
        .get("intervals")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let history = state.repos.visitors.list_edit_history_by_visit(id).await?;
    let mut items = Vec::with_capacity(history.len());
    for entry in &history {
        items.push(edit_history_json(&state.encryption_key, entry)?);
    }
    Ok((dto, intervals, items))
}

/// Detalle de un visitante por cédula: perfil, últimas 5 visitas e
/// historial de edición. Sin perfil → `NotFound`.
pub async fn visitor_detail(
    state: &ApiState,
    raw: &str,
) -> PageResult<(Value, Vec<Value>, Vec<Value>)> {
    let cedula = normalize_cedula(raw).map_err(|()| PageError::NotFound("Cédula inválida"))?;
    let hash = identity_hash(&state.encryption_key, &cedula);
    let visitor =
        state
            .repos
            .visitors
            .find_by_cedula(&hash)
            .await
            .map_err(|error| match error {
                StoreError::NotFound { .. } => PageError::NotFound("Visitante no encontrado"),
                other => {
                    tracing::error!(error = %other, "fallo al cargar una página");
                    PageError::Server
                }
            })?;
    let dto = visitor_dto(&state.encryption_key, &visitor)?;
    let visits = state
        .repos
        .visits
        .history_by_visitor(visitor.id, &visitor.cedula, 5)
        .await?;
    let history_dtos = visit_dtos(&state.repos, &state.encryption_key, &visits).await?;
    let history = state
        .repos
        .visitors
        .list_edit_history_by_visitor(visitor.id)
        .await?;
    let mut edits = Vec::with_capacity(history.len());
    for entry in &history {
        edits.push(edit_history_json(&state.encryption_key, entry)?);
    }
    Ok((dto, history_dtos, edits))
}

use logmaster_store::models::{Department, VisitPurpose};
use logmaster_store::repos::visitors::VisitorFilter;
use logmaster_store::repos::visits::VisitFilter;

/// Historial de visitas para /admin. Filtro simplificado respecto a la
/// API (estado, empresa, cédula, búsqueda, rango de fechas; orden fijo
/// por entrada descendente); el filtro completo sigue disponible vía API.
pub async fn admin_history(state: &ApiState, uri: &Uri) -> PageResult<(Vec<Value>, i64, i64, i64)> {
    let params = parse_query(uri);
    let (page, limit) =
        pagination(&params, 10).map_err(|_| PageError::BadRequest("Paginación inválida"))?;
    let (start, end) =
        date_range(&params).map_err(|_| PageError::BadRequest("Rango de fechas inválido"))?;
    let status = param(&params, "status");
    if let Some(status) = status {
        if !matches!(
            status,
            "active" | "waiting" | "intermittent" | "completed" | "cancelled"
        ) {
            return Err(PageError::BadRequest("Estado inválido"));
        }
    }
    let company = param(&params, "company");
    let cedula_hash = match param(&params, "visitorCedula") {
        Some(raw) => Some(identity_hash(
            &state.encryption_key,
            &normalize_cedula(raw).map_err(|()| PageError::BadRequest("Cédula inválida"))?,
        )),
        None => None,
    };
    let search = param(&params, "search");
    let visitor_ids = match search {
        Some(text) => Some(
            matching_visitor_ids(&state.repos, &state.encryption_key, text)
                .await
                .map_err(|_| PageError::BadRequest("Búsqueda inválida"))?,
        ),
        None => None,
    };
    let filter = VisitFilter {
        start: start.map(format_instant),
        end: end.map(format_instant),
        status: status.map(str::to_string),
        company: company.map(str::to_string),
        cedula_hash,
        visitor_ids,
        search: search.map(str::to_string),
        sort_field: "check_in_time".to_string(),
        sort_dir: "desc".to_string(),
        limit,
        offset: (page - 1) * limit,
    };
    let (visits, total) = state.repos.visits.list_filtered(&filter).await?;
    let items = visit_dtos(&state.repos, &state.encryption_key, &visits).await?;
    Ok((items, total, page, limit))
}

/// Visitantes para /admin (empresa, búsqueda, paginación de 50).
pub async fn admin_visitors(
    state: &ApiState,
    uri: &Uri,
) -> PageResult<(Vec<Value>, i64, i64, i64)> {
    let params = parse_query(uri);
    let (page, limit) =
        pagination(&params, 50).map_err(|_| PageError::BadRequest("Paginación inválida"))?;
    let company = param(&params, "company");
    let search = param(&params, "search");
    let search_ids = match search {
        Some(text) => Some(
            matching_visitor_ids(&state.repos, &state.encryption_key, text)
                .await
                .map_err(|_| PageError::BadRequest("Búsqueda inválida"))?,
        ),
        None => None,
    };
    let filter = VisitorFilter {
        company: company.map(str::to_string),
        search: search.map(str::to_string),
        search_ids,
        limit,
        offset: (page - 1) * limit,
    };
    let visitors = state.repos.visitors.list_filtered(&filter).await?;
    let total = state.repos.visitors.count_filtered(&filter).await?;
    let mut items = Vec::with_capacity(visitors.len());
    for visitor in &visitors {
        items.push(visitor_dto(&state.encryption_key, visitor)?);
    }
    Ok((items, total, page, limit))
}

/// Catálogos heredados (departamentos y propósitos) para /admin.
pub async fn admin_catalogs(state: &ApiState) -> PageResult<(Vec<Department>, Vec<VisitPurpose>)> {
    Ok((
        state.repos.catalogs.list_departments().await?,
        state.repos.catalogs.list_purposes().await?,
    ))
}

/// Respaldos del disco para /admin y /root: `None` si no hay carpeta
/// configurada. Misma regla de nombres que la API de la fase 4.
pub fn backup_files(state: &ApiState) -> PageResult<Option<Vec<Value>>> {
    let Some(root) = state.backup_path.clone() else {
        return Ok(None);
    };
    let entries = std::fs::read_dir(&root)?;
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_backup_name(&name) {
            continue;
        }
        let metadata = entry.metadata()?;
        let modified = metadata
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        rows.push(serde_json::json!({
            "name": name,
            "sizeBytes": metadata.len(),
            "modifiedAt": chrono::DateTime::from_timestamp(modified, 0)
                .map(|date| date.to_rfc3339()),
        }));
    }
    rows.sort_by(|a, b| {
        b["modifiedAt"]
            .as_str()
            .cmp(&a["modifiedAt"].as_str())
            .then(a["name"].as_str().cmp(&b["name"].as_str()))
    });
    Ok(Some(rows))
}

fn valid_backup_name(name: &str) -> bool {
    let Some(base) = name.strip_prefix("backup-") else {
        return false;
    };
    (name.ends_with(".dump") || name.ends_with(".dump.enc"))
        && !base.is_empty()
        && base
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

use logmaster_store::repos::audit::AuditFilter;
use logmaster_store::repos::privacy::ArcoFilter;

/// Bitácora para /audit: los filtros de la API, paginación de 50, y
/// los conteos de hoy (inicios de sesión, acciones, usuarios, IP).
pub async fn audit_logs(
    state: &ApiState,
    uri: &Uri,
) -> PageResult<(Vec<Value>, i64, i64, i64, (i64, i64, i64, i64))> {
    let params = parse_query(uri);
    let (page, limit) =
        pagination(&params, 50).map_err(|_| PageError::BadRequest("Paginación inválida"))?;
    let (start, end) =
        date_range(&params).map_err(|_| PageError::BadRequest("Rango de fechas inválido"))?;
    let user_id = match param(&params, "userId") {
        Some(raw) => Some(
            raw.parse::<i64>()
                .map_err(|_| PageError::BadRequest("Usuario inválido"))?,
        ),
        None => None,
    };
    let start_text = start.map(format_instant);
    let end_text = end.map(format_instant);
    let filter = AuditFilter {
        start: start_text.as_deref(),
        end: end_text.as_deref(),
        action: param(&params, "action"),
        username: param(&params, "username"),
        entity: param(&params, "entity"),
        ip: param(&params, "ip"),
        search: param(&params, "search"),
        user_id,
    };
    let total = state.repos.audit.count_filtered(&filter).await?;
    let logs = state
        .repos
        .audit
        .list_filtered(&filter, limit, (page - 1) * limit)
        .await?;
    let items = logs.iter().map(activity_log_json).collect();
    let now = chrono::Utc::now();
    let today = caracas_day_start(now);
    let tomorrow = today + chrono::Duration::days(1);
    let counts = state
        .repos
        .audit
        .today_counts(&format_instant(today), &format_instant(tomorrow))
        .await?;
    Ok((items, total, page, limit, counts))
}

/// Solicitudes ARCO para /privacy: filtros de la API, paginación de 20.
pub async fn privacy_requests(
    state: &ApiState,
    uri: &Uri,
) -> PageResult<(Vec<Value>, i64, i64, i64)> {
    let params = parse_query(uri);
    let (page, limit) =
        pagination(&params, 20).map_err(|_| PageError::BadRequest("Paginación inválida"))?;
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
        return Err(PageError::BadRequest("Filtros inválidos"));
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
    let (requests, total) = state.repos.arco.list_filtered(&filter).await?;
    let mut items = Vec::with_capacity(requests.len());
    for request in &requests {
        items.push(arco_dto(&state.encryption_key, request)?);
    }
    Ok((items, total, page, limit))
}

/// Cuentas para /root (solo root): todas las cuentas del sistema.
pub async fn root_users(state: &ApiState) -> PageResult<Vec<Value>> {
    let users = state.repos.users.list_all().await?;
    Ok(users
        .iter()
        .map(|user| {
            json!({
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "mustChangePassword": user.must_change_password,
                "loginAttempts": user.login_attempts,
                "lockedUntil": user.locked_until,
                "createdAt": user.created_at,
            })
        })
        .collect())
}
