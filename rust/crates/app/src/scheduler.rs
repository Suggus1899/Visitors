//! Programador interno (fase 6; documento §16, línea base §10).
//!
//! Las tareas que en Go eran timers de systemd son aquí tareas
//! tokio dentro del servidor, en zona America/Caracas (sin horario
//! de verano: UTC-4 fijo):
//!
//! - Respaldo diario a `backup_daily_at` (01:00): copia automática
//!   (contraseña guardada, poda a `keep`).
//! - Retención a `retention_run_at` (02:00), solo si
//!   `retention_enabled` (por defecto desactivada).
//! - Ensayo semanal de restauración, domingo a las 03:00, sobre el
//!   respaldo más reciente.
//!
//! Un fallo en una tarea queda en el log y no tumba el servidor; la
//! siguiente ejecución se programa igual. Sin carpeta de respaldos,
//! las tareas de respaldo y ensayo no arrancan (aviso en el log).

use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Datelike, NaiveTime, TimeZone, Utc};
use chrono_tz::America::Caracas;
use logmaster_store::Database;
use tokio::time::sleep;

use crate::backup::BackupService;
use crate::config::Config;

/// Hora del ensayo semanal (domingo, Caracas).
fn rehearsal_time() -> NaiveTime {
    NaiveTime::from_hms_opt(3, 0, 0).unwrap()
}

/// Próxima ocurrencia de una hora local (Caracas) a partir de
/// `now` (UTC). Si la hora de hoy ya pasó (o es ahora mismo), es
/// mañana.
pub fn next_daily(now: DateTime<Utc>, time: NaiveTime) -> DateTime<Utc> {
    let local = now.with_timezone(&Caracas);
    let mut candidate = Caracas
        .from_local_datetime(&local.date_naive().and_time(time))
        .single()
        .expect("hora local sin ambigüedad en Caracas");
    if candidate <= local {
        candidate = candidate + chrono::Duration::days(1);
    }
    candidate.with_timezone(&Utc)
}

/// Próximo domingo a una hora local (Caracas) a partir de `now`
/// (UTC). Si hoy es domingo y la hora ya pasó (o es ahora mismo),
/// es el domingo siguiente.
pub fn next_weekly_sunday(now: DateTime<Utc>, time: NaiveTime) -> DateTime<Utc> {
    let local = now.with_timezone(&Caracas);
    let weekday = local.weekday().num_days_from_sunday();
    let mut days_ahead = (7 - weekday) % 7;
    let today = Caracas
        .from_local_datetime(&local.date_naive().and_time(time))
        .single()
        .expect("hora local sin ambigüedad en Caracas");
    if days_ahead == 0 && today <= local {
        days_ahead = 7;
    }
    let candidate = Caracas
        .from_local_datetime(
            &(local.date_naive() + chrono::Duration::days(i64::from(days_ahead))).and_time(time),
        )
        .single()
        .expect("hora local sin ambigüedad en Caracas");
    candidate.with_timezone(&Utc)
}

fn parse_hhmm(value: &str, fallback: NaiveTime) -> NaiveTime {
    NaiveTime::parse_from_str(value, "%H:%M").unwrap_or(fallback)
}

async fn sleep_until(target: DateTime<Utc>) {
    let now = Utc::now();
    let wait = target.signed_duration_since(now);
    if wait.num_milliseconds() > 0 {
        sleep(Duration::from_millis(wait.num_milliseconds() as u64)).await;
    }
}

async fn backup_task(db: Database, config: Arc<Config>, backup: Arc<BackupService>) {
    let time = parse_hhmm(
        &config.backup_daily_at,
        NaiveTime::from_hms_opt(1, 0, 0).unwrap(),
    );
    loop {
        let next = next_daily(Utc::now(), time);
        tracing::info!(next = %next, "próximo respaldo diario programado");
        sleep_until(next).await;
        match backup.create(&db, true).await {
            Ok(created) => tracing::info!(
                name = %created.name,
                engine = %created.manifest.engine,
                "respaldo diario creado"
            ),
            Err(e) => tracing::error!(error = %e, "respaldo diario fallido"),
        }
    }
}

async fn retention_task(db: Database, config: Arc<Config>) {
    let time = parse_hhmm(
        &config.retention_run_at,
        NaiveTime::from_hms_opt(2, 0, 0).unwrap(),
    );
    loop {
        let next = next_daily(Utc::now(), time);
        tracing::info!(next = %next, "próxima retención programada");
        sleep_until(next).await;
        match db
            .run_retention(
                true,
                config.retention_data_days,
                config.audit_retention_days,
                Utc::now(),
            )
            .await
        {
            Ok(counts) => tracing::info!(
                logs = counts.logs,
                visits = counts.visits,
                visitors = counts.visitors,
                requests = counts.requests,
                "retención ejecutada"
            ),
            Err(e) => tracing::error!(error = %e, "retención fallida"),
        }
    }
}

async fn rehearsal_task(backup: Arc<BackupService>) {
    loop {
        let next = next_weekly_sunday(Utc::now(), rehearsal_time());
        tracing::info!(next = %next, "próximo ensayo de restauración programado");
        sleep_until(next).await;
        let name = match backup.list() {
            Ok(listed) => listed.first().map(|(name, _)| name.clone()),
            Err(e) => {
                tracing::error!(error = %e, "ensayo: no se pudo listar respaldos");
                None
            }
        };
        match name {
            Some(name) => match backup.rehearse(&name, None) {
                Ok(rehearsal) => tracing::info!(
                    name = %rehearsal.name,
                    engine = %rehearsal.engine,
                    "ensayo de restauración correcto"
                ),
                Err(e) => {
                    tracing::error!(error = %e, name = %name, "ensayo de restauración fallido")
                }
            },
            None => tracing::warn!("ensayo: no hay respaldos para ensayar"),
        }
    }
}

/// Arranca las tareas programadas en segundo plano. Sin carpeta de
/// respaldos no hay respaldo diario ni ensayo (aviso); sin
/// retención habilitada no hay tarea de retención (aviso).
pub fn spawn_scheduler(db: Database, config: Arc<Config>, backup: Option<Arc<BackupService>>) {
    match backup {
        Some(backup) => {
            tokio::spawn(backup_task(db.clone(), config.clone(), backup.clone()));
            tokio::spawn(rehearsal_task(backup));
        }
        None => {
            tracing::warn!("sin BACKUP_PATH: no hay respaldo diario ni ensayo semanal");
        }
    }
    if config.retention_enabled {
        tokio::spawn(retention_task(db, config));
    } else {
        tracing::info!("retención desactivada en el config: no hay tarea programada");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(y: i32, mo: u32, d: u32, h: u32, m: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, mo, d, h, m, 0).unwrap()
    }

    #[test]
    fn next_daily_before_and_after_the_hour() {
        let one = NaiveTime::from_hms_opt(1, 0, 0).unwrap();
        // Miércoles 2026-11-11 00:30 Caracas (04:30 UTC): hoy 01:00.
        assert_eq!(
            next_daily(utc(2026, 11, 11, 4, 30), one),
            utc(2026, 11, 11, 5, 0)
        );
        // 01:00 Caracas en punto: mañana.
        assert_eq!(
            next_daily(utc(2026, 11, 11, 5, 0), one),
            utc(2026, 11, 12, 5, 0)
        );
        // 01:30 Caracas: mañana.
        assert_eq!(
            next_daily(utc(2026, 11, 11, 5, 30), one),
            utc(2026, 11, 12, 5, 0)
        );
    }

    #[test]
    fn next_weekly_sunday_from_wednesday_and_sunday() {
        let three = NaiveTime::from_hms_opt(3, 0, 0).unwrap();
        // Miércoles 2026-11-11 02:00 Caracas: domingo 2026-11-15 03:00.
        assert_eq!(
            next_weekly_sunday(utc(2026, 11, 11, 6, 0), three),
            utc(2026, 11, 15, 7, 0)
        );
        // Domingo 2026-11-15 02:00 Caracas: hoy 03:00.
        assert_eq!(
            next_weekly_sunday(utc(2026, 11, 15, 6, 0), three),
            utc(2026, 11, 15, 7, 0)
        );
        // Domingo 2026-11-15 04:00 Caracas: el domingo siguiente.
        assert_eq!(
            next_weekly_sunday(utc(2026, 11, 15, 8, 0), three),
            utc(2026, 11, 22, 7, 0)
        );
    }
}
