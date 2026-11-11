//! Bitácora de actividad (`ActivityLogs`).
//!
//! Reproduce `WriteAudit` de `queries.sql`: cada operación de dominio
//! escribe su entrada en la misma transacción que la mutación, con
//! `status = 'success'` y `statusCode = 200` cuando la operación se
//! confirma. Los fallos no se auditan como éxito: si la transacción
//! se revierte, la entrada se pierde con ella, igual que en Go.

use rusqlite::{params, Connection, Transaction};

use crate::error::StoreResult;
use crate::models::ActivityLog;

/// Entrada de auditoría. `details`, `ip_address`, `user_agent`,
/// `role`, `method` y `path` son opcionales; el resto, obligatorio.
pub struct AuditEntry<'a> {
    pub user_id: i64,
    pub username: &'a str,
    pub action: &'a str,
    pub entity: &'a str,
    pub entity_id: &'a str,
    pub details: Option<&'a str>,
    pub ip_address: Option<&'a str>,
    pub user_agent: Option<&'a str>,
    pub created_at: &'a str,
    pub role: Option<&'a str>,
    pub method: Option<&'a str>,
    pub path: Option<&'a str>,
}

/// Escribe una entrada de auditoría y devuelve su id.
pub fn write(tx: &Transaction, entry: &AuditEntry<'_>) -> StoreResult<i64> {
    tx.execute(
        "INSERT INTO \"ActivityLogs\"(\"userId\", username, action, entity, \"entityId\", details, \
         \"ipAddress\", \"userAgent\", \"createdAt\", role, method, path, status, \"statusCode\") \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'success', 200)",
        params![
            entry.user_id,
            entry.username,
            entry.action,
            entry.entity,
            entry.entity_id,
            entry.details,
            entry.ip_address,
            entry.user_agent,
            entry.created_at,
            entry.role,
            entry.method,
            entry.path,
        ],
    )?;
    Ok(tx.last_insert_rowid())
}

const LOG_COLUMNS: &str = "id, \"userId\", username, action, entity, \"entityId\", details, \
    \"ipAddress\", \"userAgent\", \"createdAt\", method, path, \"statusCode\", duration, \
    severity, role, resource, \"resourceId\", status";

/// Entradas más recientes, para el panel de auditoría.
pub fn list_recent(conn: &Connection, limit: i64) -> StoreResult<Vec<ActivityLog>> {
    let sql = format!(
        "SELECT {LOG_COLUMNS} FROM \"ActivityLogs\" ORDER BY \"createdAt\" DESC, id DESC LIMIT ?1"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![limit], |row| ActivityLog::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Número total de entradas.
pub fn count(conn: &Connection) -> StoreResult<i64> {
    conn.query_row("SELECT count(*) FROM \"ActivityLogs\"", [], |row| row.get(0))
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;

    #[test]
    fn write_and_list() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::apply(&mut conn).unwrap();
        let tx = conn.transaction().unwrap();
        let id = write(
            &tx,
            &AuditEntry {
                user_id: 1,
                username: "root",
                action: "VISIT_CHECKIN",
                entity: "Visit",
                entity_id: "7",
                details: None,
                ip_address: Some("127.0.0.1"),
                user_agent: None,
                created_at: "2026-11-10T00:00:00.000000Z",
                role: Some("root"),
                method: Some("POST"),
                path: Some("/api/v1/visits/checkin"),
            },
        )
        .unwrap();
        tx.commit().unwrap();
        let logs = list_recent(&conn, 10).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, id);
        assert_eq!(logs[0].status.as_deref(), Some("success"));
        assert_eq!(logs[0].status_code, Some(200));
        assert_eq!(logs[0].severity.as_deref(), Some("low"));
        assert_eq!(count(&conn).unwrap(), 1);
    }
}
