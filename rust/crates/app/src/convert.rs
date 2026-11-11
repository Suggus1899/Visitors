//! Conversión de PostgreSQL a SQLite (`convert`) y preflight.
//!
//! Flujo documentado (documento, §§10, 18, 19):
//!
//! 1. `logmaster preflight --from-postgres <cadena>`: comprueba la
//!    base de origen (descifrado, relaciones, visitas abiertas
//!    duplicadas, intervalos abiertos duplicados, tokens) antes de
//!    tocar nada. No escribe.
//! 2. `logmaster convert --from-postgres <cadena> --to <sqlite>`:
//!    exige que el destino no exista, copia tabla por tabla en orden
//!    de dependencias dentro de una sola transacción inmediata,
//!    verifica los conteos y corre el preflight sobre el destino. Si
//!    algo falla, borra el parcial y no deja nada a medias.
//! 3. `logmaster preflight --db <sqlite>`: vuelve a comprobar el
//!    destino ya convertido, con la misma clave.
//!
//! La clave de datos sale de `ENCRYPTION_KEY` (o `PII_ENCRYPTION_KEY`),
//! 32 bytes en hex, igual que en Go (`config.go`). Sin clave, el
//! preflight de descifrado queda `skipped`, no fallido.
//!
//! La conexión a PostgreSQL es **sin TLS** (`NoTls`): la conversión
//! se ejecuta en el mismo host que la base (o en su red de confianza),
//! igual que el respaldo que la precede. Si el PostgreSQL de origen
//! está en otra máquina sin red privada, hay que tunelizar la conexión
//! o añadir TLS al cliente; eso no está en esta fase.
//!
//! Traducción de tipos: `TIMESTAMPTZ` → `TEXT` ISO 8601 UTC canónico
//! (`%Y-%m-%dT%H:%M:%S%.6fZ`), `BYTEA` → `BLOB`, `BOOLEAN` →
//! `INTEGER` 0/1. Las columnas enum de PostgreSQL (`Users.role`,
//! `Visits.status`, `Visits.action`, `ArcoRequests.requestType`,
//! `ArcoRequests.status`) se leen con `::text`, porque el crate
//! `postgres` no convierte un enum a `String` por sí solo.

use std::path::{Path, PathBuf};

use anyhow::{bail, ensure, Context, Result};
use chrono::{DateTime, NaiveDateTime, Utc};
use fallible_iterator::FallibleIterator;
use postgres::{Client, NoTls, Row};
use rusqlite::Transaction;

use logmaster_store::crypto;
use logmaster_store::preflight::{check_sqlite, Check, PreflightReport};
use logmaster_store::Store;

/// Informe de una conversión terminada.
pub struct ConvertReport {
    /// (tabla, filas copiadas) en orden de copia.
    pub counts: Vec<(String, u64)>,
    /// Preflight sobre el destino ya convertido.
    pub preflight: PreflightReport,
}

impl ConvertReport {
    /// Imprime el informe en consola, sin datos personales.
    pub fn print(&self) {
        println!("conversion terminada:");
        for (table, count) in &self.counts {
            println!("  {table}: {count} filas");
        }
        print_report(&self.preflight);
    }
}

/// Imprime un informe de preflight en consola.
pub fn print_report(report: &PreflightReport) {
    println!("preflight:");
    for check in &report.checks {
        let mark = if check.skipped {
            "omitida"
        } else if check.passed {
            "ok"
        } else {
            "FALLO"
        };
        println!("  [{mark}] {}: {}", check.name, check.detail);
    }
    if report.all_passed() {
        println!("preflight: todo correcto");
    } else {
        println!("preflight: hay fallos (ver arriba)");
    }
}

/// Clave de datos de 32 bytes desde el entorno, como en Go.
/// `None` si no está definida ninguna de las dos variables.
pub fn load_key() -> Result<Option<[u8; 32]>> {
    let raw = std::env::var("ENCRYPTION_KEY")
        .or_else(|_| std::env::var("PII_ENCRYPTION_KEY"))
        .ok();
    let Some(raw) = raw else { return Ok(None) };
    let bytes = hex::decode(raw.trim()).context("ENCRYPTION_KEY no es hexadecimal válido")?;
    ensure!(
        bytes.len() == 32,
        "ENCRYPTION_KEY debe tener 32 bytes (64 caracteres hex)"
    );
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(Some(key))
}

/// Parámetros vacíos para consultas sin parámetros. `query_raw` es
/// genérico sobre el iterador de parámetros y `&[]` solo no se puede
/// inferir.
fn no_params() -> std::iter::Empty<&'static dyn postgres::types::ToSql> {
    std::iter::empty()
}

/// `TIMESTAMPTZ` (o `TIMESTAMP`, asumido UTC) → ISO 8601 canónico.
fn ts(row: &Row, i: usize) -> Result<Option<String>> {
    match row.try_get::<_, Option<DateTime<Utc>>>(i) {
        Ok(Some(dt)) => Ok(Some(dt.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string())),
        Ok(None) => Ok(None),
        Err(_) => match row.try_get::<_, Option<NaiveDateTime>>(i)? {
            Some(ndt) => Ok(Some(
                ndt.and_utc().format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string(),
            )),
            None => Ok(None),
        },
    }
}

/// Entero de PostgreSQL (`integer`) como `i64` de SQLite.
fn opt_i64(row: &Row, i: usize) -> Result<Option<i64>> {
    match row.try_get::<_, Option<i32>>(i) {
        Ok(v) => Ok(v.map(i64::from)),
        Err(_) => Ok(row.try_get::<_, Option<i64>>(i)?),
    }
}

fn req_i64(row: &Row, i: usize, table: &str, col: &str, id: i64) -> Result<i64> {
    opt_i64(row, i)?
        .with_context(|| format!("{table}.{col} es NULL en la fila {id} y el destino no lo admite"))
}

fn opt_text(row: &Row, i: usize) -> Result<Option<String>> {
    Ok(row.try_get::<_, Option<String>>(i)?)
}

fn req_text(row: &Row, i: usize, table: &str, col: &str, id: i64) -> Result<String> {
    opt_text(row, i)?
        .with_context(|| format!("{table}.{col} es NULL en la fila {id} y el destino no lo admite"))
}

fn opt_bool(row: &Row, i: usize) -> Result<Option<bool>> {
    Ok(row.try_get::<_, Option<bool>>(i)?)
}

fn opt_blob(row: &Row, i: usize) -> Result<Option<Vec<u8>>> {
    Ok(row.try_get::<_, Option<Vec<u8>>>(i)?)
}

/// Conteo de una tabla en PostgreSQL.
fn pg_count(client: &mut Client, table: &str) -> Result<i64> {
    let row = client.query_one(&format!("SELECT count(*) FROM \"{table}\""), &[])?;
    Ok(row.get(0))
}

/// Conteo de una tabla en SQLite.
fn sqlite_count(conn: &rusqlite::Connection, table: &str) -> Result<i64> {
    let sql = format!("SELECT count(*) FROM \"{table}\"");
    Ok(conn.query_row(&sql, [], |row| row.get(0))?)
}

/// Preflight sobre la base PostgreSQL de origen. Las mismas
/// comprobaciones que `check_sqlite`, salvo la integridad (PostgreSQL
/// no tiene `integrity_check`) y las claves foráneas, que PostgreSQL
/// impone al escribir: los huérfanos se detectan en
/// `broken_visitor_relations`.
pub fn preflight_postgres(client: &mut Client, key: Option<&[u8; 32]>) -> Result<PreflightReport> {
    let mut checks = Vec::new();
    checks.push(Check {
        name: "integrity",
        passed: true,
        skipped: true,
        detail: "origen PostgreSQL: sin integrity_check; conexión verificada".to_string(),
    });
    checks.push(Check {
        name: "foreign_keys",
        passed: true,
        skipped: true,
        detail: "PostgreSQL impone las FK al escribir; huérfanos en broken_visitor_relations"
            .to_string(),
    });

    let dup_visits: i64 = client
        .query_one(
            "SELECT count(*) FROM (SELECT visitor_cedula FROM \"Visits\" \
             WHERE status IN ('waiting', 'active', 'intermittent') \
             GROUP BY visitor_cedula HAVING count(*) > 1) t",
            &[],
        )?
        .get(0);
    checks.push(Check {
        name: "duplicate_open_visits",
        passed: dup_visits == 0,
        skipped: false,
        detail: format!("{dup_visits} identidades con visitas abiertas duplicadas"),
    });

    let dup_intervals: i64 = client
        .query_one(
            "SELECT count(*) FROM (SELECT visit_id FROM \"IntermittentLogs\" \
             WHERE re_entry IS NULL GROUP BY visit_id HAVING count(*) > 1) t",
            &[],
        )?
        .get(0);
    checks.push(Check {
        name: "duplicate_open_intervals",
        passed: dup_intervals == 0,
        skipped: false,
        detail: format!("{dup_intervals} visitas con intervalos abiertos duplicados"),
    });

    let broken: i64 = client
        .query_one(
            "SELECT count(*) FROM \"Visits\" v LEFT JOIN \"Visitors\" p \
             ON p.cedula = v.visitor_cedula \
             WHERE p.id IS NULL OR (v.visitor_id IS NOT NULL AND v.visitor_id <> p.id)",
            &[],
        )?
        .get(0);
    checks.push(Check {
        name: "broken_visitor_relations",
        passed: broken == 0,
        skipped: false,
        detail: format!("{broken} visitas con relaciones incompatibles"),
    });

    // El id de estas tablas es BOOLEAN en PostgreSQL (patrón de
    // singleton de Sequelize: `id BOOLEAN PRIMARY KEY DEFAULT true`);
    // en SQLite es INTEGER 1.
    let states: i64 = client
        .query_one(
            "SELECT count(*) FROM \"SearchIndexState\" WHERE id = true",
            &[],
        )?
        .get(0);
    let identity: i64 = client
        .query_one(
            "SELECT count(*) FROM \"IdentityIndexState\" WHERE id = true",
            &[],
        )?
        .get(0);
    checks.push(Check {
        name: "index_states",
        passed: states == 1 && identity == 1,
        skipped: false,
        detail: format!("SearchIndexState: {states}, IdentityIndexState: {identity}"),
    });

    let bad_tokens: i64 = client
        .query_one(
            "SELECT count(*) FROM \"VisitorSearchTokens\" WHERE octet_length(token) <> 32",
            &[],
        )?
        .get(0);
    checks.push(Check {
        name: "search_token_lengths",
        passed: bad_tokens == 0,
        skipped: false,
        detail: format!("{bad_tokens} tokens con longitud distinta de 32 bytes"),
    });

    match key {
        Some(key) => {
            let mut failed: Option<i64> = None;
            let mut checked = 0i64;
            for row in client.query(
                "SELECT id, first_name, last_name, encrypted_cedula, job_title, \
                 email, phone, observations FROM \"Visitors\" \
                 WHERE \"anonymizedAt\" IS NULL ORDER BY id",
                &[],
            )? {
                let id: i32 = row.get(0);
                checked += 1;
                let values: [Option<String>; 7] = [
                    row.try_get(1)?,
                    row.try_get(2)?,
                    row.try_get(3)?,
                    row.try_get(4)?,
                    row.try_get(5)?,
                    row.try_get(6)?,
                    row.try_get(7)?,
                ];
                for value in values.iter().flatten() {
                    if crypto::decrypt(key, value).is_err() {
                        failed = Some(i64::from(id));
                        break;
                    }
                }
                if failed.is_some() {
                    break;
                }
            }
            checks.push(Check {
                name: "decrypt_identities",
                passed: failed.is_none(),
                skipped: false,
                detail: match failed {
                    Some(id) => format!("identity decryption failed at visitor {id}"),
                    None => format!("{checked} perfiles no anonimizados descifrados"),
                },
            });
        }
        None => checks.push(Check {
            name: "decrypt_identities",
            passed: true,
            skipped: true,
            detail: "omitida: falta ENCRYPTION_KEY".to_string(),
        }),
    }

    Ok(PreflightReport { checks })
}

/// Preflight sobre una base SQLite ya convertida.
pub fn preflight_sqlite(path: &Path) -> Result<PreflightReport> {
    ensure!(path.exists(), "la base {} no existe", path.display());
    let key = load_key()?;
    let conn = rusqlite::Connection::open(path)
        .with_context(|| format!("abrir base {}", path.display()))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(check_sqlite(&conn, key.as_ref())?)
}

/// Preflight sobre la base PostgreSQL de origen (abre la conexión).
pub fn run_preflight_postgres(connstr: &str) -> Result<PreflightReport> {
    let key = load_key()?;
    let mut client = Client::connect(connstr, NoTls).context("conectar a PostgreSQL")?;
    preflight_postgres(&mut client, key.as_ref())
}

fn req_ts(row: &Row, i: usize, table: &str, col: &str, id: i64) -> Result<String> {
    ts(row, i)?
        .with_context(|| format!("{table}.{col} es NULL en la fila {id} y el destino no lo admite"))
}

/// Copia `Users` (sin cambios: el hash bcrypt/argon2 viaja tal cual;
/// la verificación de contraseñas es de la fase 3).
fn copy_users(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let sql = "SELECT id, username, email, \"tokenVersion\", password, role::text, \
        \"resetToken\", \"resetTokenExpiry\", \"createdAt\", \"updatedAt\", \
        \"mustChangePassword\", \"passwordChangedAt\", \"loginAttempts\", \"lockedUntil\" \
        FROM \"Users\" ORDER BY id";
    let mut rows = client.query_raw(sql, no_params())?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "Users", "id", -1)?;
        tx.execute(
            "INSERT INTO \"Users\"(id, username, email, \"tokenVersion\", password, role, \
             \"resetToken\", \"resetTokenExpiry\", \"createdAt\", \"updatedAt\", \
             \"mustChangePassword\", \"passwordChangedAt\", \"loginAttempts\", \"lockedUntil\") \
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                id,
                req_text(&row, 1, "Users", "username", id)?,
                opt_text(&row, 2)?,
                opt_i64(&row, 3)?.unwrap_or(0),
                req_text(&row, 4, "Users", "password", id)?,
                opt_text(&row, 5)?.unwrap_or_else(|| "operador".to_string()),
                opt_text(&row, 6)?,
                ts(&row, 7)?,
                req_ts(&row, 8, "Users", "createdAt", id)?,
                req_ts(&row, 9, "Users", "updatedAt", id)?,
                opt_bool(&row, 10)?.map(|b| b as i64),
                ts(&row, 11)?,
                opt_i64(&row, 12)?.unwrap_or(0),
                ts(&row, 13)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_departments(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let mut rows = client.query_raw(
        "SELECT id, name, code, \"isActive\", \"createdAt\" FROM \"Departments\" ORDER BY id",
        no_params(),
    )?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "Departments", "id", -1)?;
        tx.execute(
            "INSERT INTO \"Departments\"(id, name, code, \"isActive\", \"createdAt\") \
             VALUES(?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                id,
                req_text(&row, 1, "Departments", "name", id)?,
                opt_text(&row, 2)?,
                opt_bool(&row, 3)?.map(|b| b as i64),
                ts(&row, 4)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_visit_purposes(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let mut rows = client.query_raw(
        "SELECT id, name, \"isActive\", \"createdAt\" FROM \"VisitPurposes\" ORDER BY id",
        no_params(),
    )?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "VisitPurposes", "id", -1)?;
        tx.execute(
            "INSERT INTO \"VisitPurposes\"(id, name, \"isActive\", \"createdAt\") \
             VALUES(?1, ?2, ?3, ?4)",
            rusqlite::params![
                id,
                req_text(&row, 1, "VisitPurposes", "name", id)?,
                opt_bool(&row, 2)?.map(|b| b as i64),
                ts(&row, 3)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_visitors(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let sql = "SELECT id, \"anonymizedAt\", cedula, encrypted_cedula, first_name, \
        last_name, company, job_title, photo_url, id_photo_url, email, phone, \
        \"updatedAt\", photo_data, id_photo_data, \"isBlocked\", observations, \"createdAt\" \
        FROM \"Visitors\" ORDER BY id";
    let mut rows = client.query_raw(sql, no_params())?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "Visitors", "id", -1)?;
        tx.execute(
            "INSERT INTO \"Visitors\"(id, \"anonymizedAt\", cedula, encrypted_cedula, \
             first_name, last_name, company, job_title, photo_url, id_photo_url, email, \
             phone, \"updatedAt\", photo_data, id_photo_data, \"isBlocked\", observations, \
             \"createdAt\") VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, \
             ?14, ?15, ?16, ?17, ?18)",
            rusqlite::params![
                id,
                ts(&row, 1)?,
                req_text(&row, 2, "Visitors", "cedula", id)?,
                opt_text(&row, 3)?,
                req_text(&row, 4, "Visitors", "first_name", id)?,
                req_text(&row, 5, "Visitors", "last_name", id)?,
                req_text(&row, 6, "Visitors", "company", id)?,
                opt_text(&row, 7)?,
                opt_text(&row, 8)?,
                opt_text(&row, 9)?,
                opt_text(&row, 10)?,
                opt_text(&row, 11)?,
                req_ts(&row, 12, "Visitors", "updatedAt", id)?,
                opt_blob(&row, 13)?,
                opt_blob(&row, 14)?,
                opt_bool(&row, 15)?.map(|b| b as i64),
                opt_text(&row, 16)?,
                req_ts(&row, 17, "Visitors", "createdAt", id)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_visits(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let sql = "SELECT id, visitor_cedula, purpose, person_to_visit, check_in_time, \
        check_out_time, status::text, notes, companion_name, companion_cedula, \
        vehicle_brand, vehicle_model, vehicle_plate, area, action::text, department, \
        \"createdAt\", \"updatedAt\", visitor_id, arrival_time, entry_time, exit_time, \
        target_department, host_person, consent_policy_version, consent_accepted_at, \
        consent_recorded_by, cancellation_reason \
        FROM \"Visits\" ORDER BY id";
    let mut rows = client.query_raw(sql, no_params())?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "Visits", "id", -1)?;
        tx.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, purpose, person_to_visit, \
             check_in_time, check_out_time, status, notes, companion_name, \
             companion_cedula, vehicle_brand, vehicle_model, vehicle_plate, area, \
             action, department, \"createdAt\", \"updatedAt\", visitor_id, arrival_time, \
             entry_time, exit_time, target_department, host_person, \
             consent_policy_version, consent_accepted_at, consent_recorded_by, \
             cancellation_reason) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, \
             ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, \
             ?27, ?28)",
            rusqlite::params![
                id,
                req_text(&row, 1, "Visits", "visitor_cedula", id)?,
                req_text(&row, 2, "Visits", "purpose", id)?,
                req_text(&row, 3, "Visits", "person_to_visit", id)?,
                ts(&row, 4)?,
                ts(&row, 5)?,
                opt_text(&row, 6)?.unwrap_or_else(|| "active".to_string()),
                opt_text(&row, 7)?,
                opt_text(&row, 8)?,
                opt_text(&row, 9)?,
                opt_text(&row, 10)?,
                opt_text(&row, 11)?,
                opt_text(&row, 12)?,
                opt_text(&row, 13)?,
                opt_text(&row, 14)?.unwrap_or_else(|| "Ninguna".to_string()),
                opt_text(&row, 15)?,
                req_ts(&row, 16, "Visits", "createdAt", id)?,
                req_ts(&row, 17, "Visits", "updatedAt", id)?,
                opt_i64(&row, 18)?,
                ts(&row, 19)?,
                ts(&row, 20)?,
                ts(&row, 21)?,
                opt_text(&row, 22)?,
                opt_text(&row, 23)?,
                opt_text(&row, 24)?,
                ts(&row, 25)?,
                opt_i64(&row, 26)?,
                opt_text(&row, 27)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_intermittent_logs(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let sql = "SELECT id, visit_id, check_out, re_entry, notes, \"createdAt\", \
        \"updatedAt\", registered_by, reentered_by FROM \"IntermittentLogs\" ORDER BY id";
    let mut rows = client.query_raw(sql, no_params())?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "IntermittentLogs", "id", -1)?;
        tx.execute(
            "INSERT INTO \"IntermittentLogs\"(id, visit_id, check_out, re_entry, notes, \
             \"createdAt\", \"updatedAt\", registered_by, reentered_by) \
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                id,
                req_i64(&row, 1, "IntermittentLogs", "visit_id", id)?,
                req_ts(&row, 2, "IntermittentLogs", "check_out", id)?,
                ts(&row, 3)?,
                opt_text(&row, 4)?,
                req_ts(&row, 5, "IntermittentLogs", "createdAt", id)?,
                req_ts(&row, 6, "IntermittentLogs", "updatedAt", id)?,
                opt_text(&row, 7)?,
                opt_text(&row, 8)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_edit_histories(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let sql = "SELECT id, \"visitId\", \"visitorId\", field, \"oldValue\", \"newValue\", \
        \"editedBy\", \"editedByUsername\", \"editedAt\", \"createdAt\" \
        FROM \"VisitorEditHistories\" ORDER BY id";
    let mut rows = client.query_raw(sql, no_params())?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "VisitorEditHistories", "id", -1)?;
        tx.execute(
            "INSERT INTO \"VisitorEditHistories\"(id, \"visitId\", \"visitorId\", field, \
             \"oldValue\", \"newValue\", \"editedBy\", \"editedByUsername\", \"editedAt\", \
             \"createdAt\") VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                id,
                opt_i64(&row, 1)?,
                req_i64(&row, 2, "VisitorEditHistories", "visitorId", id)?,
                req_text(&row, 3, "VisitorEditHistories", "field", id)?,
                opt_text(&row, 4)?,
                opt_text(&row, 5)?,
                req_i64(&row, 6, "VisitorEditHistories", "editedBy", id)?,
                req_text(&row, 7, "VisitorEditHistories", "editedByUsername", id)?,
                req_ts(&row, 8, "VisitorEditHistories", "editedAt", id)?,
                req_ts(&row, 9, "VisitorEditHistories", "createdAt", id)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_activity_logs(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let sql = "SELECT id, \"userId\", username, action, entity, \"entityId\", details, \
        \"ipAddress\", \"userAgent\", \"createdAt\", method, path, \"statusCode\", duration, \
        severity, role, resource, \"resourceId\", status FROM \"ActivityLogs\" ORDER BY id";
    let mut rows = client.query_raw(sql, no_params())?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "ActivityLogs", "id", -1)?;
        tx.execute(
            "INSERT INTO \"ActivityLogs\"(id, \"userId\", username, action, entity, \
             \"entityId\", details, \"ipAddress\", \"userAgent\", \"createdAt\", method, path, \
             \"statusCode\", duration, severity, role, resource, \"resourceId\", status) \
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, \
             ?17, ?18, ?19)",
            rusqlite::params![
                id,
                req_i64(&row, 1, "ActivityLogs", "userId", id)?,
                req_text(&row, 2, "ActivityLogs", "username", id)?,
                req_text(&row, 3, "ActivityLogs", "action", id)?,
                req_text(&row, 4, "ActivityLogs", "entity", id)?,
                req_text(&row, 5, "ActivityLogs", "entityId", id)?,
                opt_text(&row, 6)?,
                opt_text(&row, 7)?,
                opt_text(&row, 8)?,
                ts(&row, 9)?,
                opt_text(&row, 10)?,
                opt_text(&row, 11)?,
                opt_i64(&row, 12)?,
                opt_i64(&row, 13)?,
                opt_text(&row, 14)?.unwrap_or_else(|| "low".to_string()),
                opt_text(&row, 15)?,
                opt_text(&row, 16)?,
                opt_i64(&row, 17)?,
                opt_text(&row, 18)?.unwrap_or_else(|| "success".to_string()),
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_arco_requests(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let sql = "SELECT id, \"requestType\"::text, \"subjectCedulaHash\", \
        \"subjectCedulaEncrypted\", \"requestedByName\", \"requestedByUserId\", \
        \"contactEmail\", reason, \"requestPayload\", status::text, \"resolutionNotes\", \
        \"resolvedAt\", \"createdAt\", \"updatedAt\" FROM \"ArcoRequests\" ORDER BY id";
    let mut rows = client.query_raw(sql, no_params())?;
    while let Some(row) = rows.next()? {
        let id = req_i64(&row, 0, "ArcoRequests", "id", -1)?;
        tx.execute(
            "INSERT INTO \"ArcoRequests\"(id, \"requestType\", \"subjectCedulaHash\", \
             \"subjectCedulaEncrypted\", \"requestedByName\", \"requestedByUserId\", \
             \"contactEmail\", reason, \"requestPayload\", status, \"resolutionNotes\", \
             \"resolvedAt\", \"createdAt\", \"updatedAt\") \
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                id,
                req_text(&row, 1, "ArcoRequests", "requestType", id)?,
                req_text(&row, 2, "ArcoRequests", "subjectCedulaHash", id)?,
                opt_text(&row, 3)?,
                req_text(&row, 4, "ArcoRequests", "requestedByName", id)?,
                opt_i64(&row, 5)?,
                opt_text(&row, 6)?,
                opt_text(&row, 7)?,
                opt_text(&row, 8)?,
                opt_text(&row, 9)?.unwrap_or_else(|| "pending".to_string()),
                opt_text(&row, 10)?,
                ts(&row, 11)?,
                ts(&row, 12)?,
                ts(&row, 13)?,
            ],
        )?;
        n += 1;
    }
    Ok(n)
}

fn copy_search_tokens(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let mut n = 0u64;
    let mut rows = client.query_raw(
        "SELECT visitor_id, token FROM \"VisitorSearchTokens\" ORDER BY visitor_id",
        no_params(),
    )?;
    while let Some(row) = rows.next()? {
        let visitor_id = req_i64(&row, 0, "VisitorSearchTokens", "visitor_id", -1)?;
        let token: Vec<u8> = row.try_get(1)?;
        tx.execute(
            "INSERT INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES(?1, ?2)",
            rusqlite::params![visitor_id, token],
        )?;
        n += 1;
    }
    Ok(n)
}

/// Los estados de índice ya existen (los siembran las migraciones):
/// se actualizan, no se insertan. El id es BOOLEAN en PostgreSQL y
/// INTEGER 1 en SQLite.
fn copy_search_state(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let row = client.query_one(
        "SELECT id, fingerprint, cursor, ready FROM \"SearchIndexState\" WHERE id = true",
        &[],
    )?;
    let singleton: bool = row.try_get(0)?;
    ensure!(singleton, "SearchIndexState sin fila singleton");
    let id = 1i64;
    let updated = tx.execute(
        "UPDATE \"SearchIndexState\" SET fingerprint = ?2, cursor = ?3, ready = ?4 WHERE id = ?1",
        rusqlite::params![
            id,
            req_text(&row, 1, "SearchIndexState", "fingerprint", id)?,
            req_i64(&row, 2, "SearchIndexState", "cursor", id)?,
            {
                let ready: bool = row.try_get(3)?;
                ready as i64
            },
        ],
    )?;
    ensure!(
        updated == 1,
        "SearchIndexState id=1 no existe en el destino"
    );
    Ok(1)
}

fn copy_identity_state(client: &mut Client, tx: &Transaction) -> Result<u64> {
    let row = client.query_one(
        "SELECT id, fingerprint, ready FROM \"IdentityIndexState\" WHERE id = true",
        &[],
    )?;
    let singleton: bool = row.try_get(0)?;
    ensure!(singleton, "IdentityIndexState sin fila singleton");
    let id = 1i64;
    let updated = tx.execute(
        "UPDATE \"IdentityIndexState\" SET fingerprint = ?2, ready = ?3 WHERE id = ?1",
        rusqlite::params![
            id,
            req_text(&row, 1, "IdentityIndexState", "fingerprint", id)?,
            {
                let ready: bool = row.try_get(2)?;
                ready as i64
            },
        ],
    )?;
    ensure!(
        updated == 1,
        "IdentityIndexState id=1 no existe en el destino"
    );
    Ok(1)
}

/// Borra el destino parcial (base, WAL y SHM).
fn remove_destination(to: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let path = PathBuf::from(format!("{}{suffix}", to.display()));
        let _ = std::fs::remove_file(path);
    }
}

/// Ejecuta la conversión completa: preflight del origen, copia en una
/// transacción, verificación de conteos y preflight del destino.
pub fn run_convert(from: &str, to: &Path) -> Result<ConvertReport> {
    for suffix in ["", "-wal", "-shm"] {
        let path = PathBuf::from(format!("{}{suffix}", to.display()));
        ensure!(
            !path.exists(),
            "el destino {} ya existe; convert no sobrescribe (bórralo a mano si es un resto)",
            path.display()
        );
    }
    let key = load_key()?;
    let mut client = Client::connect(from, NoTls).context("conectar a PostgreSQL")?;

    // 1. Preflight del origen: si falla, no se crea nada.
    let origin = preflight_postgres(&mut client, key.as_ref())?;
    if !origin.all_passed() {
        print_report(&origin);
        bail!("preflight del origen con fallos; conversión cancelada antes de copiar");
    }

    // 2. Copia en una transacción; cualquier error revierte y borra el parcial.
    let result = (|| -> Result<ConvertReport> {
        let store = Store::open(to)?;
        store.migrate()?;
        let counts = store.tx_immediate(|tx| {
            let counts: Vec<(String, u64)> = vec![
                ("Users".into(), copy_users(&mut client, tx)?),
                ("Departments".into(), copy_departments(&mut client, tx)?),
                (
                    "VisitPurposes".into(),
                    copy_visit_purposes(&mut client, tx)?,
                ),
                ("Visitors".into(), copy_visitors(&mut client, tx)?),
                ("Visits".into(), copy_visits(&mut client, tx)?),
                (
                    "IntermittentLogs".into(),
                    copy_intermittent_logs(&mut client, tx)?,
                ),
                (
                    "VisitorEditHistories".into(),
                    copy_edit_histories(&mut client, tx)?,
                ),
                ("ActivityLogs".into(), copy_activity_logs(&mut client, tx)?),
                ("ArcoRequests".into(), copy_arco_requests(&mut client, tx)?),
                (
                    "VisitorSearchTokens".into(),
                    copy_search_tokens(&mut client, tx)?,
                ),
                (
                    "SearchIndexState".into(),
                    copy_search_state(&mut client, tx)?,
                ),
                (
                    "IdentityIndexState".into(),
                    copy_identity_state(&mut client, tx)?,
                ),
            ];
            Ok(counts)
        })?;

        // 3. Verificación: conteos de origen y destino coinciden.
        for (table, copied) in &counts {
            let pg = pg_count(&mut client, table)?;
            ensure!(
                pg as u64 == *copied,
                "conteo de {table}: origen {pg}, copiadas {copied}"
            );
            let sq = store.read(|conn| sqlite_count(conn, table))?;
            ensure!(
                sq as u64 == *copied,
                "conteo de {table}: destino {sq}, copiadas {copied}"
            );
        }
        ensure!(
            counts.iter().map(|(_, n)| n).sum::<u64>() > 0,
            "la base de origen está vacía; nada que convertir"
        );

        // 4. Preflight del destino.
        let preflight = store.read(|conn| Ok(check_sqlite(conn, key.as_ref())?))?;
        if !preflight.all_passed() {
            print_report(&preflight);
            bail!("preflight del destino con fallos; conversión cancelada");
        }
        Ok(ConvertReport { counts, preflight })
    })();

    match result {
        Ok(report) => Ok(report),
        Err(e) => {
            remove_destination(to);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ENV_LOCK;

    // Las pruebas de variables de entorno comparten el proceso: se
    // serializan con el candado compartido de `config.rs`.

    fn with_env(vars: &[(&str, Option<&str>)], f: impl FnOnce()) {
        let _guard = ENV_LOCK.lock().unwrap();
        let saved: Vec<(String, Option<String>)> = vars
            .iter()
            .map(|(k, _)| (k.to_string(), std::env::var(k).ok()))
            .collect();
        for (k, v) in vars {
            match v {
                Some(value) => std::env::set_var(k, value),
                None => std::env::remove_var(k),
            }
        }
        f();
        for (k, v) in saved {
            match v {
                Some(value) => std::env::set_var(k, value),
                None => std::env::remove_var(k),
            }
        }
    }

    #[test]
    fn load_key_cases() {
        // Sin variables: None.
        with_env(
            &[("ENCRYPTION_KEY", None), ("PII_ENCRYPTION_KEY", None)],
            || assert!(load_key().unwrap().is_none()),
        );
        // Clave válida de 32 bytes.
        with_env(
            &[
                ("ENCRYPTION_KEY", Some(&"ab".repeat(32))),
                ("PII_ENCRYPTION_KEY", None),
            ],
            || {
                let key = load_key().unwrap().unwrap();
                assert_eq!(key, [0xab; 32]);
            },
        );
        // Alias PII_ENCRYPTION_KEY y preferencia por ENCRYPTION_KEY.
        with_env(
            &[
                ("ENCRYPTION_KEY", None),
                ("PII_ENCRYPTION_KEY", Some(&"01".repeat(32))),
            ],
            || assert_eq!(load_key().unwrap().unwrap(), [0x01; 32]),
        );
        with_env(
            &[
                ("ENCRYPTION_KEY", Some(&"02".repeat(32))),
                ("PII_ENCRYPTION_KEY", Some(&"01".repeat(32))),
            ],
            || assert_eq!(load_key().unwrap().unwrap(), [0x02; 32]),
        );
        // Hex inválido y longitud incorrecta fallan.
        with_env(
            &[("ENCRYPTION_KEY", Some("zz")), ("PII_ENCRYPTION_KEY", None)],
            || assert!(load_key().is_err()),
        );
        with_env(
            &[
                ("ENCRYPTION_KEY", Some("abcd")),
                ("PII_ENCRYPTION_KEY", None),
            ],
            || assert!(load_key().is_err()),
        );
    }
}
