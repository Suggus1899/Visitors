//! Retención programada (fase 6; documento §11.2 y §16).
//!
//! Mismo alcance que Go (`server-go/internal/httpapi/retention.go`),
//! con la misma programación (02:00 America/Caracas, desactivada
//! por defecto) y las mismas reglas:
//!
//! - `ActivityLogs` anteriores a `audit_days`.
//! - `Visits` completadas anteriores a `data_days`.
//! - `ArcoRequests` resueltas (`completed`/`rejected`) anteriores
//!   a `data_days`.
//! - `Visitors` elegibles anteriores a `data_days`: sin visitas
//!   que los referencien (`visitor_id` o `visitor_cedula`) y sin
//!   solicitudes ARCO pendientes o en curso.
//!
//! Las visitas canceladas y la purga directa del historial de
//! ediciones quedan fuera, como en Go. La entrada de auditoría
//! `RETENTION_CLEANUP` (actor root, primer root por id) se escribe
//! en la misma transacción; sin cuenta root, la retención falla
//! como en Go (`root account required to audit retention`).
//!
//! Los cortes se calculan en UTC: Caracas no tiene horario de
//! verano (UTC-4 fijo), así que restar los días en UTC es lo mismo
//! que restarlos en hora de Caracas. Los timestamps guardados son
//! ISO 8601 UTC canónicos, comparables como texto en SQLite.

use anyhow::{Context, Result};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::Serialize;

use crate::database::Database;

/// Conteos de una ejecución de retención, por tabla.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct RetentionCounts {
    /// `ActivityLogs` borrados (corte de auditoría).
    pub logs: i64,
    /// `Visits` completadas borradas.
    pub visits: i64,
    /// `Visitors` elegibles borrados.
    pub visitors: i64,
    /// `ArcoRequests` resueltas borradas.
    pub requests: i64,
}

impl Database {
    /// Ejecuta la retención en el motor configurado, en una sola
    /// transacción. Con la retención desactivada el llamador no debe
    /// invocar este método (devuelve los conteos en cero igualmente,
    /// como Go cuando `RetentionEnabled` es falso, si se le pasa
    /// `enabled = false`).
    pub async fn run_retention(
        &self,
        enabled: bool,
        data_days: i64,
        audit_days: i64,
        now: DateTime<Utc>,
    ) -> Result<RetentionCounts> {
        if !enabled {
            return Ok(RetentionCounts::default());
        }
        if data_days < 1 || audit_days < 1 {
            anyhow::bail!("invalid retention configuration");
        }
        let data_cutoff = (now - ChronoDuration::days(data_days))
            .format("%Y-%m-%dT%H:%M:%S%.6fZ")
            .to_string();
        let audit_cutoff = (now - ChronoDuration::days(audit_days))
            .format("%Y-%m-%dT%H:%M:%S%.6fZ")
            .to_string();
        let now_text = now.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string();
        match self {
            Database::Sqlite(store) => {
                retention_sqlite(store, &data_cutoff, &audit_cutoff, &now_text)
            }
            Database::Postgres(pg) => {
                retention_postgres(pg.pool(), &data_cutoff, &audit_cutoff, &now_text).await
            }
        }
    }
}

/// Borrados de retención en SQLite (mismo SQL que Go, con `MAX` en
/// lugar de `GREATEST` para el mayor de dos fechas).
fn retention_sqlite(
    store: &crate::Store,
    data_cutoff: &str,
    audit_cutoff: &str,
    now_text: &str,
) -> Result<RetentionCounts> {
    store
        .tx_immediate(|tx| {
            let logs = tx.execute(
                "DELETE FROM \"ActivityLogs\" WHERE \"createdAt\" < ?1",
                [audit_cutoff],
            )? as i64;
            let visits = tx.execute(
                "DELETE FROM \"Visits\" WHERE status = 'completed' \
                 AND check_out_time < ?1 AND \"updatedAt\" < ?1",
                [data_cutoff],
            )? as i64;
            let requests = tx.execute(
                "DELETE FROM \"ArcoRequests\" WHERE status IN ('completed', 'rejected') \
                 AND MAX(\"createdAt\", \"updatedAt\") < ?1",
                [data_cutoff],
            )? as i64;
            // SQLite no admite alias en DELETE FROM: se usa el
            // nombre de la tabla en las subconsultas.
            let visitors = tx.execute(
                "DELETE FROM \"Visitors\" \
                 WHERE MAX(\"createdAt\", \"updatedAt\") < ?1 \
                 AND NOT EXISTS (SELECT 1 FROM \"Visits\" v \
                    WHERE v.visitor_id = \"Visitors\".id OR v.visitor_cedula = \"Visitors\".cedula) \
                 AND NOT EXISTS (SELECT 1 FROM \"ArcoRequests\" a \
                    WHERE a.\"subjectCedulaHash\" = \"Visitors\".cedula \
                    AND a.status IN ('pending', 'in_progress'))",
                [data_cutoff],
            )? as i64;
            let counts = RetentionCounts {
                logs,
                visits,
                visitors,
                requests,
            };
            let details = serde_json::to_string(&counts)?;
            let audited = tx.execute(
                "INSERT INTO \"ActivityLogs\" \
                 (\"userId\", username, action, entity, \"entityId\", details, \"createdAt\", role, status) \
                 SELECT id, username, 'RETENTION_CLEANUP', 'System', 'retention', ?1, ?2, 'root', 'success' \
                 FROM \"Users\" WHERE role = 'root' ORDER BY id LIMIT 1",
                rusqlite::params![details, now_text],
            )?;
            if audited != 1 {
                anyhow::bail!("root account required to audit retention");
            }
            Ok(counts)
        })
        .context("retención SQLite")
}

/// Borrados de retención en PostgreSQL (el SQL de Go, literal).
async fn retention_postgres(
    pool: &sqlx::PgPool,
    data_cutoff: &str,
    audit_cutoff: &str,
    now_text: &str,
) -> Result<RetentionCounts> {
    let mut tx = pool.begin().await.context("retención PostgreSQL")?;
    let logs = sqlx::query("DELETE FROM \"ActivityLogs\" WHERE \"createdAt\" < $1")
        .bind(audit_cutoff)
        .execute(&mut *tx)
        .await?
        .rows_affected() as i64;
    let visits = sqlx::query(
        "DELETE FROM \"Visits\" WHERE status = 'completed' \
         AND check_out_time < $1 AND \"updatedAt\" < $1",
    )
    .bind(data_cutoff)
    .execute(&mut *tx)
    .await?
    .rows_affected() as i64;
    let requests = sqlx::query(
        "DELETE FROM \"ArcoRequests\" WHERE status IN ('completed', 'rejected') \
         AND GREATEST(\"createdAt\", \"updatedAt\") < $1",
    )
    .bind(data_cutoff)
    .execute(&mut *tx)
    .await?
    .rows_affected() as i64;
    let visitors = sqlx::query(
        "DELETE FROM \"Visitors\" p \
         WHERE GREATEST(p.\"createdAt\", p.\"updatedAt\") < $1 \
         AND NOT EXISTS (SELECT 1 FROM \"Visits\" v \
            WHERE v.visitor_id = p.id OR v.visitor_cedula = p.cedula) \
         AND NOT EXISTS (SELECT 1 FROM \"ArcoRequests\" a \
            WHERE a.\"subjectCedulaHash\" = p.cedula \
            AND a.status IN ('pending', 'in_progress'))",
    )
    .bind(data_cutoff)
    .execute(&mut *tx)
    .await?
    .rows_affected() as i64;
    let counts = RetentionCounts {
        logs,
        visits,
        visitors,
        requests,
    };
    let details = serde_json::to_string(&counts)?;
    let audited = sqlx::query(
        "INSERT INTO \"ActivityLogs\" \
         (\"userId\", username, action, entity, \"entityId\", details, \"createdAt\", role, status) \
         SELECT id, username, 'RETENTION_CLEANUP', 'System', 'retention', $1, $2, 'root', 'success' \
         FROM \"Users\" WHERE role = 'root' ORDER BY id LIMIT 1",
    )
    .bind(&details)
    .bind(now_text)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if audited != 1 {
        anyhow::bail!("root account required to audit retention");
    }
    tx.commit().await.context("retención PostgreSQL")?;
    Ok(counts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;

    const NOW: &str = "2026-11-11T00:00:00.000000Z";
    const OLD: &str = "2026-01-01T00:00:00.000000Z";
    const RECENT: &str = "2026-11-01T00:00:00.000000Z";

    fn seeded() -> Store {
        let store = Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        store
            .tx_immediate(|tx| {
                // Root (auditor de la retención) y un operador.
                tx.execute(
                    "INSERT INTO \"Users\" (id, username, email, \"tokenVersion\", password, role, \"createdAt\", \"updatedAt\") \
                     VALUES (1, 'root', 'root@example.test', 0, 'x', 'root', ?1, ?1), \
                            (2, 'operador', 'op@example.test', 0, 'x', 'operador', ?1, ?1)",
                    [NOW],
                )?;
                // Visitantes: uno viejo sin referencias (elegible),
                // uno viejo con visita activa (no elegible) y uno reciente.
                tx.execute(
                    "INSERT INTO \"Visitors\" (id, cedula, first_name, last_name, company, \"createdAt\", \"updatedAt\") \
                     VALUES (1, 'hash-viejo-libre', 'Viejo', 'Libre', 'Empresa', ?1, ?1), \
                            (2, 'hash-viejo-ocupado', 'Viejo', 'Ocupado', 'Empresa', ?1, ?1), \
                            (3, 'hash-reciente', 'Nuevo', 'Reciente', 'Empresa', ?2, ?2)",
                    rusqlite::params![OLD, RECENT],
                )?;
                // Visitas: completada vieja (se borra), activa vieja
                // (no se borra: no está completada), completada reciente.
                tx.execute(
                    "INSERT INTO \"Visits\" (id, visitor_cedula, visitor_id, purpose, person_to_visit, status, check_in_time, check_out_time, \"createdAt\", \"updatedAt\") \
                     VALUES (1, 'hash-viejo-libre', 1, 'Visita', 'Anfitrion', 'completed', ?1, ?1, ?1, ?1), \
                            (2, 'hash-viejo-ocupado', 2, 'Visita', 'Anfitrion', 'active', ?1, NULL, ?1, ?1), \
                            (3, 'hash-reciente', 3, 'Visita', 'Anfitrion', 'completed', ?2, ?2, ?2, ?2)",
                    rusqlite::params![OLD, RECENT],
                )?;
                // Bitácora: solo la de 2025-01-01 es anterior al
                // corte de auditoría (2025-11-11); la de 2026-01-01
                // y la reciente se quedan.
                tx.execute(
                    "INSERT INTO \"ActivityLogs\" (\"userId\", username, action, entity, \"entityId\", \"createdAt\", role, status) \
                     VALUES (1, 'root', 'LOGIN', 'Session', '1', '2025-01-01T00:00:00.000000Z', 'root', 'success'), \
                            (1, 'root', 'LOGIN', 'Session', '1', ?1, 'root', 'success'), \
                            (1, 'root', 'LOGIN', 'Session', '1', ?2, 'root', 'success')",
                    rusqlite::params![OLD, RECENT],
                )?;
                // ARCO: resuelta vieja (se borra), pendiente vieja
                // (no se borra), resuelta reciente.
                tx.execute(
                    "INSERT INTO \"ArcoRequests\" (id, \"requestType\", \"subjectCedulaHash\", \"requestedByName\", status, \"createdAt\", \"updatedAt\") \
                     VALUES (1, 'access', 'hash-viejo-libre', 'Titular', 'completed', ?1, ?1), \
                            (2, 'access', 'hash-viejo-ocupado', 'Titular', 'pending', ?1, ?1), \
                            (3, 'access', 'hash-reciente', 'Titular', 'completed', ?2, ?2)",
                    rusqlite::params![OLD, RECENT],
                )?;
                Ok(())
            })
            .unwrap();
        store
    }

    fn count(store: &Store, sql: &str) -> i64 {
        store
            .read(|conn| Ok(conn.query_row(sql, [], |row| row.get(0))?))
            .unwrap()
    }

    #[tokio::test]
    async fn retention_sqlite_deletes_only_eligible_rows() {
        let store = seeded();
        let db = Database::Sqlite(store.clone());
        let now = DateTime::parse_from_rfc3339(NOW)
            .unwrap()
            .with_timezone(&Utc);
        let counts = db.run_retention(true, 60, 365, now).await.unwrap();
        // Visita 1 (completada vieja) se borra; la 2 es activa y la
        // 3 reciente. Al borrar la visita 1, el visitante 1 queda
        // sin referencias y es elegible: se borra también. El 2
        // sigue ocupado por la visita activa y por el ARCO pendiente.
        assert_eq!(
            counts,
            RetentionCounts {
                logs: 1,
                visits: 1,
                visitors: 1,
                requests: 1,
            }
        );
        assert_eq!(count(&store, "SELECT COUNT(*) FROM \"Visits\""), 2);
        assert_eq!(count(&store, "SELECT COUNT(*) FROM \"Visitors\""), 2);
        assert_eq!(count(&store, "SELECT COUNT(*) FROM \"ArcoRequests\""), 2);
        // Bitácora: quedan las dos no borradas y la RETENTION_CLEANUP.
        assert_eq!(count(&store, "SELECT COUNT(*) FROM \"ActivityLogs\""), 3);
        assert_eq!(
            count(
                &store,
                "SELECT COUNT(*) FROM \"ActivityLogs\" WHERE action = 'RETENTION_CLEANUP'",
            ),
            1
        );
    }

    #[tokio::test]
    async fn retention_disabled_returns_zeros() {
        let store = seeded();
        let db = Database::Sqlite(store.clone());
        let now = DateTime::parse_from_rfc3339(NOW)
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(
            db.run_retention(false, 60, 365, now).await.unwrap(),
            RetentionCounts::default()
        );
        assert_eq!(count(&store, "SELECT COUNT(*) FROM \"Visits\""), 3);
    }

    #[tokio::test]
    async fn retention_without_root_fails() {
        let store = Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let db = Database::Sqlite(store);
        let now = DateTime::parse_from_rfc3339(NOW)
            .unwrap()
            .with_timezone(&Utc);
        assert!(db.run_retention(true, 60, 365, now).await.is_err());
    }
}
