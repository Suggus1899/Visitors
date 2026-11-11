//! Lecturas de presentación para el SSR: los mismos DTOs JSON que
//! devuelve la API de la fase 4 (`dto.rs`), leídos por los traits de
//! repositorio. Las páginas no reimplementan reglas de dominio: solo
//! presentan lo que la API ya calcula.

use axum::http::StatusCode;
use logmaster_crypto::identity_hash;
use logmaster_store::error::StoreError;
use serde_json::Value;

use crate::common::normalize_cedula;
use crate::dto::{edit_history_json, visit_dto, visit_dtos, visitor_dto};
use crate::http::ApiState;

/// Fallo al cargar una página: recurso inexistente (404) o error
/// interno (500, sin detallar el motivo al navegador).
pub enum PageError {
    NotFound(&'static str),
    Server,
}

impl PageError {
    pub fn status(&self) -> StatusCode {
        match self {
            PageError::NotFound(_) => StatusCode::NOT_FOUND,
            PageError::Server => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            PageError::NotFound(message) => message,
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
