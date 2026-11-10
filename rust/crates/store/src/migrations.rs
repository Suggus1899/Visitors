//! Migraciones del esquema SQLite, aplicadas al arrancar.
//!
//! Fase 0/1: solo infraestructura. La migracion 00001 crea la tabla de
//! metadatos de la aplicacion; las tablas de dominio (Users, Visitors,
//! Visits, IntermittentLogs, VisitorEditHistories, ActivityLogs,
//! ArcoRequests, ...) se traducen en la **fase 2** desde las migraciones
//! Goose 00001-00006 de PostgreSQL (documento, seccion 11). No se crean
//! tablas a medias: o el esquema de dominio llega completo con sus
//! pruebas, o no llega.
//!
//! La version aplicada se deriva de las migraciones incorporadas al
//! binario, como hoy la deriva Goose en Go.

use anyhow::Result;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

/// Todas las migraciones, en orden. `rusqlite_migration` guarda la
/// version aplicada en su propia tabla y las aplica transaccionalmente.
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(
        "CREATE TABLE IF NOT EXISTS app_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO app_meta (key, value)
        VALUES ('schema_origin', 'logmaster-rust');",
    )])
}

/// Aplica las migraciones pendientes.
pub fn apply(conn: &mut Connection) -> Result<()> {
    migrations().to_latest(conn)?;
    Ok(())
}
