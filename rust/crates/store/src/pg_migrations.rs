//! Migraciones PostgreSQL: los archivos Goose 00001–00006 tal cual
//! existen en `server-go/db/migrations/`, copiados byte a byte a
//! `crates/store/migrations-pg/` e incrustados en el binario con
//! `include_str!`.
//!
//! El runner es mínimo y deliberadamente parecido a Goose v3 (el que
//! usa Go, `pressly/goose/v3`):
//! - Cada migración corre en su propia transacción, con todo su
//!   `Up` ejecutado de una vez (`sqlx::raw_sql`, que admite varias
//!   sentencias). Las marcas `-- +goose Up/Down/StatementBegin/End`
//!   son comentarios SQL y PostgreSQL las ignora; la sección `Down`
//!   se corta antes de ejecutar. `ALTER TYPE ... ADD VALUE` (00006)
//!   sí puede correr dentro de una transacción en PostgreSQL 16
//!   (verificado contra el clúster local).
//! - La versión aplicada se registra en `goose_db_version`, con el
//!   mismo esquema que crea Goose (`id BIGSERIAL PRIMARY KEY,
//!   version_id BIGINT NOT NULL, is_applied BOOLEAN NOT NULL,
//!   tstamp TIMESTAMP NOT NULL DEFAULT now()`), para que una base
//!   migrada por Rust sea indistinguible de una migrada por Go y
//!   Goose pueda seguir desde ahí. Diferencia con la variante
//!   SQLite: allí la versión vive en `PRAGMA user_version` (7
//!   migraciones rusqlite, la 1 es infraestructura propia) y no
//!   existe `goose_db_version`; aquí la versión es 6, la última
//!   Goose aplicada, igual que `db.LatestVersion()` de Go.
//! - Ninguna migración exige extensiones: se buscó `pg_trgm` y
//!   `CREATE EXTENSION` en `server-go/` y no aparece en ningún
//!   archivo. Los trigramas de búsqueda son tokens HMAC calculados
//!   en la crate `crypto` y guardados como columnas, no índices
//!   `pg_trgm`.
//! - Las migraciones `Down` no se ejecutan nunca: como en Go, son
//!   bloques `DO` que lanzan una excepción ("restaurar un respaldo
//!   verificado en vez de revertir").
//!
//! La copia se verifica byte a byte contra `server-go/` en el test
//! de este módulo, para que no diverja en silencio.

use anyhow::{Context, Result};
use sqlx::PgPool;

/// Número de migraciones Goose (la versión esperada del esquema en
/// PostgreSQL, igual que `db.LatestVersion()` de Go).
pub const PG_MIGRATION_COUNT: usize = 6;

/// Una migración Goose, con su SQL `Up` incrustado.
pub struct PgMigration {
    /// Versión Goose (1–6).
    pub version: i64,
    /// Nombre del archivo en `server-go/db/migrations/`.
    pub name: &'static str,
    /// Contenido literal del archivo (con marcas `+goose`).
    pub sql: &'static str,
}

/// Las seis migraciones, en orden.
pub const MIGRATIONS: [PgMigration; PG_MIGRATION_COUNT] = [
    PgMigration {
        version: 1,
        name: "00001_baseline.sql",
        sql: include_str!("../migrations-pg/00001_baseline.sql"),
    },
    PgMigration {
        version: 2,
        name: "00002_visit_integrity.sql",
        sql: include_str!("../migrations-pg/00002_visit_integrity.sql"),
    },
    PgMigration {
        version: 3,
        name: "00003_protected_search.sql",
        sql: include_str!("../migrations-pg/00003_protected_search.sql"),
    },
    PgMigration {
        version: 4,
        name: "00004_query_indexes.sql",
        sql: include_str!("../migrations-pg/00004_query_indexes.sql"),
    },
    PgMigration {
        version: 5,
        name: "00005_protected_identity.sql",
        sql: include_str!("../migrations-pg/00005_protected_identity.sql"),
    },
    PgMigration {
        version: 6,
        name: "00006_cancelled_waiting_visits.sql",
        sql: include_str!("../migrations-pg/00006_cancelled_waiting_visits.sql"),
    },
];

/// Sección `Up` de un archivo Goose: desde `-- +goose Up` hasta
/// `-- +goose Down` (o el final). Las marcas son comentarios SQL y se
/// dejan tal cual: PostgreSQL las ignora.
fn up_section(sql: &str) -> &str {
    let after_up = match sql.find("-- +goose Up") {
        Some(pos) => &sql[pos..],
        None => sql,
    };
    match after_up.find("-- +goose Down") {
        Some(pos) => &after_up[..pos],
        None => after_up,
    }
}

/// Crea `goose_db_version` si no existe, con el esquema de Goose v3.
async fn ensure_version_table(pool: &PgPool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS goose_db_version(\
            id BIGSERIAL PRIMARY KEY, \
            version_id BIGINT NOT NULL, \
            is_applied BOOLEAN NOT NULL, \
            tstamp TIMESTAMP NOT NULL DEFAULT now())",
    )
    .execute(pool)
    .await
    .context("crear goose_db_version")?;
    Ok(())
}

/// Versiones ya aplicadas (`is_applied = true`).
pub async fn applied_versions(pool: &PgPool) -> Result<Vec<i64>> {
    ensure_version_table(pool).await?;
    let rows = sqlx::query_scalar::<_, i64>(
        "SELECT version_id FROM goose_db_version WHERE is_applied ORDER BY version_id",
    )
    .fetch_all(pool)
    .await
    .context("leer goose_db_version")?;
    Ok(rows)
}

/// Versión de esquema aplicada (máxima Goose aplicada; 0 si la tabla
/// de versiones no existe o está vacía).
pub async fn schema_version(pool: &PgPool) -> Result<usize> {
    let versions = applied_versions(pool).await?;
    Ok(versions.into_iter().max().unwrap_or(0) as usize)
}

/// Aplica las migraciones pendientes, cada una en su propia
/// transacción, y registra su versión en `goose_db_version`.
/// Idempotente: las ya aplicadas se saltan.
pub async fn apply(pool: &PgPool) -> Result<()> {
    ensure_version_table(pool).await?;
    let applied = applied_versions(pool).await?;
    for migration in MIGRATIONS {
        if applied.contains(&migration.version) {
            continue;
        }
        let mut tx = pool
            .begin()
            .await
            .context("abrir transacción de migración")?;
        sqlx::raw_sql(up_section(migration.sql))
            .execute(&mut *tx)
            .await
            .with_context(|| format!("aplicar migración Goose {}", migration.version))?;
        sqlx::query("INSERT INTO goose_db_version(version_id, is_applied) VALUES($1, true)")
            .bind(migration.version)
            .execute(&mut *tx)
            .await
            .context("registrar versión en goose_db_version")?;
        tx.commit()
            .await
            .with_context(|| format!("confirmar migración Goose {}", migration.version))?;
        tracing::info!(
            version = migration.version,
            name = migration.name,
            "migración Goose aplicada"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Las copias incrustadas deben ser byte a byte las de Go, para
    /// que el SQL que se ejecuta sea el auditado en `server-go/`.
    #[test]
    fn embedded_copies_match_goose_files() {
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../server-go/db/migrations");
        for migration in MIGRATIONS {
            let original = std::fs::read_to_string(base.join(migration.name)).unwrap_or_else(|e| {
                panic!(
                    "no se pudo leer {}: {e}",
                    base.join(migration.name).display()
                )
            });
            assert_eq!(
                original, migration.sql,
                "la copia de {} divergió de server-go/db/migrations/",
                migration.name
            );
        }
    }

    #[test]
    fn up_section_cuts_the_down_block() {
        let sql = MIGRATIONS[0].sql;
        let up = up_section(sql);
        assert!(up.contains("CREATE TABLE public.\"ActivityLogs\""));
        assert!(!up.contains("irreversible"));
        assert!(!up.contains("+goose Down"));
        // La 00006 solo tiene Up con dos sentencias.
        let up6 = up_section(MIGRATIONS[5].sql);
        assert!(up6.contains("ADD VALUE IF NOT EXISTS 'cancelled'"));
        assert!(up6.contains("cancellation_reason"));
    }
}
