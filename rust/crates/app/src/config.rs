//! Configuracion del ejecutable.
//!
//! Documento de migracion, seccion 15: el contrato actual son unas 25
//! variables; en el ejecutable unico se consolidan en un `config.toml`.
//! En este esqueleto (fases 0/1) solo existen los valores por defecto y
//! las anulaciones por entorno con los mismos nombres actuales cuando el
//! significado coincide. El `config.toml`, los secretos con DPAPI y la
//! semilla llegan con las fases siguientes.

use std::path::PathBuf;

/// Configuracion efectiva del proceso.
#[derive(Debug, Clone)]
pub struct Config {
    /// Interfaz de escucha. Por defecto solo la misma maquina.
    pub bind: String,
    /// Puerto. Por defecto 8443, como el HTTPS actual (en el esqueleto
    /// es HTTP plano; el TLS con rustls llega con el endurecimiento).
    pub port: u16,
    /// Archivo de la base SQLite.
    pub db_path: PathBuf,
    /// Sesion: minutos de acceso (hoy 15) y dias de renovacion (hoy 7).
    /// Se leen en la fase 3 (JWT y cookies); el esqueleto solo fija
    /// los valores por defecto del contrato actual.
    #[allow(dead_code)]
    pub access_minutes: u64,
    #[allow(dead_code)]
    pub refresh_days: u64,
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let bind = std::env::var("LOGMASTER_BIND").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = std::env::var("LOGMASTER_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8443);
        let db_path = std::env::var("LOGMASTER_DB_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| default_db_path());
        Ok(Self {
            bind,
            port,
            db_path,
            access_minutes: 15,
            refresh_days: 7,
        })
    }

    /// `bind:port` para el listener de Tokio.
    pub fn addr(&self) -> String {
        format!("{}:{}", self.bind, self.port)
    }
}

/// Ruta por defecto de la base. En Windows, ProgramData (nunca junto al
/// .exe y nunca en la carpeta del usuario: el servicio arranca sin
/// sesion). En desarrollo, `data/logmaster.db` junto al trabajo actual.
#[cfg(windows)]
fn default_db_path() -> PathBuf {
    let program_data =
        std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    PathBuf::from(program_data)
        .join("LogMaster")
        .join("data")
        .join("logmaster.db")
}

#[cfg(not(windows))]
fn default_db_path() -> PathBuf {
    PathBuf::from("data").join("logmaster.db")
}
