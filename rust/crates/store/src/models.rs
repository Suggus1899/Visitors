//! Modelos de fila de la base embebida.
//!
//! Reglas de representación (documento, sección 10):
//! - Las fechas son `String` en UTC ISO 8601 canónico
//!   (`%Y-%m-%dT%H:%M:%S%.6fZ`); `Option<String>` cuando la columna
//!   admite NULL. La conversión a zona America/Caracas vive en la capa
//!   que presenta los datos, no aquí.
//! - Los booleanos de PostgreSQL son `bool` (0/1 en SQLite); la
//!   conversión vive en `row_bool`.
//! - Los campos cifrados viajan como `String` tal cual están guardados
//!   (formato `ENC:...` de Go o valor histórico sin prefijo). Esta capa
//!   no descifra: el descifrado es de la fase 3, salvo la comprobación
//!   de formato de `preflight` (ver `crypto`).
//! - Las fotos son `Option<Vec<u8>>` (BLOB).

use rusqlite::Row;

/// `BOOLEAN` de PostgreSQL es `INTEGER` 0/1 en SQLite. NULL se lee
/// como `false` solo donde Go aplica `COALESCE(..., false)`; en el
/// resto de columnas el modelo usa `Option<bool>` (ver `row_bool_opt`).
pub fn row_bool(row: &Row, idx: usize) -> rusqlite::Result<bool> {
    Ok(row.get::<_, Option<i64>>(idx)?.unwrap_or(0) != 0)
}

pub fn row_bool_opt(row: &Row, idx: usize) -> rusqlite::Result<Option<bool>> {
    Ok(row.get::<_, Option<i64>>(idx)?.map(|v| v != 0))
}

/// Cuenta de usuario (tabla `Users`).
#[derive(Debug, Clone, PartialEq)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub token_version: i64,
    pub password_hash: String,
    pub role: Option<String>,
    pub reset_token: Option<String>,
    pub reset_token_expiry: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub must_change_password: Option<bool>,
    pub password_changed_at: Option<String>,
    pub login_attempts: Option<i64>,
    pub locked_until: Option<String>,
}

impl TryFrom<&Row<'_>> for User {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            username: row.get(1)?,
            email: row.get(2)?,
            token_version: row.get(3)?,
            password_hash: row.get(4)?,
            role: row.get(5)?,
            reset_token: row.get(6)?,
            reset_token_expiry: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
            must_change_password: row_bool_opt(row, 10)?,
            password_changed_at: row.get(11)?,
            login_attempts: row.get(12)?,
            locked_until: row.get(13)?,
        })
    }
}

/// Perfil de visitante (tabla `Visitors`).
///
/// `cedula` guarda el HMAC-SHA-256 hex de la cédula normalizada (64
/// caracteres), no la cédula en claro; `encrypted_cedula` guarda la
/// cédula cifrada. `first_name`, `last_name`, `job_title`, `email`,
/// `phone` y `observations` guardan el texto cifrado con el formato
/// `ENC:...` de Go (o el valor histórico sin cifrar, si lo hay).
#[derive(Debug, Clone, PartialEq)]
pub struct Visitor {
    pub id: i64,
    pub anonymized_at: Option<String>,
    pub cedula: String,
    pub encrypted_cedula: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub company: String,
    pub job_title: Option<String>,
    pub photo_url: Option<String>,
    pub id_photo_url: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub updated_at: String,
    pub photo_data: Option<Vec<u8>>,
    pub id_photo_data: Option<Vec<u8>>,
    pub is_blocked: Option<bool>,
    pub observations: Option<String>,
    pub created_at: Option<String>,
}

impl TryFrom<&Row<'_>> for Visitor {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            anonymized_at: row.get(1)?,
            cedula: row.get(2)?,
            encrypted_cedula: row.get(3)?,
            first_name: row.get(4)?,
            last_name: row.get(5)?,
            company: row.get(6)?,
            job_title: row.get(7)?,
            photo_url: row.get(8)?,
            id_photo_url: row.get(9)?,
            email: row.get(10)?,
            phone: row.get(11)?,
            updated_at: row.get(12)?,
            photo_data: row.get(13)?,
            id_photo_data: row.get(14)?,
            is_blocked: row_bool_opt(row, 15)?,
            observations: row.get(16)?,
            created_at: row.get(17)?,
        })
    }
}

/// Visita (tabla `Visits`).
#[derive(Debug, Clone, PartialEq)]
pub struct Visit {
    pub id: i64,
    pub visitor_cedula: String,
    pub purpose: String,
    pub person_to_visit: String,
    pub check_in_time: Option<String>,
    pub check_out_time: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub companion_name: Option<String>,
    pub companion_cedula: Option<String>,
    pub vehicle_brand: Option<String>,
    pub vehicle_model: Option<String>,
    pub vehicle_plate: Option<String>,
    pub area: Option<String>,
    pub action: Option<String>,
    pub department: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub visitor_id: Option<i64>,
    pub arrival_time: Option<String>,
    pub entry_time: Option<String>,
    pub exit_time: Option<String>,
    pub target_department: Option<String>,
    pub host_person: Option<String>,
    pub consent_policy_version: Option<String>,
    pub consent_accepted_at: Option<String>,
    pub consent_recorded_by: Option<i64>,
    pub cancellation_reason: Option<String>,
}

impl TryFrom<&Row<'_>> for Visit {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            visitor_cedula: row.get(1)?,
            purpose: row.get(2)?,
            person_to_visit: row.get(3)?,
            check_in_time: row.get(4)?,
            check_out_time: row.get(5)?,
            status: row.get(6)?,
            notes: row.get(7)?,
            companion_name: row.get(8)?,
            companion_cedula: row.get(9)?,
            vehicle_brand: row.get(10)?,
            vehicle_model: row.get(11)?,
            vehicle_plate: row.get(12)?,
            area: row.get(13)?,
            action: row.get(14)?,
            department: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
            visitor_id: row.get(18)?,
            arrival_time: row.get(19)?,
            entry_time: row.get(20)?,
            exit_time: row.get(21)?,
            target_department: row.get(22)?,
            host_person: row.get(23)?,
            consent_policy_version: row.get(24)?,
            consent_accepted_at: row.get(25)?,
            consent_recorded_by: row.get(26)?,
            cancellation_reason: row.get(27)?,
        })
    }
}

/// Intervalo de salida temporal (tabla `IntermittentLogs`).
#[derive(Debug, Clone, PartialEq)]
pub struct IntermittentLog {
    pub id: i64,
    pub visit_id: i64,
    pub check_out: String,
    pub re_entry: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub registered_by: Option<String>,
    pub reentered_by: Option<String>,
}

impl TryFrom<&Row<'_>> for IntermittentLog {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            visit_id: row.get(1)?,
            check_out: row.get(2)?,
            re_entry: row.get(3)?,
            notes: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            registered_by: row.get(7)?,
            reentered_by: row.get(8)?,
        })
    }
}

/// Cambio en un perfil (tabla `VisitorEditHistories`).
#[derive(Debug, Clone, PartialEq)]
pub struct VisitorEditHistory {
    pub id: i64,
    pub visit_id: Option<i64>,
    pub visitor_id: i64,
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub edited_by: i64,
    pub edited_by_username: String,
    pub edited_at: String,
    pub created_at: String,
}

impl TryFrom<&Row<'_>> for VisitorEditHistory {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            visit_id: row.get(1)?,
            visitor_id: row.get(2)?,
            field: row.get(3)?,
            old_value: row.get(4)?,
            new_value: row.get(5)?,
            edited_by: row.get(6)?,
            edited_by_username: row.get(7)?,
            edited_at: row.get(8)?,
            created_at: row.get(9)?,
        })
    }
}

/// Entrada de bitácora (tabla `ActivityLogs`).
#[derive(Debug, Clone, PartialEq)]
pub struct ActivityLog {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub action: String,
    pub entity: String,
    pub entity_id: String,
    pub details: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: Option<String>,
    pub method: Option<String>,
    pub path: Option<String>,
    pub status_code: Option<i64>,
    pub duration: Option<i64>,
    pub severity: Option<String>,
    pub role: Option<String>,
    pub resource: Option<String>,
    pub resource_id: Option<i64>,
    pub status: Option<String>,
}

impl TryFrom<&Row<'_>> for ActivityLog {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            user_id: row.get(1)?,
            username: row.get(2)?,
            action: row.get(3)?,
            entity: row.get(4)?,
            entity_id: row.get(5)?,
            details: row.get(6)?,
            ip_address: row.get(7)?,
            user_agent: row.get(8)?,
            created_at: row.get(9)?,
            method: row.get(10)?,
            path: row.get(11)?,
            status_code: row.get(12)?,
            duration: row.get(13)?,
            severity: row.get(14)?,
            role: row.get(15)?,
            resource: row.get(16)?,
            resource_id: row.get(17)?,
            status: row.get(18)?,
        })
    }
}

/// Solicitud ARCO (tabla `ArcoRequests`).
#[derive(Debug, Clone, PartialEq)]
pub struct ArcoRequest {
    pub id: i64,
    pub request_type: String,
    pub subject_cedula_hash: String,
    pub subject_cedula_encrypted: Option<String>,
    pub requested_by_name: String,
    pub requested_by_user_id: Option<i64>,
    pub contact_email: Option<String>,
    pub reason: Option<String>,
    pub request_payload: Option<String>,
    pub status: String,
    pub resolution_notes: Option<String>,
    pub resolved_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl TryFrom<&Row<'_>> for ArcoRequest {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            request_type: row.get(1)?,
            subject_cedula_hash: row.get(2)?,
            subject_cedula_encrypted: row.get(3)?,
            requested_by_name: row.get(4)?,
            requested_by_user_id: row.get(5)?,
            contact_email: row.get(6)?,
            reason: row.get(7)?,
            request_payload: row.get(8)?,
            status: row.get(9)?,
            resolution_notes: row.get(10)?,
            resolved_at: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    }
}

/// Departamento (tabla `Departments`).
#[derive(Debug, Clone, PartialEq)]
pub struct Department {
    pub id: i64,
    pub name: String,
    pub code: Option<String>,
    pub is_active: Option<bool>,
    pub created_at: Option<String>,
}

impl TryFrom<&Row<'_>> for Department {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            code: row.get(2)?,
            is_active: row_bool_opt(row, 3)?,
            created_at: row.get(4)?,
        })
    }
}

/// Propósito de visita (tabla `VisitPurposes`).
#[derive(Debug, Clone, PartialEq)]
pub struct VisitPurpose {
    pub id: i64,
    pub name: String,
    pub is_active: Option<bool>,
    pub created_at: Option<String>,
}

impl TryFrom<&Row<'_>> for VisitPurpose {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            is_active: row_bool_opt(row, 2)?,
            created_at: row.get(3)?,
        })
    }
}

/// Trigrama protegido de búsqueda (tabla `VisitorSearchTokens`).
#[derive(Debug, Clone, PartialEq)]
pub struct VisitorSearchToken {
    pub visitor_id: i64,
    pub token: Vec<u8>,
}

impl TryFrom<&Row<'_>> for VisitorSearchToken {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            visitor_id: row.get(0)?,
            token: row.get(1)?,
        })
    }
}

/// Estado del índice de búsqueda (tabla `SearchIndexState`, una fila).
#[derive(Debug, Clone, PartialEq)]
pub struct SearchIndexState {
    pub id: i64,
    pub fingerprint: String,
    pub cursor: i64,
    pub ready: bool,
}

impl TryFrom<&Row<'_>> for SearchIndexState {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            fingerprint: row.get(1)?,
            cursor: row.get(2)?,
            ready: row_bool(row, 3)?,
        })
    }
}

/// Estado del índice de identidad (tabla `IdentityIndexState`, una fila).
#[derive(Debug, Clone, PartialEq)]
pub struct IdentityIndexState {
    pub id: i64,
    pub fingerprint: String,
    pub ready: bool,
}

impl TryFrom<&Row<'_>> for IdentityIndexState {
    type Error = rusqlite::Error;
    fn try_from(row: &Row<'_>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.get(0)?,
            fingerprint: row.get(1)?,
            ready: row_bool(row, 2)?,
        })
    }
}
