//! Migraciones del esquema SQLite, aplicadas al arrancar.
//!
//! Correspondencia con las migraciones Goose de PostgreSQL
//! (`server-go/db/migrations/`, corte b760bc8):
//!
//! | rusqlite | Goose | Contenido |
//! |---:|---|---|
//! | 1 | — | Infraestructura de la fase 1: tabla `app_meta`. Sin cambios. |
//! | 2 | 00001 | Línea base: todas las tablas, claves, índices y la restricción de una visita abierta por identidad. |
//! | 3 | 00002 | Consentimiento separado, propósito TEXT y regla de un intervalo abierto por visita. |
//! | 4 | 00003 | Trigramas protegidos, estado del índice y índice temporal de visitas. |
//! | 5 | 00004 | Índices de estado y fecha para consultas. |
//! | 6 | 00005 | Estado de la identidad protegida. |
//! | 7 | 00006 | Estado `cancelled` y motivo de cancelación de visita. |
//!
//! La numeración rusqlite no es la de Goose porque la migración 1 ya
//! estaba aplicada en bases creadas por la fase 1 y no se reescribe la
//! historia: se añade, no se modifica. La versión aplicada se deriva de
//! las migraciones incorporadas al binario, como hoy la deriva Goose.
//!
//! Reglas de traducción (documento, sección 10):
//! - `TIMESTAMPTZ` y `TIMESTAMP` → `TEXT` en UTC ISO 8601 canónico
//!   (`%Y-%m-%dT%H:%M:%S%.6fZ`, 27 caracteres, ordenable como texto).
//!   Los valores por defecto usan la misma forma:
//!   `strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z'`.
//! - `BYTEA` → `BLOB`; `BOOLEAN` → `INTEGER` 0/1; `SERIAL` →
//!   `INTEGER PRIMARY KEY` (sin `AUTOINCREMENT`: el siguiente id es
//!   max(id)+1, igual que un serial para este uso, y los ids explícitos
//!   de la conversión se conservan).
//! - Enums de PostgreSQL → `TEXT` con `CHECK ... IN (...)`.
//! - `SequelizeMeta` y `goose_db_version` no se crean: su papel lo
//!   cumple la tabla de migraciones de `rusqlite_migration`; los
//!   metadatos históricos quedan solo en la copia de origen.
//!
//! Desviaciones deliberadas, documentadas aquí y no en silencio:
//! 1. `Visits.status` incluye `'cancelled'` en el `CHECK` desde la
//!    migración 2, aunque Goose lo añade en la 00006. SQLite no puede
//!    ampliar un `CHECK` con `ALTER TABLE` (solo reconstruir la tabla),
//!    así que el conjunto final del enum se declara al crear la tabla
//!    y la migración 7 solo añade `cancellation_reason`.
//! 2. `Visits.purpose` ya es `TEXT` desde la migración 2: en SQLite
//!    `varchar(255)` y `TEXT` son el mismo tipo, así que el `ALTER
//!    COLUMN ... TYPE TEXT` de la 00002 no tiene efecto aquí.
//! 3. El bloque `DO` de la 00002 que rechaza intervalos abiertos
//!    duplicados no es expresable en una migración SQLite: lo
//!    comprueban `convert` y `preflight`, y el índice único parcial
//!    lo impide a partir de ahora.
//! 4. `idx_visitors_cedula_unique` de PostgreSQL no se crea: duplica
//!    la restricción `UNIQUE` de la columna `cedula`.

use anyhow::Result;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

/// Número de migraciones definidas (la versión esperada del esquema).
pub const MIGRATION_COUNT: usize = 7;

/// Todas las migraciones, en orden. `rusqlite_migration` guarda la
/// versión aplicada en su propia tabla y las aplica transaccionalmente.
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        // 1 · Infraestructura de la fase 1, sin tocar.
        M::up(
            "CREATE TABLE IF NOT EXISTS app_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO app_meta (key, value)
        VALUES ('schema_origin', 'logmaster-rust');",
        ),
        // 2 · Goose 00001: línea base.
        M::up(BASELINE_SCHEMA),
        // 3 · Goose 00002: consentimiento e intervalo abierto único.
        M::up(
            "ALTER TABLE \"Visits\" ADD COLUMN consent_policy_version TEXT;
        ALTER TABLE \"Visits\" ADD COLUMN consent_accepted_at TEXT;
        ALTER TABLE \"Visits\" ADD COLUMN consent_recorded_by INTEGER;
        ALTER TABLE \"IntermittentLogs\" ADD COLUMN reentered_by TEXT;
        CREATE UNIQUE INDEX intermittent_one_open_per_visit
            ON \"IntermittentLogs\"(visit_id) WHERE re_entry IS NULL;",
        ),
        // 4 · Goose 00003: búsqueda protegida por trigramas.
        M::up(
            "CREATE TABLE \"VisitorSearchTokens\" (
            visitor_id INTEGER NOT NULL REFERENCES \"Visitors\"(id) ON DELETE CASCADE,
            token BLOB NOT NULL CHECK(length(token) = 32),
            PRIMARY KEY(visitor_id, token)
        );
        CREATE INDEX visitor_search_token_lookup
            ON \"VisitorSearchTokens\"(token, visitor_id);
        CREATE TABLE \"SearchIndexState\" (
            id INTEGER PRIMARY KEY CHECK(id = 1) DEFAULT 1,
            fingerprint TEXT NOT NULL DEFAULT '',
            cursor INTEGER NOT NULL DEFAULT 0,
            ready INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO \"SearchIndexState\"(id) VALUES(1);
        CREATE INDEX visits_time_id ON \"Visits\"(check_in_time DESC, id DESC);",
        ),
        // 5 · Goose 00004: índices de estado y fecha.
        M::up(
            "CREATE INDEX visits_status_time_id
            ON \"Visits\"(status, check_in_time DESC, id DESC);
        CREATE INDEX visits_open_status_time
            ON \"Visits\"(status, check_in_time, id) WHERE check_out_time IS NULL;",
        ),
        // 6 · Goose 00005: estado de la identidad protegida.
        M::up(
            "CREATE TABLE \"IdentityIndexState\" (
            id INTEGER PRIMARY KEY CHECK(id = 1) DEFAULT 1,
            fingerprint TEXT NOT NULL DEFAULT '',
            ready INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO \"IdentityIndexState\"(id) VALUES(1);",
        ),
        // 7 · Goose 00006: cancelación de visita en espera.
        // El valor 'cancelled' ya está en el CHECK de Visits.status
        // desde la migración 2 (ver desviación 1 arriba).
        M::up("ALTER TABLE \"Visits\" ADD COLUMN cancellation_reason TEXT;"),
    ])
}

/// Aplica las migraciones pendientes.
pub fn apply(conn: &mut Connection) -> Result<()> {
    migrations().to_latest(conn)?;
    Ok(())
}

/// Esquema de la línea base (Goose 00001), traducido a SQLite.
///
/// La nulabilidad y los valores por defecto reproducen el esquema de
/// PostgreSQL columna a columna; los tipos siguen la tabla de la
/// sección 10 del documento de migración.
const BASELINE_SCHEMA: &str = "
CREATE TABLE \"Users\" (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    \"tokenVersion\" INTEGER NOT NULL DEFAULT 0,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('root', 'admin', 'operador', 'auditor', 'demo')) DEFAULT 'operador',
    \"resetToken\" TEXT,
    \"resetTokenExpiry\" TEXT,
    \"createdAt\" TEXT NOT NULL,
    \"updatedAt\" TEXT NOT NULL,
    \"mustChangePassword\" INTEGER DEFAULT 1,
    \"passwordChangedAt\" TEXT,
    \"loginAttempts\" INTEGER DEFAULT 0,
    \"lockedUntil\" TEXT
);

CREATE TABLE \"Visitors\" (
    id INTEGER PRIMARY KEY,
    \"anonymizedAt\" TEXT,
    cedula TEXT NOT NULL UNIQUE,
    encrypted_cedula TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    company TEXT NOT NULL,
    job_title TEXT,
    photo_url TEXT,
    id_photo_url TEXT,
    email TEXT,
    phone TEXT,
    \"updatedAt\" TEXT NOT NULL,
    photo_data BLOB,
    id_photo_data BLOB,
    \"isBlocked\" INTEGER DEFAULT 0,
    observations TEXT,
    \"createdAt\" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z')
);

CREATE TABLE \"Visits\" (
    id INTEGER PRIMARY KEY,
    visitor_cedula TEXT NOT NULL,
    purpose TEXT NOT NULL,
    person_to_visit TEXT NOT NULL,
    check_in_time TEXT,
    check_out_time TEXT,
    status TEXT CHECK(status IN ('waiting', 'active', 'intermittent', 'completed', 'cancelled')) DEFAULT 'active',
    notes TEXT,
    companion_name TEXT,
    companion_cedula TEXT,
    vehicle_brand TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    area TEXT,
    action TEXT CHECK(action IN ('Carga', 'Descarga', 'Ninguna')) DEFAULT 'Ninguna',
    department TEXT,
    \"createdAt\" TEXT NOT NULL,
    \"updatedAt\" TEXT NOT NULL,
    visitor_id INTEGER REFERENCES \"Visitors\"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    arrival_time TEXT,
    entry_time TEXT,
    exit_time TEXT,
    target_department TEXT,
    host_person TEXT
);

CREATE TABLE \"IntermittentLogs\" (
    id INTEGER PRIMARY KEY,
    visit_id INTEGER NOT NULL REFERENCES \"Visits\"(id) ON DELETE CASCADE,
    check_out TEXT NOT NULL,
    re_entry TEXT,
    notes TEXT,
    \"createdAt\" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z'),
    \"updatedAt\" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z'),
    registered_by TEXT
);

CREATE TABLE \"VisitorEditHistories\" (
    id INTEGER PRIMARY KEY,
    \"visitId\" INTEGER,
    \"visitorId\" INTEGER NOT NULL,
    field TEXT NOT NULL,
    \"oldValue\" TEXT,
    \"newValue\" TEXT,
    \"editedBy\" INTEGER NOT NULL,
    \"editedByUsername\" TEXT NOT NULL,
    \"editedAt\" TEXT NOT NULL,
    \"createdAt\" TEXT NOT NULL
);

CREATE TABLE \"ActivityLogs\" (
    id INTEGER PRIMARY KEY,
    \"userId\" INTEGER NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    \"entityId\" TEXT NOT NULL,
    details TEXT,
    \"ipAddress\" TEXT,
    \"userAgent\" TEXT,
    \"createdAt\" TEXT,
    method TEXT,
    path TEXT,
    \"statusCode\" INTEGER,
    duration INTEGER,
    severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
    role TEXT,
    resource TEXT,
    \"resourceId\" INTEGER,
    status TEXT CHECK(status IN ('success', 'failure')) DEFAULT 'success'
);

CREATE TABLE \"ArcoRequests\" (
    id INTEGER PRIMARY KEY,
    \"requestType\" TEXT NOT NULL CHECK(\"requestType\" IN ('access', 'rectification', 'cancellation', 'opposition')),
    \"subjectCedulaHash\" TEXT NOT NULL,
    \"subjectCedulaEncrypted\" TEXT,
    \"requestedByName\" TEXT NOT NULL,
    \"requestedByUserId\" INTEGER,
    \"contactEmail\" TEXT,
    reason TEXT,
    \"requestPayload\" TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'rejected')) DEFAULT 'pending',
    \"resolutionNotes\" TEXT,
    \"resolvedAt\" TEXT,
    \"createdAt\" TEXT,
    \"updatedAt\" TEXT
);

CREATE TABLE \"Departments\" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    \"isActive\" INTEGER DEFAULT 1,
    \"createdAt\" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z')
);

CREATE TABLE \"VisitPurposes\" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    \"isActive\" INTEGER DEFAULT 1,
    \"createdAt\" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z')
);

CREATE INDEX idx_activity_logs_action ON \"ActivityLogs\"(action);
CREATE INDEX idx_activity_logs_created_at ON \"ActivityLogs\"(\"createdAt\");
CREATE INDEX idx_activity_logs_username ON \"ActivityLogs\"(username);
CREATE INDEX idx_intermittent_logs_visit_id ON \"IntermittentLogs\"(visit_id);
CREATE INDEX idx_visitors_company ON \"Visitors\"(company);
CREATE INDEX idx_visits_check_in_time ON \"Visits\"(check_in_time);
CREATE INDEX idx_visits_check_out_time ON \"Visits\"(check_out_time);
CREATE INDEX idx_visits_status ON \"Visits\"(status);
CREATE INDEX idx_visits_visitor_cedula ON \"Visits\"(visitor_cedula);
CREATE UNIQUE INDEX visits_one_open_per_visitor ON \"Visits\"(visitor_cedula)
    WHERE status IN ('waiting', 'active', 'intermittent') AND check_out_time IS NULL;
";

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn migrated() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        apply(&mut conn).unwrap();
        conn
    }

    #[test]
    fn applies_all_migrations_and_reports_version() {
        let conn = migrated();
        // rusqlite_migration 1.x guarda la versión en PRAGMA user_version.
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, MIGRATION_COUNT as i64);
    }

    #[test]
    fn all_domain_tables_exist() {
        let conn = migrated();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        for expected in [
            "ActivityLogs",
            "ArcoRequests",
            "Departments",
            "IdentityIndexState",
            "IntermittentLogs",
            "SearchIndexState",
            "Users",
            "VisitPurposes",
            "VisitorEditHistories",
            "VisitorSearchTokens",
            "Visitors",
            "Visits",
            "app_meta",
        ] {
            assert!(tables.contains(&expected.to_string()), "falta {expected}");
        }
        // Sin metadatos históricos de PostgreSQL: los sustituye
        // rusqlite_migrations.
        assert!(!tables.contains(&"SequelizeMeta".to_string()));
        assert!(!tables.contains(&"goose_db_version".to_string()));
    }

    #[test]
    fn index_states_start_seeded() {
        let conn = migrated();
        let (fp, cursor, ready): (String, i64, i64) = conn
            .query_row(
                "SELECT fingerprint, cursor, ready FROM \"SearchIndexState\" WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(fp, "");
        assert_eq!(cursor, 0);
        assert_eq!(ready, 0);
        let (fp, ready): (String, i64) = conn
            .query_row(
                "SELECT fingerprint, ready FROM \"IdentityIndexState\" WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(fp, "");
        assert_eq!(ready, 0);
    }

    #[test]
    fn one_open_visit_per_identity_is_enforced() {
        let mut conn = migrated();
        let tx = conn.transaction().unwrap();
        tx.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
             VALUES(1, 'hash-a', 1, 'Reunión', 'Anfitrión', 'waiting', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        // Segunda visita abierta para la misma identidad: debe fallar.
        let err = tx
            .execute(
                "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
                 VALUES(2, 'hash-a', 1, 'Reunión', 'Anfitrión', 'active', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
                [],
            )
            .unwrap_err();
        // SQLite nombra las columnas en el error, no el índice.
        assert!(err.to_string().contains("UNIQUE constraint failed: Visits.visitor_cedula"));
        tx.rollback().unwrap();
    }

    #[test]
    fn completed_visit_does_not_block_a_new_one() {
        let mut conn = migrated();
        let tx = conn.transaction().unwrap();
        tx.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, check_out_time, \"createdAt\", \"updatedAt\") \
             VALUES(1, 'hash-a', 1, 'Reunión', 'Anfitrión', 'completed', '2026-11-10T01:00:00.000000Z', '2026-11-10T00:00:00.000000Z', '2026-11-10T01:00:00.000000Z')",
            [],
        )
        .unwrap();
        // Una visita nueva sí cabe: la anterior está cerrada.
        tx.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
             VALUES(2, 'hash-a', 1, 'Reunión', 'Anfitrión', 'waiting', '2026-11-10T02:00:00.000000Z', '2026-11-10T02:00:00.000000Z')",
            [],
        )
        .unwrap();
        tx.commit().unwrap();
    }

    #[test]
    fn one_open_interval_per_visit_is_enforced() {
        let mut conn = migrated();
        let tx = conn.transaction().unwrap();
        tx.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
             VALUES(1, 'hash-a', 1, 'Reunión', 'Anfitrión', 'intermittent', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO \"IntermittentLogs\"(id, visit_id, check_out, \"createdAt\", \"updatedAt\") \
             VALUES(1, 1, '2026-11-10T00:30:00.000000Z', '2026-11-10T00:30:00.000000Z', '2026-11-10T00:30:00.000000Z')",
            [],
        )
        .unwrap();
        let err = tx
            .execute(
                "INSERT INTO \"IntermittentLogs\"(id, visit_id, check_out, \"createdAt\", \"updatedAt\") \
                 VALUES(2, 1, '2026-11-10T00:40:00.000000Z', '2026-11-10T00:40:00.000000Z', '2026-11-10T00:40:00.000000Z')",
                [],
            )
            .unwrap_err();
        // SQLite nombra las columnas en el error, no el índice.
        assert!(err.to_string().contains("UNIQUE constraint failed: IntermittentLogs.visit_id"));
        tx.rollback().unwrap();
    }

    #[test]
    fn cascades_delete_intermittent_logs_and_search_tokens() {
        let conn = migrated();
        conn.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
             VALUES(1, 'hash-a', 1, 'Reunión', 'Anfitrión', 'completed', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO \"IntermittentLogs\"(id, visit_id, check_out, \"createdAt\", \"updatedAt\") \
             VALUES(1, 1, '2026-11-10T00:30:00.000000Z', '2026-11-10T00:30:00.000000Z', '2026-11-10T00:30:00.000000Z')",
            [],
        )
        .unwrap();
        let token = vec![0u8; 32];
        conn.execute(
            "INSERT INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES(1, ?1)",
            rusqlite::params![token],
        )
        .unwrap();
        conn.execute("DELETE FROM \"Visits\" WHERE id = 1", [])
            .unwrap();
        let logs: i64 = conn
            .query_row("SELECT count(*) FROM \"IntermittentLogs\"", [], |r| r.get(0))
            .unwrap();
        assert_eq!(logs, 0);
        conn.execute("DELETE FROM \"Visitors\" WHERE id = 1", [])
            .unwrap();
        let tokens: i64 = conn
            .query_row("SELECT count(*) FROM \"VisitorSearchTokens\"", [], |r| r.get(0))
            .unwrap();
        assert_eq!(tokens, 0);
    }

    #[test]
    fn search_token_must_be_32_bytes() {
        let conn = migrated();
        conn.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        let short = vec![0u8; 16];
        let err = conn
            .execute(
                "INSERT INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES(1, ?1)",
                rusqlite::params![short],
            )
            .unwrap_err();
        assert!(err.to_string().contains("CHECK"));
    }

    #[test]
    fn invalid_status_is_rejected() {
        let conn = migrated();
        conn.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        let err = conn
            .execute(
                "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\") \
                 VALUES(1, 'hash-a', 1, 'Reunión', 'Anfitrión', 'perdida', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
                [],
            )
            .unwrap_err();
        assert!(err.to_string().contains("CHECK"));
    }

    #[test]
    fn cancelled_status_is_accepted_after_migration_7() {
        let conn = migrated();
        conn.execute(
            "INSERT INTO \"Visitors\"(id, cedula, first_name, last_name, company, \"updatedAt\") \
             VALUES(1, 'hash-a', 'Ana', 'Pérez', 'Trébol', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO \"Visits\"(id, visitor_cedula, visitor_id, purpose, person_to_visit, status, cancellation_reason, \"createdAt\", \"updatedAt\") \
             VALUES(1, 'hash-a', 1, 'Reunión', 'Anfitrión', 'cancelled', 'No vino', '2026-11-10T00:00:00.000000Z', '2026-11-10T00:00:00.000000Z')",
            [],
        )
        .unwrap();
    }
}
