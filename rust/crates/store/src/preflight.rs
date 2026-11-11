//! Preflight sobre la base SQLite: las mismas comprobaciones que Go
//! hace sobre PostgreSQL antes de adoptar una copia (`db/preflight.go`),
//! más la integridad propia de SQLite.
//!
//! - Descifrado de identidades (requiere la clave de 32 bytes; sin
//!   clave la comprobación queda marcada como omitida, no como fallo).
//! - Visitas abiertas duplicadas por identidad (debe dar cero).
//! - Relaciones visita–visitante rotas (misma consulta de Go).
//! - Intervalos abiertos duplicados por visita (debe dar cero).
//! - Integridad (`PRAGMA integrity_check`) y claves foráneas
//!   (`PRAGMA foreign_key_check`).
//! - Estados de índice presentes y tokens de búsqueda de 32 bytes.
//!
//! No se registra ningún dato personal en los detalles: como en Go,
//! solo el id del visitante que falla.

use rusqlite::Connection;

use crate::crypto;

/// Una comprobación de preflight.
#[derive(Debug, Clone)]
pub struct Check {
    /// Nombre corto y estable de la comprobación.
    pub name: &'static str,
    /// ¿Pasó? Las omitidas (`skipped`) no cuentan como fallo.
    pub passed: bool,
    /// ¿No se pudo ejecutar (falta la clave, por ejemplo)?
    pub skipped: bool,
    /// Detalle sin datos personales.
    pub detail: String,
}

/// Informe completo de preflight.
#[derive(Debug, Clone)]
pub struct PreflightReport {
    pub checks: Vec<Check>,
}

impl PreflightReport {
    /// ¿Pasaron todas las comprobaciones ejecutadas?
    pub fn all_passed(&self) -> bool {
        self.checks.iter().all(|c| c.passed || c.skipped)
    }

    /// Comprobaciones que fallaron (sin contar las omitidas).
    pub fn failures(&self) -> Vec<&Check> {
        self.checks
            .iter()
            .filter(|c| !c.passed && !c.skipped)
            .collect()
    }
}

fn count(conn: &Connection, sql: &str) -> Result<i64, rusqlite::Error> {
    conn.query_row(sql, [], |row| row.get(0))
}

/// Ejecuta todas las comprobaciones sobre una conexión SQLite abierta
/// (con `foreign_keys = ON`). `key` es la clave de datos de 32 bytes;
/// sin ella, la comprobación de descifrado queda omitida.
pub fn check_sqlite(
    conn: &Connection,
    key: Option<&[u8; 32]>,
) -> Result<PreflightReport, rusqlite::Error> {
    let mut checks = Vec::new();

    // Integridad del archivo.
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    checks.push(Check {
        name: "integrity",
        passed: integrity == "ok",
        skipped: false,
        detail: format!("integrity_check: {integrity}"),
    });

    // Claves foráneas rotas.
    let broken_fk = count(conn, "SELECT count(*) FROM pragma_foreign_key_check")?;
    checks.push(Check {
        name: "foreign_keys",
        passed: broken_fk == 0,
        skipped: false,
        detail: format!("{broken_fk} filas con claves foráneas rotas"),
    });

    // Visitas abiertas duplicadas por identidad (misma consulta de Go).
    let dup_visits = count(
        conn,
        "SELECT count(*) FROM (SELECT visitor_cedula FROM \"Visits\" \
         WHERE status IN ('waiting', 'active', 'intermittent') \
         GROUP BY visitor_cedula HAVING count(*) > 1)",
    )?;
    checks.push(Check {
        name: "duplicate_open_visits",
        passed: dup_visits == 0,
        skipped: false,
        detail: format!("{dup_visits} identidades con visitas abiertas duplicadas"),
    });

    // Intervalos abiertos duplicados por visita.
    let dup_intervals = count(
        conn,
        "SELECT count(*) FROM (SELECT visit_id FROM \"IntermittentLogs\" \
         WHERE re_entry IS NULL GROUP BY visit_id HAVING count(*) > 1)",
    )?;
    checks.push(Check {
        name: "duplicate_open_intervals",
        passed: dup_intervals == 0,
        skipped: false,
        detail: format!("{dup_intervals} visitas con intervalos abiertos duplicados"),
    });

    // Relaciones visita–visitante rotas (misma consulta de Go).
    let broken = count(
        conn,
        "SELECT count(*) FROM \"Visits\" v LEFT JOIN \"Visitors\" p \
         ON p.cedula = v.visitor_cedula \
         WHERE p.id IS NULL OR (v.visitor_id IS NOT NULL AND v.visitor_id <> p.id)",
    )?;
    checks.push(Check {
        name: "broken_visitor_relations",
        passed: broken == 0,
        skipped: false,
        detail: format!("{broken} visitas con relaciones incompatibles"),
    });

    // Estados de índice presentes.
    let states: i64 = count(
        conn,
        "SELECT count(*) FROM \"SearchIndexState\" WHERE id = 1",
    )?;
    let identity: i64 = count(
        conn,
        "SELECT count(*) FROM \"IdentityIndexState\" WHERE id = 1",
    )?;
    checks.push(Check {
        name: "index_states",
        passed: states == 1 && identity == 1,
        skipped: false,
        detail: format!("SearchIndexState: {states}, IdentityIndexState: {identity}"),
    });

    // Tokens de búsqueda con longitud distinta de 32 bytes.
    let bad_tokens = count(
        conn,
        "SELECT count(*) FROM \"VisitorSearchTokens\" WHERE length(token) <> 32",
    )?;
    checks.push(Check {
        name: "search_token_lengths",
        passed: bad_tokens == 0,
        skipped: false,
        detail: format!("{bad_tokens} tokens con longitud distinta de 32 bytes"),
    });

    // Descifrado de identidades, como `Preflight` de Go.
    match key {
        Some(key) => {
            let mut stmt = conn.prepare(
                "SELECT id, first_name, last_name, encrypted_cedula, job_title, \
                 email, phone, observations FROM \"Visitors\" \
                 WHERE \"anonymizedAt\" IS NULL",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            })?;
            let mut failed: Option<i64> = None;
            let mut checked = 0i64;
            for row in rows {
                let (id, first, last, cedula, job, email, phone, observations) = row?;
                checked += 1;
                let values = [
                    first.as_str(),
                    last.as_str(),
                    cedula.as_deref().unwrap_or(""),
                    job.as_deref().unwrap_or(""),
                    email.as_deref().unwrap_or(""),
                    phone.as_deref().unwrap_or(""),
                    observations.as_deref().unwrap_or(""),
                ];
                for value in values {
                    if crypto::decrypt(key, value).is_err() {
                        failed = Some(id);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;

    fn seeded() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::apply(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn clean_database_passes() {
        let conn = seeded();
        let report = check_sqlite(&conn, None).unwrap();
        assert!(report.all_passed());
        assert!(report.failures().is_empty());
        // Sin clave, el descifrado queda omitido, no fallido.
        let decrypt = report
            .checks
            .iter()
            .find(|c| c.name == "decrypt_identities")
            .unwrap();
        assert!(decrypt.skipped);
    }

    #[test]
    fn duplicate_open_visits_fail() {
        let conn = seeded();
        // El índice parcial impide insertar el duplicado; para probar
        // la comprobación, se inserta con el índice desactivado no es
        // posible: se verifica que el conteo detecta el caso cuando la
        // base ya lo trae (simulado borrando el índice en una copia).
        conn.execute("DROP INDEX visits_one_open_per_visitor", [])
            .unwrap();
        conn.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
             VALUES(1, 'hash-a', 1, 'Reunión', 'Anfitrión', 'waiting', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
             VALUES(2, 'hash-a', 1, 'Reunión', 'Anfitrión', 'active', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        let report = check_sqlite(&conn, None).unwrap();
        assert!(!report.all_passed());
        let check = report
            .checks
            .iter()
            .find(|c| c.name == "duplicate_open_visits")
            .unwrap();
        assert!(!check.passed);
        assert!(check.detail.contains('1'));
    }

    #[test]
    fn broken_relation_fails() {
        let conn = seeded();
        conn.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
             VALUES(1, 'hash-inexistente', NULL, 'Reunión', 'Anfitrión', 'completed', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        let report = check_sqlite(&conn, None).unwrap();
        let check = report
            .checks
            .iter()
            .find(|c| c.name == "broken_visitor_relations")
            .unwrap();
        assert!(!check.passed);
    }
}
