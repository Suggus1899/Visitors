//! Visitas (`Visits`) y salidas temporales (`IntermittentLogs`).
//!
//! Reproduce `checkIn` y `transition` de `visits.go`, con la máquina
//! de estados de la línea base (§3):
//!
//! | operación | exige | deja | auditoría |
//! |---|---|---|
//! | check-in | — | `waiting` o `active` | `VISIT_CHECKIN` |
//! | admit | `waiting` | `active` | `VISIT_ADMIT` |
//! | cancel | `waiting` | `cancelled` | `VISIT_CANCELLED` |
//! | exit | `active` | `intermittent` | `VISIT_INTERMITTENT_EXIT` |
//! | reentry | `intermittent` | `active` | `VISIT_REENTRY` |
//! | checkout | `active` | `completed` | `VISIT_CHECKOUT` |
//!
//! Cada transición corre dentro de una transacción inmediata del
//! llamador (documento, §8): se lee la visita, se comprueba el estado
//! esperado y que `check_out_time` sea NULL, se muta y se escribe la
//! auditoría en la misma transacción. El aviso SSE se publica después
//! del commit, en la fase 4, no aquí.

use rusqlite::{params, Connection, Transaction};

use crate::error::{is_unique_violation, StoreError, StoreResult};
use crate::models::{IntermittentLog, ReportRow, Visit};
use crate::repos::audit;
use crate::repos::Actor;

const VISIT_COLUMNS: &str = "id, visitor_cedula, purpose, person_to_visit, check_in_time, \
    check_out_time, status, notes, companion_name, companion_cedula, vehicle_brand, \
    vehicle_model, vehicle_plate, area, action, department, \"createdAt\", \"updatedAt\", \
    visitor_id, arrival_time, entry_time, exit_time, target_department, host_person, \
    consent_policy_version, consent_accepted_at, consent_recorded_by, cancellation_reason";

fn row_to_visit(row: &rusqlite::Row<'_>) -> rusqlite::Result<Visit> {
    Visit::try_from(row)
}

/// `FindVisit`: por id. Sin fila → `VISIT_NOT_FOUND`.
pub fn find_by_id(conn: &Connection, id: i64) -> StoreResult<Visit> {
    let sql = format!("SELECT {VISIT_COLUMNS} FROM \"Visits\" WHERE id = ?1");
    conn.query_row(&sql, params![id], row_to_visit)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                StoreError::not_found("VISIT_NOT_FOUND", format!("visita {id} no encontrada"))
            }
            other => other.into(),
        })
}

/// Datos del registro (check-in). Los campos de texto ya vienen
/// validados por el handler; `status` es `waiting` o `active` y
/// `action` es `Carga`, `Descarga` o `Ninguna`.
pub struct NewVisit<'a> {
    pub visitor_cedula: &'a str,
    pub visitor_id: i64,
    pub purpose: &'a str,
    pub person_to_visit: &'a str,
    pub status: &'a str,
    pub notes: Option<&'a str>,
    pub companion_name: Option<&'a str>,
    pub companion_cedula: Option<&'a str>,
    pub vehicle_brand: Option<&'a str>,
    pub vehicle_model: Option<&'a str>,
    pub vehicle_plate: Option<&'a str>,
    pub area: Option<&'a str>,
    pub action: &'a str,
    pub department: Option<&'a str>,
    pub target_department: Option<&'a str>,
    pub host_person: Option<&'a str>,
    pub arrival_time: &'a str,
    pub entry_time: Option<&'a str>,
    pub check_in_time: &'a str,
    pub consent_policy_version: &'a str,
    pub consent_accepted_at: &'a str,
    pub consent_recorded_by: i64,
    pub created_at: &'a str,
    pub updated_at: &'a str,
}

/// Registra una visita y devuelve su id. Si ya hay una visita abierta
/// para la identidad, el índice parcial lo rechaza y se traduce a
/// `OPEN_VISIT_EXISTS`, igual que Go traduce el 23505.
pub fn insert_checkin(tx: &Transaction, visit: &NewVisit<'_>) -> StoreResult<i64> {
    let result = tx.execute(
        "INSERT INTO \"Visits\"(visitor_cedula, visitor_id, purpose, person_to_visit, status, \
         notes, companion_name, companion_cedula, vehicle_brand, vehicle_model, vehicle_plate, \
         area, action, department, target_department, host_person, arrival_time, entry_time, \
         check_in_time, consent_policy_version, consent_accepted_at, consent_recorded_by, \
         \"createdAt\", \"updatedAt\") \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, \
         ?19, ?20, ?21, ?22, ?23, ?24)",
        params![
            visit.visitor_cedula,
            visit.visitor_id,
            visit.purpose,
            visit.person_to_visit,
            visit.status,
            visit.notes,
            visit.companion_name,
            visit.companion_cedula,
            visit.vehicle_brand,
            visit.vehicle_model,
            visit.vehicle_plate,
            visit.area,
            visit.action,
            visit.department,
            visit.target_department,
            visit.host_person,
            visit.arrival_time,
            visit.entry_time,
            visit.check_in_time,
            visit.consent_policy_version,
            visit.consent_accepted_at,
            visit.consent_recorded_by,
            visit.created_at,
            visit.updated_at,
        ],
    );
    match result {
        Ok(_) => Ok(tx.last_insert_rowid()),
        Err(e) if is_unique_violation(&e) => Err(StoreError::conflict(
            "OPEN_VISIT_EXISTS",
            "Ya existe una visita o salida temporal abierta",
        )),
        Err(e) => Err(e.into()),
    }
}

/// Visitas en un estado, con salida aún pendiente, ordenadas como en
/// Go (`check_in_time, id`). Es la lista de espera, activas e
/// intermitentes de la pantalla principal.
pub fn list_by_status(
    conn: &Connection,
    status: &str,
    limit: i64,
    offset: i64,
) -> StoreResult<Vec<Visit>> {
    let sql = format!(
        "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
         WHERE status = ?1 AND check_out_time IS NULL \
         ORDER BY check_in_time, id LIMIT ?2 OFFSET ?3"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![status, limit, offset], row_to_visit)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Filtro de `filteredVisits`/`exportVisits` de Go (`queries.go`):
/// rango de fechas, estado, empresa (LIKE), hash de cédula y los
/// perfiles que coinciden con la búsqueda por trigramas.
pub struct VisitFilter {
    pub start: Option<String>,
    pub end: Option<String>,
    pub status: Option<String>,
    pub company: Option<String>,
    pub cedula_hash: Option<String>,
    pub visitor_ids: Option<Vec<i64>>,
    pub search: Option<String>,
    pub sort_field: String,
    pub sort_dir: String,
    pub limit: i64,
    pub offset: i64,
}

fn sort_column(field: &str) -> &'static str {
    match field {
        "arrival_time" => "v.arrival_time",
        "entry_time" => "v.entry_time",
        "exit_time" => "v.exit_time",
        "check_out_time" => "v.check_out_time",
        "status" => "v.status",
        "company" => "p.company",
        _ => "v.check_in_time",
    }
}

/// La búsqueda por texto o empresa, o el orden por empresa, exigen el
/// `LEFT JOIN` con `Visitors` (`visitFrom` de Go).
fn needs_join(filter: &VisitFilter) -> bool {
    filter.company.is_some() || filter.search.is_some() || filter.sort_field == "company"
}

fn visit_from(filter: &VisitFilter) -> String {
    if needs_join(filter) {
        " FROM \"Visits\" v LEFT JOIN \"Visitors\" p ON p.id = COALESCE(v.visitor_id, \
         (SELECT legacy.id FROM \"Visitors\" legacy WHERE legacy.cedula = v.visitor_cedula))"
            .to_string()
    } else {
        " FROM \"Visits\" v".to_string()
    }
}

fn visit_where(filter: &VisitFilter, args: &mut Vec<rusqlite::types::Value>) -> String {
    let mut clauses: Vec<String> = Vec::new();
    if let Some(start) = filter.start.as_deref() {
        clauses.push("v.check_in_time >= ?".to_string());
        args.push(start.to_string().into());
    }
    if let Some(end) = filter.end.as_deref() {
        clauses.push("v.check_in_time < ?".to_string());
        args.push(end.to_string().into());
    }
    if let Some(status) = filter.status.as_deref() {
        clauses.push("v.status = ?".to_string());
        args.push(status.to_string().into());
    }
    if let Some(company) = filter.company.as_deref() {
        clauses.push("p.company LIKE '%' || ? || '%'".to_string());
        args.push(company.to_string().into());
    }
    if let Some(hash) = filter.cedula_hash.as_deref() {
        clauses.push("v.visitor_cedula = ?".to_string());
        args.push(hash.to_string().into());
    }
    if let Some(search) = filter.search.as_deref() {
        // Como Go: el texto se busca en los campos de la visita y la
        // empresa, o el perfil está entre los candidatos del índice.
        // SQLite `LIKE` solo pliega ASCII; Go usa `ILIKE` (Unicode).
        let ids = filter.visitor_ids.as_deref().unwrap_or(&[]);
        let placeholders: Vec<String> = if ids.is_empty() {
            // Sin candidatos del índice, `IN (NULL)` no casa con
            // ninguna fila (un `IN ()` vacío sería SQL inválido).
            vec!["NULL".to_string()]
        } else {
            ids.iter().map(|_| "?".to_string()).collect()
        };
        clauses.push(format!(
            "(v.purpose LIKE '%' || ? || '%' OR v.person_to_visit LIKE '%' || ? || '%' \
             OR v.notes LIKE '%' || ? || '%' OR v.host_person LIKE '%' || ? || '%' \
             OR v.target_department LIKE '%' || ? || '%' OR p.company LIKE '%' || ? || '%' \
             OR p.id IN ({}))",
            placeholders.join(",")
        ));
        for _ in 0..6 {
            args.push(search.to_string().into());
        }
        for id in ids {
            args.push((*id).into());
        }
    }
    if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    }
}

fn visit_order(filter: &VisitFilter) -> String {
    let direction = if filter.sort_dir.eq_ignore_ascii_case("asc") {
        "ASC"
    } else {
        "DESC"
    };
    format!(
        " ORDER BY {} {} NULLS LAST, v.id DESC",
        sort_column(&filter.sort_field),
        direction
    )
}

/// Visitas filtradas, con el orden permitido de Go y paginación.
pub fn list_filtered(conn: &Connection, filter: &VisitFilter) -> StoreResult<Vec<Visit>> {
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    let sql = format!(
        "SELECT v.id, v.visitor_cedula, v.purpose, v.person_to_visit, v.check_in_time, \
         v.check_out_time, v.status, v.notes, v.companion_name, v.companion_cedula, \
         v.vehicle_brand, v.vehicle_model, v.vehicle_plate, v.area, v.action, v.department, \
         v.\"createdAt\", v.\"updatedAt\", v.visitor_id, v.arrival_time, v.entry_time, \
         v.exit_time, v.target_department, v.host_person, v.consent_policy_version, \
         v.consent_accepted_at, v.consent_recorded_by, v.cancellation_reason{}{}{} LIMIT ? OFFSET ?",
        visit_from(filter),
        visit_where(filter, &mut args),
        visit_order(filter),
    );
    args.push(filter.limit.into());
    args.push(filter.offset.into());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(args.iter()), row_to_visit)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Total de visitas del mismo filtro, para la paginación.
pub fn count_filtered(conn: &Connection, filter: &VisitFilter) -> StoreResult<i64> {
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    let sql = format!(
        "SELECT count(*){}{}",
        visit_from(filter),
        visit_where(filter, &mut args),
    );
    conn.query_row(&sql, rusqlite::params_from_iter(args.iter()), |row| {
        row.get(0)
    })
    .map_err(Into::into)
}

/// Conteo por día local de Caracas (`calendar` de Go): la fecha es
/// `date(check_in_time, '-4 hours')` porque Caracas es UTC-4 fijo.
pub fn calendar_counts(
    conn: &Connection,
    start: &str,
    end: &str,
    status: &str,
) -> StoreResult<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT date(check_in_time, '-4 hours'), count(*) FROM \"Visits\" \
         WHERE check_in_time >= ?1 AND check_in_time < ?2 AND (?3 = '' OR status = ?3) \
         GROUP BY 1 ORDER BY 1",
    )?;
    let rows = stmt.query_map(params![start, end, status], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Últimas visitas de un visitante, por id o por hash de cédula
/// (`getVisitor?history=true` de Go).
pub fn history_by_visitor(
    conn: &Connection,
    visitor_id: i64,
    cedula_hash: &str,
    limit: i64,
) -> StoreResult<Vec<Visit>> {
    let sql = format!(
        "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
         WHERE visitor_id = ?1 OR visitor_cedula = ?2 \
         ORDER BY check_in_time DESC LIMIT ?3"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![visitor_id, cedula_hash, limit], row_to_visit)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Si una visita pertenece a un visitante, por id o por hash de
/// cédula (`editVisitor` de Go comprueba el contexto de la visita).
pub fn belongs_to_visitor(
    conn: &Connection,
    visit_id: i64,
    visitor_id: i64,
    cedula_hash: &str,
) -> StoreResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM \"Visits\" \
         WHERE id = ?1 AND (visitor_id = ?2 OR visitor_cedula = ?3))",
        params![visit_id, visitor_id, cedula_hash],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Visitas de un titular para el acceso ARCO (`subjectAccess` de Go):
/// como `history_by_visitor`, con desempate por id descendente.
pub fn list_by_visitor_for_access(
    conn: &Connection,
    visitor_id: i64,
    cedula_hash: &str,
    limit: i64,
) -> StoreResult<Vec<Visit>> {
    let sql = format!(
        "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
         WHERE visitor_id = ?1 OR visitor_cedula = ?2 \
         ORDER BY check_in_time DESC, id DESC LIMIT ?3"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![visitor_id, cedula_hash, limit], row_to_visit)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Filas agregadas de reportes (`reportVisits` de Go): un grupo por
/// día local de Caracas, propósito y estado, con su conteo y la suma
/// de minutos de las visitas completadas. `julianday` da la duración
/// en días; por 24*60, en minutos.
pub fn report_rows(conn: &Connection, start: &str, end: &str) -> StoreResult<Vec<ReportRow>> {
    let mut stmt = conn.prepare(
        "SELECT count(*), COALESCE(SUM(CASE WHEN status = 'completed' \
         THEN (julianday(check_out_time) - julianday(check_in_time)) * 24 * 60 \
         ELSE 0 END), 0), purpose, min(check_in_time), status \
         FROM \"Visits\" WHERE check_in_time >= ?1 AND check_in_time < ?2 \
         GROUP BY date(check_in_time, '-4 hours'), purpose, status \
         ORDER BY min(check_in_time)",
    )?;
    let rows = stmt.query_map(params![start, end], |row| {
        Ok(ReportRow {
            count: row.get(0)?,
            minutes: row.get(1)?,
            visitor_cedula: String::new(),
            purpose: row.get(2)?,
            check_in_time: row.get(3)?,
            check_out_time: None,
            status: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Visitas activas ahora mismo (`visitStats` de Go): estado `active`
/// sin salida registrada.
pub fn count_active(conn: &Connection) -> StoreResult<i64> {
    conn.query_row(
        "SELECT count(*) FROM \"Visits\" WHERE status = 'active' AND check_out_time IS NULL",
        [],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Titulares distintos en un rango (`monthlyReport` de Go): cédulas
/// distintas de visitas no canceladas.
pub fn count_distinct_visitors(conn: &Connection, start: &str, end: &str) -> StoreResult<i64> {
    conn.query_row(
        "SELECT count(DISTINCT visitor_cedula) FROM \"Visits\" \
         WHERE check_in_time >= ?1 AND check_in_time < ?2 AND status <> 'cancelled'",
        params![start, end],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Visitas activas desde hace demasiado (`alerts` de Go): estado
/// `active` sin salida y entrada anterior al umbral.
pub fn list_long_active(conn: &Connection, before: &str) -> StoreResult<Vec<Visit>> {
    let sql = format!(
        "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
         WHERE status = 'active' AND check_out_time IS NULL AND check_in_time < ?1 \
         ORDER BY check_in_time"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![before], row_to_visit)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Intervalos de salida temporal de una visita, por salida.
pub fn visit_logs(conn: &Connection, visit_id: i64) -> StoreResult<Vec<IntermittentLog>> {
    let mut stmt = conn.prepare(
        "SELECT id, visit_id, check_out, re_entry, notes, \"createdAt\", \"updatedAt\", \
         registered_by, reentered_by FROM \"IntermittentLogs\" \
         WHERE visit_id = ?1 ORDER BY check_out",
    )?;
    let rows = stmt.query_map(params![visit_id], |row| IntermittentLog::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Operación de transición sobre una visita.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transition {
    /// `waiting` → `active`.
    Admit,
    /// `active` → `completed`.
    Checkout,
    /// `active` → `intermittent` (abre un intervalo).
    Exit,
    /// `intermittent` → `active` (cierra el intervalo abierto).
    Reentry,
    /// `waiting` → `cancelled` (exige motivo).
    Cancel,
}

impl Transition {
    pub(crate) fn expected_state(self) -> &'static str {
        match self {
            Transition::Admit => "waiting",
            Transition::Checkout => "active",
            Transition::Exit => "active",
            Transition::Reentry => "intermittent",
            Transition::Cancel => "waiting",
        }
    }

    pub(crate) fn target_state(self) -> &'static str {
        match self {
            Transition::Admit => "active",
            Transition::Checkout => "completed",
            Transition::Exit => "intermittent",
            Transition::Reentry => "active",
            Transition::Cancel => "cancelled",
        }
    }

    pub(crate) fn audit_action(self) -> &'static str {
        match self {
            Transition::Admit => "VISIT_ADMIT",
            Transition::Checkout => "VISIT_CHECKOUT",
            Transition::Exit => "VISIT_INTERMITTENT_EXIT",
            Transition::Reentry => "VISIT_REENTRY",
            Transition::Cancel => "VISIT_CANCELLED",
        }
    }
}

/// Metadatos de la petición para la auditoría de la transición
/// (los que `audit` de Go guarda en cada entrada).
pub struct TransitionAudit<'a> {
    pub ip_address: Option<&'a str>,
    pub user_agent: Option<&'a str>,
    pub role: Option<&'a str>,
    pub method: Option<&'a str>,
    pub path: Option<&'a str>,
}

/// Argumentos de una transición, agrupados para no exceder el límite
/// de argumentos de Clippy.
pub struct TransitionCall<'a> {
    pub actor: &'a Actor,
    pub notes: Option<&'a str>,
    pub reason: Option<&'a str>,
    pub now: &'a str,
    pub audit: Option<&'a TransitionAudit<'a>>,
}

/// Ejecuta una transición dentro de una transacción inmediata ya
/// abierta por el llamador. Comprueba el estado esperado, muta,
/// escribe la auditoría y devuelve la visita actualizada. Un estado
/// inesperado (o una salida ya cerrada) es `INVALID_VISIT_STATE`
/// (409), como en Go.
pub fn transition(
    tx: &Transaction,
    id: i64,
    operation: Transition,
    call: &TransitionCall<'_>,
) -> StoreResult<Visit> {
    let visit = {
        let sql = format!("SELECT {VISIT_COLUMNS} FROM \"Visits\" WHERE id = ?1");
        tx.query_row(&sql, params![id], row_to_visit)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    StoreError::not_found("VISIT_NOT_FOUND", format!("visita {id} no encontrada"))
                }
                other => StoreError::from(other),
            })?
    };
    if visit.status.as_deref() != Some(operation.expected_state()) || visit.check_out_time.is_some()
    {
        return Err(StoreError::conflict(
            "INVALID_VISIT_STATE",
            "La visita cambió o no permite esta operación",
        ));
    }

    if operation == Transition::Exit {
        tx.execute(
            "INSERT INTO \"IntermittentLogs\"(visit_id, check_out, notes, registered_by, \"createdAt\", \"updatedAt\") \
             VALUES(?1, ?2, ?3, ?4, ?2, ?2)",
            params![id, call.now, call.notes, call.actor.username],
        )?;
    }
    if operation == Transition::Reentry {
        let rows = tx.execute(
            "UPDATE \"IntermittentLogs\" SET re_entry = ?2, reentered_by = ?3, \"updatedAt\" = ?2 \
             WHERE visit_id = ?1 AND re_entry IS NULL",
            params![id, call.now, call.actor.username],
        )?;
        if rows != 1 {
            return Err(StoreError::conflict(
                "INVALID_VISIT_STATE",
                "La visita no tiene una única salida temporal abierta",
            ));
        }
    }

    match operation {
        Transition::Admit => {
            tx.execute(
                "UPDATE \"Visits\" SET status = ?2, entry_time = ?3, check_in_time = ?3, \"updatedAt\" = ?3 WHERE id = ?1",
                params![id, operation.target_state(), call.now],
            )?;
        }
        Transition::Checkout => {
            tx.execute(
                "UPDATE \"Visits\" SET status = ?2, check_out_time = ?3, exit_time = ?3, \
                 notes = COALESCE(?4, notes), \"updatedAt\" = ?3 WHERE id = ?1",
                params![id, operation.target_state(), call.now, call.notes],
            )?;
        }
        Transition::Cancel => {
            tx.execute(
                "UPDATE \"Visits\" SET status = ?2, cancellation_reason = ?3, \"updatedAt\" = ?4 WHERE id = ?1",
                params![id, operation.target_state(), call.reason, call.now],
            )?;
        }
        _ => {
            tx.execute(
                "UPDATE \"Visits\" SET status = ?2, \"updatedAt\" = ?3 WHERE id = ?1",
                params![id, operation.target_state(), call.now],
            )?;
        }
    }

    let (ip, agent, role, method, path) = match call.audit {
        Some(meta) => (
            meta.ip_address,
            meta.user_agent,
            meta.role,
            meta.method,
            meta.path,
        ),
        None => (None, None, None, None, None),
    };
    audit::write(
        tx,
        &audit::AuditEntry {
            user_id: call.actor.id,
            username: &call.actor.username,
            action: operation.audit_action(),
            entity: "Visit",
            entity_id: &id.to_string(),
            details: None,
            ip_address: ip,
            user_agent: agent,
            created_at: call.now,
            role,
            method,
            path,
        },
    )?;

    let sql = format!("SELECT {VISIT_COLUMNS} FROM \"Visits\" WHERE id = ?1");
    tx.query_row(&sql, params![id], row_to_visit)
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;
    use crate::repos::visitors::{self, NewVisitor};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const LATER: &str = "2026-11-10T01:00:00.000000Z";

    fn migrated() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::apply(&mut conn).unwrap();
        conn
    }

    fn seed_visitor(conn: &mut Connection, cedula: &str) -> i64 {
        let tx = conn.transaction().unwrap();
        let id = visitors::insert(
            &tx,
            &NewVisitor {
                cedula_hash: cedula,
                encrypted_cedula: None,
                first_name: "Ana",
                last_name: "Pérez",
                company: "Trébol",
                job_title: None,
                email: None,
                phone: None,
                photo_data: None,
                id_photo_data: None,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        tx.commit().unwrap();
        id
    }

    fn checkin(conn: &mut Connection, visitor_id: i64, cedula: &str, status: &str) -> i64 {
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        let id = insert_checkin(
            &tx,
            &NewVisit {
                visitor_cedula: cedula,
                visitor_id,
                purpose: "Reunión",
                person_to_visit: "Anfitrión",
                status,
                notes: None,
                companion_name: None,
                companion_cedula: None,
                vehicle_brand: None,
                vehicle_model: None,
                vehicle_plate: None,
                area: None,
                action: "Ninguna",
                department: None,
                target_department: None,
                host_person: None,
                arrival_time: NOW,
                entry_time: if status == "active" { Some(NOW) } else { None },
                check_in_time: NOW,
                consent_policy_version: "v1",
                consent_accepted_at: NOW,
                consent_recorded_by: 1,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        let actor = Actor {
            id: 1,
            username: "root".to_string(),
        };
        audit::write(
            &tx,
            &audit::AuditEntry {
                user_id: actor.id,
                username: &actor.username,
                action: "VISIT_CHECKIN",
                entity: "Visit",
                entity_id: &id.to_string(),
                details: None,
                ip_address: None,
                user_agent: None,
                created_at: NOW,
                role: None,
                method: None,
                path: None,
            },
        )
        .unwrap();
        tx.commit().unwrap();
        id
    }

    fn do_transition(
        conn: &mut Connection,
        id: i64,
        op: Transition,
        notes: Option<&str>,
        reason: Option<&str>,
        now: &str,
    ) -> StoreResult<Visit> {
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        let actor = Actor {
            id: 1,
            username: "root".to_string(),
        };
        let result = transition(
            &tx,
            id,
            op,
            &TransitionCall {
                actor: &actor,
                notes,
                reason,
                now,
                audit: Some(&TransitionAudit {
                    ip_address: Some("127.0.0.1"),
                    user_agent: Some("test"),
                    role: Some("operador"),
                    method: Some("POST"),
                    path: Some("/api/v1/visits"),
                }),
            },
        );
        match result {
            Ok(visit) => {
                tx.commit().unwrap();
                Ok(visit)
            }
            Err(e) => {
                tx.rollback().unwrap();
                Err(e)
            }
        }
    }

    #[test]
    fn full_cycle_waiting_to_completed() {
        let mut conn = migrated();
        let visitor_id = seed_visitor(&mut conn, "hash-a");
        let visit = checkin(&mut conn, visitor_id, "hash-a", "waiting");

        let visit = do_transition(&mut conn, visit, Transition::Admit, None, None, LATER).unwrap();
        assert_eq!(visit.status.as_deref(), Some("active"));
        assert_eq!(visit.entry_time.as_deref(), Some(LATER));
        assert_eq!(visit.check_in_time.as_deref(), Some(LATER));

        let visit = do_transition(
            &mut conn,
            visit.id,
            Transition::Exit,
            Some("Almuerzo"),
            None,
            LATER,
        )
        .unwrap();
        assert_eq!(visit.status.as_deref(), Some("intermittent"));
        let logs = visit_logs(&conn, visit.id).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].re_entry, None);
        assert_eq!(logs[0].notes.as_deref(), Some("Almuerzo"));
        assert_eq!(logs[0].registered_by.as_deref(), Some("root"));

        let visit =
            do_transition(&mut conn, visit.id, Transition::Reentry, None, None, LATER).unwrap();
        assert_eq!(visit.status.as_deref(), Some("active"));
        let logs = visit_logs(&conn, visit.id).unwrap();
        assert_eq!(logs[0].re_entry.as_deref(), Some(LATER));
        assert_eq!(logs[0].reentered_by.as_deref(), Some("root"));

        let visit = do_transition(
            &mut conn,
            visit.id,
            Transition::Checkout,
            Some("Salió"),
            None,
            LATER,
        )
        .unwrap();
        assert_eq!(visit.status.as_deref(), Some("completed"));
        assert_eq!(visit.check_out_time.as_deref(), Some(LATER));
        assert_eq!(visit.exit_time.as_deref(), Some(LATER));
        assert_eq!(visit.notes.as_deref(), Some("Salió"));

        // La auditoría del ciclo quedó en la misma base.
        let logs = audit::list_recent(&conn, 10).unwrap();
        let actions: Vec<&str> = logs.iter().map(|l| l.action.as_str()).collect();
        assert!(actions.contains(&"VISIT_CHECKIN"));
        assert!(actions.contains(&"VISIT_ADMIT"));
        assert!(actions.contains(&"VISIT_INTERMITTENT_EXIT"));
        assert!(actions.contains(&"VISIT_REENTRY"));
        assert!(actions.contains(&"VISIT_CHECKOUT"));
    }

    #[test]
    fn cancel_waiting_visit_requires_reason_and_state() {
        let mut conn = migrated();
        let visitor_id = seed_visitor(&mut conn, "hash-a");
        let visit = checkin(&mut conn, visitor_id, "hash-a", "waiting");
        let visit = do_transition(
            &mut conn,
            visit,
            Transition::Cancel,
            None,
            Some("No vino"),
            LATER,
        )
        .unwrap();
        assert_eq!(visit.status.as_deref(), Some("cancelled"));
        assert_eq!(visit.cancellation_reason.as_deref(), Some("No vino"));

        // Cancelar de nuevo ya no es válido.
        let err = do_transition(
            &mut conn,
            visit.id,
            Transition::Cancel,
            None,
            Some("Otra"),
            LATER,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            StoreError::Conflict {
                code: "INVALID_VISIT_STATE",
                ..
            }
        ));
    }

    #[test]
    fn invalid_transitions_are_conflicts() {
        let mut conn = migrated();
        let visitor_id = seed_visitor(&mut conn, "hash-a");
        let visit = checkin(&mut conn, visitor_id, "hash-a", "waiting");
        // Admitir dos veces.
        do_transition(&mut conn, visit, Transition::Admit, None, None, LATER).unwrap();
        let err =
            do_transition(&mut conn, visit, Transition::Admit, None, None, LATER).unwrap_err();
        assert!(matches!(
            err,
            StoreError::Conflict {
                code: "INVALID_VISIT_STATE",
                ..
            }
        ));
        // Reingresar sin haber salido.
        let err =
            do_transition(&mut conn, visit, Transition::Reentry, None, None, LATER).unwrap_err();
        assert!(matches!(
            err,
            StoreError::Conflict {
                code: "INVALID_VISIT_STATE",
                ..
            }
        ));
        // Visita inexistente.
        let err = do_transition(&mut conn, 9999, Transition::Admit, None, None, LATER).unwrap_err();
        assert!(matches!(
            err,
            StoreError::NotFound {
                code: "VISIT_NOT_FOUND",
                ..
            }
        ));
    }

    #[test]
    fn second_open_visit_for_same_identity_conflicts() {
        let mut conn = migrated();
        let visitor_id = seed_visitor(&mut conn, "hash-a");
        checkin(&mut conn, visitor_id, "hash-a", "active");
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        let err = insert_checkin(
            &tx,
            &NewVisit {
                visitor_cedula: "hash-a",
                visitor_id,
                purpose: "Reunión",
                person_to_visit: "Anfitrión",
                status: "waiting",
                notes: None,
                companion_name: None,
                companion_cedula: None,
                vehicle_brand: None,
                vehicle_model: None,
                vehicle_plate: None,
                area: None,
                action: "Ninguna",
                department: None,
                target_department: None,
                host_person: None,
                arrival_time: NOW,
                entry_time: None,
                check_in_time: NOW,
                consent_policy_version: "v1",
                consent_accepted_at: NOW,
                consent_recorded_by: 1,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            StoreError::Conflict {
                code: "OPEN_VISIT_EXISTS",
                ..
            }
        ));
        tx.rollback().unwrap();
    }

    #[test]
    fn list_by_status_matches_go_ordering() {
        let mut conn = migrated();
        let v1 = seed_visitor(&mut conn, "hash-a");
        let v2 = seed_visitor(&mut conn, "hash-b");
        checkin(&mut conn, v1, "hash-a", "waiting");
        checkin(&mut conn, v2, "hash-b", "waiting");
        let waiting = list_by_status(&conn, "waiting", 10, 0).unwrap();
        assert_eq!(waiting.len(), 2);
        assert_eq!(waiting[0].visitor_cedula, "hash-a");
        assert!(list_by_status(&conn, "active", 10, 0).unwrap().is_empty());
        let page = list_by_status(&conn, "waiting", 1, 1).unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].visitor_cedula, "hash-b");
    }

    fn base_filter() -> VisitFilter {
        VisitFilter {
            start: None,
            end: None,
            status: None,
            company: None,
            cedula_hash: None,
            visitor_ids: None,
            search: None,
            sort_field: "check_in_time".to_string(),
            sort_dir: "desc".to_string(),
            limit: 10,
            offset: 0,
        }
    }

    #[test]
    fn filtered_list_counts_and_sorts_like_go() {
        let mut conn = migrated();
        let v1 = seed_visitor(&mut conn, "hash-a");
        let v2 = seed_visitor(&mut conn, "hash-b");
        checkin(&mut conn, v1, "hash-a", "waiting");
        checkin(&mut conn, v2, "hash-b", "active");

        let filter = base_filter();
        assert_eq!(count_filtered(&conn, &filter).unwrap(), 2);
        let rows = list_filtered(&conn, &filter).unwrap();
        assert_eq!(rows.len(), 2);

        let mut by_status = base_filter();
        by_status.status = Some("waiting".to_string());
        assert_eq!(count_filtered(&conn, &by_status).unwrap(), 1);
        assert_eq!(
            list_filtered(&conn, &by_status).unwrap()[0].visitor_cedula,
            "hash-a"
        );

        let mut by_hash = base_filter();
        by_hash.cedula_hash = Some("hash-b".to_string());
        assert_eq!(
            list_filtered(&conn, &by_hash).unwrap()[0].visitor_cedula,
            "hash-b"
        );

        // Orden ascendente por check_in_time; ambas comparten el mismo
        // instante, así que manda el desempate de Go (`v.id DESC`).
        let mut asc = base_filter();
        asc.sort_dir = "asc".to_string();
        let rows = list_filtered(&conn, &asc).unwrap();
        assert_eq!(rows[0].visitor_cedula, "hash-b");
        assert_eq!(rows[1].visitor_cedula, "hash-a");

        // Búsqueda sin candidatos del índice: casa solo por los campos
        // de texto de la visita, como en Go (aquí, el propósito).
        let mut search = base_filter();
        search.search = Some("Reunión".to_string());
        search.visitor_ids = Some(vec![]);
        assert_eq!(count_filtered(&conn, &search).unwrap(), 2);
        // Y un texto que no aparece en ningún campo no casa con nadie.
        search.search = Some("Zzznadie".to_string());
        assert_eq!(count_filtered(&conn, &search).unwrap(), 0);
    }

    #[test]
    fn calendar_counts_group_by_caracas_day() {
        let mut conn = migrated();
        let v1 = seed_visitor(&mut conn, "hash-a");
        checkin(&mut conn, v1, "hash-a", "active");
        // checkin usa NOW = 2026-11-10T00:00:00Z = 09-11 20:00 Caracas.
        let days = calendar_counts(
            &conn,
            "2026-11-09T04:00:00.000000Z",
            "2026-11-10T04:00:00.000000Z",
            "",
        )
        .unwrap();
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].0, "2026-11-09");
        assert_eq!(days[0].1, 1);
        let days = calendar_counts(
            &conn,
            "2026-11-09T04:00:00.000000Z",
            "2026-11-10T04:00:00.000000Z",
            "waiting",
        )
        .unwrap();
        assert!(days.is_empty());
    }

    #[test]
    fn history_by_visitor_returns_latest_first() {
        let mut conn = migrated();
        let v1 = seed_visitor(&mut conn, "hash-a");
        let first = checkin(&mut conn, v1, "hash-a", "waiting");
        do_transition(&mut conn, first, Transition::Admit, None, None, LATER).unwrap();
        do_transition(&mut conn, first, Transition::Checkout, None, None, LATER).unwrap();
        checkin(&mut conn, v1, "hash-a", "waiting");
        let history = history_by_visitor(&conn, v1, "hash-a", 5).unwrap();
        assert_eq!(history.len(), 2);
        // La primera visita quedó con check_in_time = LATER (el admit
        // lo mueve, como en Go), así que va primera en orden desc.
        assert_eq!(history[0].status.as_deref(), Some("completed"));
        assert_eq!(history[1].status.as_deref(), Some("waiting"));
    }
}
