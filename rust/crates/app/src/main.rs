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
//! ```

mod config;
mod error;
mod http;
mod service;

use anyhow::Result;
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
    let app = http::build_router(store);
    let listener = tokio::net::TcpListener::bind(cfg.addr()).await?;
    tracing::info!(addr = %cfg.addr(), "logmaster escuchando");
    axum::serve(listener, app)
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
    println!("logmaster {}", env!("CARGO_PKG_VERSION"));
    println!("base: {}", cfg.db_path.display());
    println!("integridad: ok");
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
