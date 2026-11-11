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
    conn.query_row("SELECT count(*) FROM \"ActivityLogs\"", [], |row| {
        row.get(0)
    })
    .map_err(Into::into)
}

/// Filtros de `listActivityLogs` de Go: rango medio abierto sobre
/// `createdAt` (los bordes llegan como RFC 3339), igualdades exactas
/// y búsqueda por subcadena en usuario/acción/detalles/entidad.
#[derive(Debug, Clone, Default)]
pub struct AuditFilter<'a> {
    pub start: Option<&'a str>,
    pub end: Option<&'a str>,
    pub action: Option<&'a str>,
    pub username: Option<&'a str>,
    pub entity: Option<&'a str>,
    pub ip: Option<&'a str>,
    pub search: Option<&'a str>,
    pub user_id: Option<i64>,
}

fn filter_where(filter: &AuditFilter<'_>) -> (String, Vec<rusqlite::types::Value>) {
    let mut sql = String::from(" WHERE 1 = 1");
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(v) = filter.start {
        sql.push_str(" AND \"createdAt\" >= ?");
        args.push(v.to_owned().into());
    }
    if let Some(v) = filter.end {
        sql.push_str(" AND \"createdAt\" < ?");
        args.push(v.to_owned().into());
    }
    for (column, value) in [
        ("action", filter.action),
        ("username", filter.username),
        ("entity", filter.entity),
        ("\"ipAddress\"", filter.ip),
    ] {
        if let Some(v) = value {
            sql.push_str(&format!(" AND {column} = ?"));
            args.push(v.to_owned().into());
        }
    }
    if let Some(v) = filter.search {
        sql.push_str(
            " AND (username LIKE '%' || ? || '%' ESCAPE '\\' OR action LIKE '%' || ? || '%' ESCAPE '\\' \
             OR details LIKE '%' || ? || '%' ESCAPE '\\' OR \"entityId\" LIKE '%' || ? || '%' ESCAPE '\\')",
        );
        for _ in 0..4 {
            args.push(v.to_owned().into());
        }
    }
    if let Some(v) = filter.user_id {
        sql.push_str(" AND \"userId\" = ?");
        args.push(v.to_owned().into());
    }
    (sql, args)
}

/// Entradas filtradas (`listActivityLogs` y su variante de
/// superadministración de Go), ordenadas por fecha descendente.
pub fn list_filtered(
    conn: &Connection,
    filter: &AuditFilter<'_>,
    limit: i64,
    offset: i64,
) -> StoreResult<Vec<ActivityLog>> {
    let (cond, args) = filter_where(filter);
    let sql = format!(
        "SELECT {LOG_COLUMNS} FROM \"ActivityLogs\" {cond} ORDER BY \"createdAt\" DESC, id DESC LIMIT ? OFFSET ?"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut all: Vec<rusqlite::types::Value> = args;
    all.push(limit.into());
    all.push(offset.into());
    let rows = stmt.query_map(rusqlite::params_from_iter(all.iter()), |row| {
        ActivityLog::try_from(row)
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Total de entradas que cumplen el filtro, para la paginación.
pub fn count_filtered(conn: &Connection, filter: &AuditFilter<'_>) -> StoreResult<i64> {
    let (cond, args) = filter_where(filter);
    let sql = format!("SELECT count(*) FROM \"ActivityLogs\" {cond}");
    conn.query_row(&sql, rusqlite::params_from_iter(args.iter()), |row| {
        row.get(0)
    })
    .map_err(Into::into)
}

/// Resumen de hoy (`auditStats` de Go): inicios de sesión, acciones,
/// usuarios distintos e IPs distintas entre `start` y `end`.
pub fn today_counts(
    conn: &Connection,
    start: &str,
    end: &str,
) -> StoreResult<(i64, i64, i64, i64)> {
    conn.query_row(
        "SELECT count(CASE WHEN action = 'LOGIN' THEN 1 END), count(*), \
         count(DISTINCT \"userId\"), count(DISTINCT \"ipAddress\") \
         FROM \"ActivityLogs\" WHERE \"createdAt\" >= ?1 AND \"createdAt\" < ?2",
        params![start, end],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .map_err(Into::into)
}

/// Conteo agrupado (`auditStats` de Go): `group` es `action`,
/// `username` o `date` (fecha local de Caracas). En `date` el
/// resultado es `YYYY-MM-DD`.
pub fn group_counts(
    conn: &Connection,
    since: &str,
    group: &str,
) -> StoreResult<Vec<(String, i64)>> {
    let (expr, limit) = match group {
        "username" => ("username", " LIMIT 5"),
        "date" => ("date(\"createdAt\", '-4 hours')", ""),
        _ => ("action", ""),
    };
    let sql = format!(
        "SELECT {expr}, count(*) FROM \"ActivityLogs\" WHERE \"createdAt\" >= ?1 \
         GROUP BY 1 ORDER BY 2 DESC, 1{limit}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![since], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Valores distintos de una columna (`distinctActivityLogValues` de
/// Go): solo `action` y `username` son columnas válidas; cualquier
/// otro valor es un error de programación, no de entrada.
pub fn distinct(conn: &Connection, column: &str) -> StoreResult<Vec<String>> {
    let column = match column {
        "action" => "action",
        "username" => "username",
        _ => {
            return Err(crate::error::StoreError::Validation(
                "columna no válida".to_string(),
            ))
        }
    };
    let sql = format!("SELECT DISTINCT {column} FROM \"ActivityLogs\" ORDER BY 1");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
