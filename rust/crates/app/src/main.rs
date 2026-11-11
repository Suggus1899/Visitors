//! logmaster.exe — un solo ejecutable para LogMaster.
//!
//! El mismo binario es servidor, instalador de servicio, herramienta de
//! mantenimiento y (en fases posteriores) generador de respaldos,
//! exactamente como hoy el binario Go concentra `serve`, `check`,
//! `migrate` y el CLI de operaciones (documento, seccion 5).
//!
//! ```text
//! logmaster.exe                  # servidor en consola
//! logmaster.exe serve            # idem, explicito
//! logmaster.exe check            # version de esquema, integridad y ping
//! logmaster.exe migrate          # aplica migraciones pendientes
//! logmaster.exe service install  # instala el servicio de Windows
//! logmaster.exe service start | stop | restart | uninstall
//! logmaster.exe convert --from-postgres <cadena> --to <sqlite>
//! logmaster.exe preflight --from-postgres <cadena> | --db <sqlite>
//! logmaster.exe init [--root-password-file <archivo>]
//! logmaster.exe secrets set <NOMBRE> | secrets list
//! logmaster.exe backup [--automatic]
//! logmaster.exe restore <archivo> --confirm-target <destino> [--password <clave>]
//! logmaster.exe rehearse [archivo] [--password <clave>]
//! logmaster.exe retention
//! ```
//!
//! `convert` y `preflight` son operaciones síncronas de una sola vez
//! (el cliente de PostgreSQL es síncrono): corren en un hilo de
//! bloqueo para no detener el runtime de Tokio.

mod backup;
mod client_ip;
mod common;
mod config;
mod convert;
mod cookies;
mod dto;
mod error;
mod events;
mod first_run;
mod http;
mod init;
mod mail;
mod origin;
mod rate_limit;
mod roles;
mod routes;
mod secrets;
mod service;
mod session;
mod ui;

use std::path::PathBuf;

use anyhow::{bail, Result};
use clap::{Parser, Subcommand};
use logmaster_store::Database;

#[derive(Parser)]
#[command(
    name = "logmaster",
    version,
    about = "LogMaster: control de visitantes en un solo ejecutable"
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Arranca el servidor en consola (desarrollo y diagnostico).
    Serve,
    /// Version de esquema, conectividad e integridad de la base.
    Check,
    /// Aplica migraciones pendientes de forma explicita.
    Migrate,
    /// Gestion del servicio de Windows.
    Service {
        #[command(subcommand)]
        action: service::ServiceAction,
    },
    /// Gestion del archivo de secretos (DPAPI en Windows).
    Secrets {
        #[command(subcommand)]
        action: init::SecretsAction,
    },
    /// Crea las carpetas, el config.toml y los secretos, y con
    /// `--root-password-file` la cuenta root inicial.
    Init {
        /// Archivo privado con la contraseña del root inicial.
        #[arg(long)]
        root_password_file: Option<PathBuf>,
    },
    /// Copia los datos de PostgreSQL a una base SQLite nueva.
    Convert {
        /// Cadena de conexión a PostgreSQL (sin TLS: mismo host o red
        /// de confianza; ver `convert.rs`).
        #[arg(long)]
        from_postgres: String,
        /// Ruta del SQLite de destino (no debe existir).
        #[arg(long)]
        to: PathBuf,
    },
    /// Comprueba una base antes (origen) o después (destino) de convertir.
    Preflight {
        /// Cadena de conexión a PostgreSQL de origen.
        #[arg(long)]
        from_postgres: Option<String>,
        /// Ruta del SQLite ya convertido.
        #[arg(long)]
        db: Option<PathBuf>,
    },
    /// Crea un respaldo con age (manual por defecto; con
    /// `--automatic` guarda la contraseña cifrada aparte y poda a
    /// 30 pares verificados). Imprime la contraseña una sola vez.
    Backup {
        /// Copia automática (contraseña guardada, podable).
        #[arg(long)]
        automatic: bool,
    },
    /// Restaura un respaldo en la base configurada. Exige el
    /// servicio detenido y `--confirm-target` con el destino exacto
    /// (ruta SQLite o cadena PostgreSQL): sin esa confirmación no
    /// se toca el destino.
    Restore {
        /// Nombre del respaldo (en `backup.path`).
        file: String,
        /// Contraseña de restauración; si falta, se usa la guardada
        /// de la copia automática.
        #[arg(long)]
        password: Option<String>,
        /// Destino exacto que se va a sustituir (ruta SQLite o
        /// cadena de conexión PostgreSQL).
        #[arg(long)]
        confirm_target: String,
    },
    /// Ensaya la restauración de un respaldo (o del más reciente):
    /// descifra, verifica integridad y conteos, y descarta.
    Rehearse {
        /// Nombre del respaldo (en `backup.path`); sin él, el más
        /// reciente.
        file: Option<String>,
        /// Contraseña de restauración; si falta, se usa la guardada
        /// de la copia automática.
        #[arg(long)]
        password: Option<String>,
    },
    /// Ejecuta la retención ahora (según `[retention]` del config),
    /// aunque esté desactivada: el operador la pide explícitamente.
    Retention,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let cli = Cli::parse();
    match cli.command {
        Some(Command::Service { action }) => service::run_action(action),
        Some(Command::Secrets { action }) => init::run_secrets(action),
        Some(Command::Init { root_password_file }) => init::run_init(root_password_file).await,
        Some(Command::Check) => check().await,
        Some(Command::Migrate) => migrate().await,
        Some(Command::Convert { from_postgres, to }) => {
            let report =
                tokio::task::spawn_blocking(move || convert::run_convert(&from_postgres, &to))
                    .await??;
            report.print();
            Ok(())
        }
        Some(Command::Preflight { from_postgres, db }) => match (from_postgres, db) {
            (Some(connstr), None) => {
                let report =
                    tokio::task::spawn_blocking(move || convert::run_preflight_postgres(&connstr))
                        .await??;
                convert::print_report(&report);
                if report.all_passed() {
                    Ok(())
                } else {
                    bail!("preflight del origen con fallos")
                }
            }
            (None, Some(path)) => {
                let report =
                    tokio::task::spawn_blocking(move || convert::preflight_sqlite(&path)).await??;
                convert::print_report(&report);
                if report.all_passed() {
                    Ok(())
                } else {
                    bail!("preflight del destino con fallos")
                }
            }
            _ => bail!("preflight necesita exactamente una de --from-postgres o --db"),
        },
        Some(Command::Serve) | None => serve().await,
        Some(Command::Backup { automatic }) => run_backup(automatic).await,
        Some(Command::Restore {
            file,
            password,
            confirm_target,
        }) => run_restore(&file, password.as_deref(), &confirm_target).await,
        Some(Command::Rehearse { file, password }) => {
            run_rehearse(file.as_deref(), password.as_deref()).await
        }
        Some(Command::Retention) => run_retention().await,
    }
}

/// Servicio de respaldos desde la configuración cargada.
fn backup_service(cfg: &config::Config) -> Result<backup::BackupService> {
    let path = cfg
        .backup_path
        .clone()
        .ok_or_else(|| anyhow::anyhow!("BACKUP_PATH required"))?;
    let passwords = cfg
        .backup_passwords_path_resolved()
        .ok_or_else(|| anyhow::anyhow!("BACKUP_PATH required"))?;
    Ok(backup::BackupService::new(
        path,
        passwords,
        cfg.encryption_key,
    ))
}

/// Destino configurado, para `--confirm-target` (sin secretos).
fn configured_target(cfg: &config::Config) -> String {
    match cfg.database_engine {
        logmaster_store::DatabaseEngine::Sqlite => cfg.db_path.display().to_string(),
        logmaster_store::DatabaseEngine::Postgres => cfg
            .database_url
            .clone()
            .unwrap_or_else(|| "<postgres sin cadena>".to_string()),
    }
}

async fn run_backup(automatic: bool) -> Result<()> {
    let cfg = config::Config::load()?;
    let db = Database::open(&cfg.database_config()).await?;
    db.migrate().await?;
    let service = backup_service(&cfg)?;
    let created = service.create(&db, automatic).await?;
    println!("respaldo creado: {}", created.name);
    println!(
        "archivo: {}",
        service.backup_path.join(&created.name).display()
    );
    println!("motor: {}", created.manifest.engine);
    println!("esquema: {}", created.manifest.schema_version);
    println!(
        "filas: {}",
        created
            .manifest
            .counts
            .iter()
            .map(|(table, count)| format!("{table}={count}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    if automatic {
        println!("contraseña guardada cifrada aparte (copia automática, podable)");
    } else {
        println!("contraseña de restauración (se muestra una sola vez):");
        println!("{}", created.restore_password);
    }
    Ok(())
}

async fn run_restore(file: &str, password: Option<&str>, confirm_target: &str) -> Result<()> {
    let cfg = config::Config::load()?;
    let target = configured_target(&cfg);
    if confirm_target != target {
        bail!("el destino no coincide: --confirm-target debe ser exactamente {target}");
    }
    let service = backup_service(&cfg)?;
    let owned;
    let password = match password {
        Some(password) => password,
        None => {
            owned = service.stored_password(file)?;
            &owned
        }
    };
    let prepared = service.prepare(file, password)?;
    println!(
        "respaldo verificado: {} ({} filas en total)",
        prepared.manifest.original_name,
        prepared.manifest.counts.values().sum::<u64>()
    );
    let db = Database::open(&cfg.database_config()).await?;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.6fZ")
        .to_string();
    match &db {
        Database::Sqlite(_) => {
            println!("restaurando SQLite con el servicio detenido...");
            service.restore_sqlite_file(&prepared, &cfg.db_path, &now)?;
        }
        Database::Postgres(_) => {
            println!("restaurando PostgreSQL (DROP SCHEMA + migraciones + COPY)...");
            service.restore_postgres(&db, &prepared).await?;
        }
    }
    println!("respaldo restaurado en {target}");
    Ok(())
}

async fn run_rehearse(file: Option<&str>, password: Option<&str>) -> Result<()> {
    let cfg = config::Config::load()?;
    let service = backup_service(&cfg)?;
    let name = match file {
        Some(file) => file.to_string(),
        None => {
            let listed = service.list()?;
            listed
                .first()
                .map(|(name, _)| name.clone())
                .ok_or_else(|| anyhow::anyhow!("no hay respaldos para ensayar"))?
        }
    };
    let rehearsal = service.rehearse(&name, password)?;
    println!("ensayo correcto: {}", rehearsal.name);
    println!("motor: {}", rehearsal.engine);
    println!("verificado: {}", rehearsal.verified_at);
    println!(
        "filas: {}",
        rehearsal
            .counts
            .iter()
            .map(|(table, count)| format!("{table}={count}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    Ok(())
}

async fn run_retention() -> Result<()> {
    let cfg = config::Config::load()?;
    if !cfg.retention_enabled {
        println!("aviso: la retención está desactivada en el config; se ejecuta porque se pidió explícitamente");
    }
    let db = Database::open(&cfg.database_config()).await?;
    db.migrate().await?;
    let counts = db
        .run_retention(
            true,
            cfg.retention_data_days,
            cfg.audit_retention_days,
            chrono::Utc::now(),
        )
        .await?;
    println!(
        "retención: {} registros de auditoría, {} visitas, {} visitantes, {} solicitudes",
        counts.logs, counts.visits, counts.visitors, counts.requests
    );
    Ok(())
}

/// Arranque en consola: cargar configuracion, abrir la base, aplicar
/// migraciones, verificar y solo entonces escuchar. Si algo no cuadra,
/// el proceso no abre el puerto, igual que hoy no lo hace Go.
async fn serve() -> Result<()> {
    serve_with_shutdown(shutdown_signal()).await
}

/// Abre la base configurada (SQLite o PostgreSQL), aplica las
/// migraciones del motor y verifica esquema y huellas de clave.
/// Devuelve la base y si las huellas pasaron.
async fn open_database(cfg: &config::Config) -> Result<(Database, bool)> {
    let db = Database::open(&cfg.database_config()).await?;
    db.migrate().await?;
    db.verify().await?;
    let fingerprints = db.verify_key_fingerprints(&cfg.encryption_key).await?;
    Ok((db, fingerprints))
}

/// Prueba real de conexion contra la base configurada
/// (`test_on_startup` es siempre activo: no se puede desactivar).
/// Devuelve la sonda o un error con el motivo concreto (credenciales,
/// host inalcanzable, base inexistente, TLS) para que el arranque
/// falle de forma visible, no silenciosa.
async fn probe_database(db: &Database) -> Result<logmaster_store::ConnectionProbe> {
    db.test_connection()
        .await
        .map_err(|e| anyhow::anyhow!("prueba de conexión con la base de datos fallida: {e:#}"))
}

/// Ubicacion legible de la sonda para el log y `check` (sin secretos:
/// nunca se imprime la cadena de conexion).
fn probe_location(probe: &logmaster_store::ConnectionProbe) -> String {
    match (&probe.host, &probe.port, &probe.database) {
        (Some(host), Some(port), Some(database)) => format!("{database}@{host}:{port}"),
        _ => probe
            .path
            .as_ref()
            .map(|path| path.display().to_string())
            .unwrap_or_default(),
    }
}

/// Arranque con senal de parada externa (consola: ctrl-c / SIGTERM;
/// servicio de Windows: Stop del SCM).
pub(crate) async fn serve_with_shutdown<S>(shutdown: S) -> Result<()>
where
    S: std::future::Future<Output = ()> + Send + 'static,
{
    let cfg = config::Config::load()?;
    // `load()` rechaza `test_on_startup = false`: la sonda siempre
    // corre al arrancar, por diseño.
    debug_assert!(cfg.test_connection_on_startup);
    // Primer arranque: si el .exe no está en C: se ofrece copiarlo
    // allí (con el config.toml); si se copió, se termina indicando
    // que se ejecute desde la nueva ubicación.
    if let first_run::FirstRunOutcome::Relocated(target) = first_run::ensure_first_run(&cfg)? {
        println!("LogMaster se copió a {}.", target.display());
        println!("Ejecuta {} para arrancar.", target.display());
        return Ok(());
    }
    let (db, fingerprints) = open_database(&cfg).await?;
    match fingerprints {
        true => tracing::info!("huellas de clave de los indices verificadas"),
        false => tracing::warn!(
            "indices de identidad/busqueda sin preparar (reindex pendiente para una fase posterior); se arranca igual"
        ),
    }
    let probe = probe_database(&db).await?;
    tracing::info!(
        engine = probe.engine,
        base = %probe_location(&probe),
        version = %probe.version,
        latency_ms = probe.latency_ms,
        schema_version = probe.schema_version,
        "base de datos verificada"
    );
    let app = http::build_router(db, &cfg);
    let listener = tokio::net::TcpListener::bind(cfg.addr()).await?;
    tracing::info!(addr = %cfg.addr(), "logmaster escuchando");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown)
    .await?;
    Ok(())
}

/// `check`: version de esquema, conectividad e integridad, con la
/// prueba real de conexion del motor configurado. Forma parte del
/// arranque y del healthcheck, como en Go.
async fn check() -> Result<()> {
    let cfg = config::Config::load()?;
    let (db, fingerprints) = open_database(&cfg).await?;
    let probe = probe_database(&db).await?;
    println!("logmaster {}", env!("CARGO_PKG_VERSION"));
    if let Some(path) = &cfg.config_path {
        println!("config: {}", path.display());
    }
    println!("motor: {}", probe.engine);
    println!("base: {}", probe_location(&probe));
    println!("versión: {}", probe.version);
    println!("latencia: {} ms", probe.latency_ms);
    println!("esquema: {}", probe.schema_version);
    println!("integridad: ok");
    if fingerprints {
        println!("huellas de clave: ok");
    } else {
        println!("huellas de clave: pendientes (indices sin preparar)");
    }
    println!("estado: ok");
    Ok(())
}

/// `migrate`: aplica migraciones pendientes de forma explicita, en el
/// motor configurado.
async fn migrate() -> Result<()> {
    let cfg = config::Config::load()?;
    let db = Database::open(&cfg.database_config()).await?;
    db.migrate().await?;
    let probe = probe_database(&db).await?;
    println!(
        "migraciones al dia: {} {}",
        probe.engine,
        probe_location(&probe)
    );
    Ok(())
}

/// Senal de apagado en consola: ctrl-c, y SIGTERM en Unix.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("instalar handler de ctrl-c");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("instalar handler de SIGTERM")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
