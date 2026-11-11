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
//! ```
//!
//! `convert` y `preflight` son operaciones síncronas de una sola vez
//! (el cliente de PostgreSQL es síncrono): corren en un hilo de
//! bloqueo para no detener el runtime de Tokio.

mod client_ip;
mod config;
mod convert;
mod cookies;
mod error;
mod http;
mod origin;
mod rate_limit;
mod roles;
mod service;
mod session;

use std::path::PathBuf;

use anyhow::{bail, Result};
use clap::{Parser, Subcommand};
use logmaster_store::Store;

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
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let cli = Cli::parse();
    match cli.command {
        Some(Command::Service { action }) => service::run_action(action),
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
    }
}

/// Arranque en consola: cargar configuracion, abrir la base, aplicar
/// migraciones, verificar y solo entonces escuchar. Si algo no cuadra,
/// el proceso no abre el puerto, igual que hoy no lo hace Go.
async fn serve() -> Result<()> {
    serve_with_shutdown(shutdown_signal()).await
}

/// Arranque con senal de parada externa (consola: ctrl-c / SIGTERM;
/// servicio de Windows: Stop del SCM).
pub(crate) async fn serve_with_shutdown<S>(shutdown: S) -> Result<()>
where
    S: std::future::Future<Output = ()> + Send + 'static,
{
    let cfg = config::Config::load()?;
    let store = Store::open(&cfg.db_path)?;
    store.migrate()?;
    store.verify()?;
    match store.verify_key_fingerprints(&cfg.encryption_key)? {
        true => tracing::info!("huellas de clave de los indices verificadas"),
        false => tracing::warn!(
            "indices de identidad/busqueda sin preparar (reindex en fase 6); se arranca igual"
        ),
    }
    let app = http::build_router(store, &cfg);
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

/// `check`: version de esquema, conectividad e integridad. Forma parte
/// del arranque y del healthcheck, como en Go.
async fn check() -> Result<()> {
    let cfg = config::Config::load()?;
    let store = Store::open(&cfg.db_path)?;
    store.migrate()?;
    store.verify()?;
    let fingerprints = store.verify_key_fingerprints(&cfg.encryption_key)?;
    println!("logmaster {}", env!("CARGO_PKG_VERSION"));
    println!("base: {}", cfg.db_path.display());
    println!("integridad: ok");
    if fingerprints {
        println!("huellas de clave: ok");
    } else {
        println!("huellas de clave: pendientes (indices sin preparar)");
    }
    println!("estado: ok");
    Ok(())
}

/// `migrate`: aplica migraciones pendientes de forma explicita.
async fn migrate() -> Result<()> {
    let cfg = config::Config::load()?;
    let store = Store::open(&cfg.db_path)?;
    store.migrate()?;
    println!("migraciones al dia: {}", cfg.db_path.display());
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
