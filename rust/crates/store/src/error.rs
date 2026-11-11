//! Errores de dominio de la capa de datos.
//!
//! Los códigos reproducen los de la API Go (`error.code` del contrato):
//! la capa HTTP de la fase 4 los traduce a su estado correspondiente
//! (404, 409, ...). La distinción 404/409 vive aquí, no en el handler,
//! para que una transición inválida no pueda colarse como error 500.

use std::fmt;

/// Error de la capa de datos.
#[derive(Debug)]
pub enum StoreError {
    /// Recurso inexistente: `VISIT_NOT_FOUND`, `VISITOR_NOT_FOUND`,
    /// `USER_NOT_FOUND`.
    NotFound { code: &'static str, message: String },
    /// Conflicto de estado o de unicidad: `OPEN_VISIT_EXISTS`,
    /// `INVALID_VISIT_STATE`, `VISITOR_BLOCKED`.
    Conflict { code: &'static str, message: String },
    /// Dato inválido para la operación.
    Validation(String),
    /// Fallo de SQLite u otro error interno.
    Db(rusqlite::Error),
    /// Fallo de otra operación (conversión, E/S, ...).
    Other(anyhow::Error),
}

impl StoreError {
    /// Código de aplicación del contrato (`error.code`).
    pub fn code(&self) -> &'static str {
        match self {
            StoreError::NotFound { code, .. } => code,
            StoreError::Conflict { code, .. } => code,
            StoreError::Validation(_) => "VALIDATION_ERROR",
            StoreError::Db(_) | StoreError::Other(_) => "INTERNAL_ERROR",
        }
    }

    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        StoreError::NotFound {
            code,
            message: message.into(),
        }
    }

    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        StoreError::Conflict {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::NotFound { code, message } => write!(f, "{code}: {message}"),
            StoreError::Conflict { code, message } => write!(f, "{code}: {message}"),
            StoreError::Validation(message) => write!(f, "VALIDATION_ERROR: {message}"),
            StoreError::Db(e) => write!(f, "error de base: {e}"),
            StoreError::Other(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for StoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            StoreError::Db(e) => Some(e),
            StoreError::Other(e) => Some(e.as_ref()),
            _ => None,
        }
    }
}

impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        // `QueryReturnedNoRows` es "no existe", no un fallo interno.
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            return StoreError::NotFound {
                code: "NOT_FOUND",
                message: "recurso no encontrado".to_string(),
            };
        }
        StoreError::Db(e)
    }
}

impl From<anyhow::Error> for StoreError {
    fn from(e: anyhow::Error) -> Self {
        StoreError::Other(e)
    }
}

/// Resultado de la capa de datos.
pub type StoreResult<T> = Result<T, StoreError>;

/// ¿Es este error de SQLite una violación de unicidad (código 2067)?
/// Sirve para traducir el índice parcial de visita abierta a
/// `OPEN_VISIT_EXISTS`, igual que Go traduce el 23505 de PostgreSQL.
pub fn is_unique_violation(e: &rusqlite::Error) -> bool {
    match e {
        rusqlite::Error::SqliteFailure(err, _) => {
            err.code == rusqlite::ErrorCode::ConstraintViolation
        }
        _ => false,
    }
}
