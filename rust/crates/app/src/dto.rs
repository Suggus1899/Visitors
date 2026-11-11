//! DTO de presentación, con los mismos campos JSON que Go.
//!
//! Traducción de `visitorDTO`, `visitDTO`/`visitData` y `arcoDTO`
//! (`visitors.go`, `visits.go`, `privacy.go`): los campos cifrados se
//! descifran aquí (la capa de datos no descifra), los vacíos se
//! presentan como `null` y los perfiles anonimizados como
//! «Anonimizado».

use chrono::{DateTime, Utc};
use logmaster_crypto::{decrypt, CryptoError};
use logmaster_store::error::StoreError;
use logmaster_store::models::{ActivityLog, ArcoRequest, Visit, Visitor};
use logmaster_store::Repositories;
use serde_json::{json, Value};

use crate::common::{caracas_date, parse_instant};

/// Error al construir un DTO: descifrado o lectura de la base.
#[derive(Debug)]
pub enum DtoError {
    Crypto(CryptoError),
    Store(StoreError),
}

impl std::fmt::Display for DtoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DtoError::Crypto(e) => write!(f, "descifrado: {e}"),
            DtoError::Store(e) => write!(f, "base: {e}"),
        }
    }
}

impl std::error::Error for DtoError {}

impl From<CryptoError> for DtoError {
    fn from(e: CryptoError) -> Self {
        DtoError::Crypto(e)
    }
}

impl From<StoreError> for DtoError {
    fn from(e: StoreError) -> Self {
        DtoError::Store(e)
    }
}

pub type DtoResult<T> = Result<T, DtoError>;

/// Descifra un campo de perfil: vacío o nulo → `null` en JSON.
fn plain(key: &[u8; 32], value: Option<&str>) -> DtoResult<Value> {
    let raw = value.unwrap_or("");
    let text = decrypt(key, raw)?;
    if text.is_empty() {
        Ok(Value::Null)
    } else {
        Ok(Value::String(text))
    }
}

/// Texto descifrado, vacío si no hay valor.
fn plain_text(key: &[u8; 32], value: Option<&str>) -> DtoResult<String> {
    Ok(match plain(key, value)? {
        Value::String(text) => text,
        _ => String::new(),
    })
}

/// `visitorDTO` de Go.
pub fn visitor_dto(key: &[u8; 32], visitor: &Visitor) -> DtoResult<Value> {
    let mut result = json!({
        "id": visitor.id,
        "company": visitor.company,
        "isBlocked": visitor.is_blocked.unwrap_or(false),
        "createdAt": visitor.created_at,
        "anonymizedAt": visitor.anonymized_at,
        "photo_url": visitor.photo_url,
        "id_photo_url": visitor.id_photo_url,
    });
    let fields: [(&str, Option<&str>); 7] = [
        ("cedula", visitor.encrypted_cedula.as_deref()),
        ("firstName", Some(visitor.first_name.as_str())),
        ("lastName", Some(visitor.last_name.as_str())),
        ("jobTitle", visitor.job_title.as_deref()),
        ("email", visitor.email.as_deref()),
        ("phone", visitor.phone.as_deref()),
        ("observations", visitor.observations.as_deref()),
    ];
    for (name, value) in fields {
        result[name] = plain(key, value)?;
    }
    result["first_name"] = result["firstName"].clone();
    result["last_name"] = result["lastName"].clone();
    result["job_title"] = result["jobTitle"].clone();
    if visitor.anonymized_at.is_some() {
        result["cedula"] = Value::Null;
        result["firstName"] = json!("Anonimizado");
        result["lastName"] = json!("");
        result["first_name"] = json!("Anonimizado");
        result["last_name"] = json!("");
    }
    Ok(result)
}

/// Minutos entre dos instantes, truncados como Go
/// (`int(duracion.Minutes())`).
fn minutes_between(start: &str, end: DateTime<Utc>) -> i64 {
    match parse_instant(start) {
        Some(from) => (end - from).num_minutes(),
        None => 0,
    }
}

/// `visitData` de Go para una visita.
pub async fn visit_dto(repos: &Repositories, key: &[u8; 32], visit: &Visit) -> DtoResult<Value> {
    let status = visit.status.clone().unwrap_or_default();
    let mut data = json!({
        "id": visit.id,
        "purpose": visit.purpose,
        "personToVisit": visit.person_to_visit,
        "status": status,
        "notes": visit.notes,
        "cancellationReason": visit.cancellation_reason,
        "checkInTime": visit.check_in_time,
        "checkOutTime": visit.check_out_time,
        "arrivalTime": visit.arrival_time,
        "entryTime": visit.entry_time,
        "exitTime": visit.exit_time,
        "targetDepartment": visit.target_department,
        "hostPerson": visit.host_person,
        "companionName": visit.companion_name,
        "companionCedula": visit.companion_cedula,
        "vehicleBrand": visit.vehicle_brand,
        "vehicleModel": visit.vehicle_model,
        "vehiclePlate": visit.vehicle_plate,
        "area": visit.area,
        "action": visit.action,
        "department": visit.department,
    });
    // Perfil asociado, por id o por hash de cédula.
    let found_person = match visit.visitor_id {
        Some(id) => repos.visitors.find_by_id(id).await.ok(),
        None => repos
            .visitors
            .find_by_cedula(&visit.visitor_cedula)
            .await
            .ok(),
    };
    match found_person {
        Some(person) if person.anonymized_at.is_none() => {
            let profile = visitor_dto(key, &person)?;
            data["visitorCedula"] = profile["cedula"].clone();
            data["firstName"] = profile["firstName"].clone();
            data["lastName"] = profile["lastName"].clone();
            data["visitorName"] = Value::String(format!(
                "{} {}",
                profile["firstName"].as_str().unwrap_or(""),
                profile["lastName"].as_str().unwrap_or("")
            ));
            data["company"] = profile["company"].clone();
            data["visitorCompany"] = profile["company"].clone();
            for field in ["jobTitle", "email", "phone", "observations", "isBlocked"] {
                data[field] = profile[field].clone();
            }
        }
        _ => {
            data["visitorCedula"] = Value::Null;
            data["visitorName"] = json!("Anonimizado");
            data["visitorCompany"] = json!("Anonimizado");
            data["company"] = json!("Anonimizado");
            data["firstName"] = json!("Anonimizado");
            data["lastName"] = json!("");
        }
    }
    let mut duration = 0i64;
    if let Some(check_in) = &visit.check_in_time {
        let end = visit
            .check_out_time
            .as_deref()
            .and_then(parse_instant)
            .unwrap_or_else(Utc::now);
        duration = minutes_between(check_in, end);
    }
    data["durationMinutes"] = json!(duration);
    if status == "intermittent" {
        let logs = repos.visits.visit_logs(visit.id).await?;
        data["intermittent_logs"] = json!(logs
            .iter()
            .map(|log| {
                json!({
                    "id": log.id,
                    "visit_id": log.visit_id,
                    "check_out": log.check_out,
                    "re_entry": log.re_entry,
                    "notes": log.notes,
                    "createdAt": log.created_at,
                    "updatedAt": log.updated_at,
                    "registered_by": log.registered_by,
                    "reentered_by": log.reentered_by,
                })
            })
            .collect::<Vec<_>>());
        data["totalIntermittentEvents"] = json!(logs.len());
        let mut intervals = Vec::new();
        for log in &logs {
            intervals.push(json!({
                "id": log.id,
                "exitTime": log.check_out,
                "reentryTime": log.re_entry,
                "notes": log.notes,
            }));
            if log.re_entry.is_none() {
                data["intermittentSince"] = json!(log.check_out);
                data["lastExitTime"] = json!(log.check_out);
                data["intermittentNotes"] = json!(log.notes);
                if let Some(since) = parse_instant(&log.check_out) {
                    data["minutesOutside"] = json!((Utc::now() - since).num_minutes());
                }
            }
        }
        data["intervals"] = json!(intervals);
    }
    Ok(data)
}

/// Varias visitas, con sus perfiles.
pub async fn visit_dtos(
    repos: &Repositories,
    key: &[u8; 32],
    visits: &[Visit],
) -> DtoResult<Vec<Value>> {
    let mut out = Vec::with_capacity(visits.len());
    for visit in visits {
        out.push(visit_dto(repos, key, visit).await?);
    }
    Ok(out)
}

/// `arcoDTO` de Go.
pub fn arco_dto(key: &[u8; 32], request: &ArcoRequest) -> DtoResult<Value> {
    let cedula = plain_text(key, request.subject_cedula_encrypted.as_deref())?;
    let payload = match &request.request_payload {
        Some(raw) => serde_json::from_str(raw).map_err(|_| {
            DtoError::Store(StoreError::Validation(
                "invalid stored request payload".to_string(),
            ))
        })?,
        None => Value::Null,
    };
    Ok(json!({
        "id": request.id,
        "requestType": request.request_type,
        "subjectCedula": if cedula.is_empty() { Value::Null } else { Value::String(cedula) },
        "requestedByName": request.requested_by_name,
        "requestedByUserId": request.requested_by_user_id,
        "contactEmail": request.contact_email,
        "reason": request.reason,
        "requestPayload": payload,
        "status": request.status,
        "resolutionNotes": request.resolution_notes,
        "resolvedAt": request.resolved_at,
        "createdAt": request.created_at,
        "updatedAt": request.updated_at,
    }))
}

/// Una entrada de bitácora, con los nombres JSON de Go.
pub fn activity_log_json(log: &ActivityLog) -> Value {
    json!({
        "id": log.id,
        "userId": log.user_id,
        "username": log.username,
        "action": log.action,
        "entity": log.entity,
        "entityId": log.entity_id,
        "details": log.details,
        "ipAddress": log.ip_address,
        "userAgent": log.user_agent,
        "createdAt": log.created_at,
        "method": log.method,
        "path": log.path,
        "statusCode": log.status_code,
        "duration": log.duration,
        "severity": log.severity,
        "role": log.role,
        "resource": log.resource,
        "resourceId": log.resource_id,
        "status": log.status,
    })
}

/// Una entrada del historial de edición, con los valores descifrados
/// y los nombres JSON de Go (`editHistory` en `visitors.go`).
pub fn edit_history_json(
    key: &[u8; 32],
    entry: &logmaster_store::models::VisitorEditHistory,
) -> DtoResult<Value> {
    let old = match &entry.old_value {
        Some(raw) => {
            let text = decrypt(key, raw)?;
            if text.is_empty() {
                Value::Null
            } else {
                Value::String(text)
            }
        }
        None => Value::Null,
    };
    let new = match &entry.new_value {
        Some(raw) => {
            let text = decrypt(key, raw)?;
            if text.is_empty() {
                Value::Null
            } else {
                Value::String(text)
            }
        }
        None => Value::Null,
    };
    Ok(json!({
        "id": entry.id,
        "visitId": entry.visit_id,
        "visitorId": entry.visitor_id,
        "field": entry.field,
        "oldValue": old,
        "newValue": new,
        "editedBy": entry.edited_by,
        "editedByUsername": entry.edited_by_username,
        "editedAt": entry.edited_at,
        "createdAt": entry.created_at,
    }))
}

/// Fecha local (America/Caracas) de un instante guardado, para
/// agrupar calendario y reportes.
pub fn caracas_day(value: &str) -> Option<String> {
    parse_instant(value).map(caracas_date)
}
