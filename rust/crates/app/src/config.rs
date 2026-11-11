//! Configuracion del ejecutable.
//!
//! Documento de migracion, secciones 15 y 18: el contrato actual son
//! unas 25 variables; en el ejecutable unico se consolidan en un
//! `config.toml` junto al .exe (esta fase lo introduce para la base
//! de datos y el servidor). Precedencia: **entorno > config.toml >
//! valores por defecto**. Los secretos y limites se leen del entorno
//! con los mismos nombres actuales que Go
//! (`server-go/internal/config/config.go`), con los mismos valores por
//! defecto y las mismas validaciones.
//!
//! El archivo es `config.toml` junto a `logmaster.exe` (por ejemplo
//! `C:\LogMaster\config.toml`); `LOGMASTER_CONFIG` fija otra ruta.
//! Si no existe junto al .exe, el arranque crea uno a partir del
//! ejemplo del repo (`rust/config.example.toml`) y avisa dónde lo
//! dejó. Las actualizaciones nunca lo pisan: el repo solo lleva el
//! ejemplo, y el ejecutable solo crea el archivo cuando falta.
//! Los secretos (`JWT_SECRET`, `ENCRYPTION_KEY`, `EDIT_PASSWORD`,
//! ...) **nunca** van en ese archivo: si `[security]` trae alguno,
//! se avisa y se ignora.
//!
//! - `JWT_SECRET` (>= 32 bytes) y `JWT_REFRESH_SECRET` (independiente;
//!   si esta vacio se deriva como el SHA-256 en hex de
//!   `JWT_SECRET + ":refresh"`, igual que Go).
//! - `ENCRYPTION_KEY` (o su alias `PII_ENCRYPTION_KEY`), 32 bytes en
//!   hexadecimal.
//! - `EDIT_PASSWORD` (obligatoria; si empieza por `$2` se verifica con
//!   bcrypt, si no por comparacion en tiempo constante — ver
//!   `session::valid_edit_password`).
//! - `JWT_ACCESS_EXPIRATION` (por defecto 15 min) y
//!   `JWT_REFRESH_EXPIRATION` (por defecto 7 dias). Aceptan el sufijo
//!   `d` de Go (dias) y duraciones estilo Go (`15m`, `1h30m`, `500ms`).
//!   En `config.toml` son `[session] access_minutes` y `refresh_days`.
//! - `MAX_LOGIN_ATTEMPTS` (5), `LOCKOUT_DURATION_MINUTES` (15),
//!   `RATE_LIMIT_WINDOW_MS` (60000) y `RATE_LIMIT_MAX_REQUESTS` (100).
//! - `APP_URL`: origen publico de la aplicacion, contra el que se
//!   valida `Origin`/`Referer` en las escrituras. Por defecto
//!   `https://localhost:8443` (el BFF usaba `https://localhost:5173`,
//!   el origen de Next; aqui ya no hay Next y el origen es el propio
//!   servidor). `CORS_ORIGINS` anade origenes permitidos adicionales.
//! - `TRUSTED_PROXY_CIDRS`: lista de CIDR de proxies de confianza para
//!   `X-Forwarded-For` (ver `client_ip`).
//! - Base de datos (`[database]` en `config.toml`, o entorno):
//!   `engine` (`sqlite` por defecto, o `postgres`), `path` del
//!   SQLite, `url` de PostgreSQL (formato URL
//!   `postgres://usuario:clave@host:5432/base`, sin TLS) y
//!   `test_on_startup` (siempre activo: la prueba de conexión al
//!   arrancar no se puede desactivar; ver `database.rs`).

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, bail, Result};
use logmaster_crypto::load_key_from_env;
use logmaster_store::{DatabaseConfig, DatabaseEngine};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::client_ip::TrustedPrefix;

/// Candado compartido por las pruebas que mutan variables de entorno
/// en este binario (tambien lo usa `convert.rs`): las pruebas corren
/// en paralelo en el mismo proceso y sin el se pisarian las variables.
#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

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
    /// Motor de base de datos elegido (`sqlite` por defecto).
    pub database_engine: DatabaseEngine,
    /// Cadena de conexión PostgreSQL en formato URL, si el motor es
    /// `postgres` (`postgres://usuario:clave@host:5432/base`).
    pub database_url: Option<String>,
    /// La prueba de conexión al arrancar es obligatoria (siempre
    /// activa): este campo solo refleja `test_on_startup` del
    /// archivo, que no admite `false`.
    pub test_connection_on_startup: bool,
    /// Carpeta de instalación en disco C: (`[install] folder`).
    pub install_folder: String,
    /// Crear el acceso directo del escritorio (`[install]
    /// desktop_shortcut`).
    pub desktop_shortcut: bool,
    /// Ruta del `config.toml` usado (o creado junto al .exe), si lo
    /// hay.
    pub config_path: Option<PathBuf>,
    /// Secreto HS256 del token de acceso (minimo 32 bytes).
    pub jwt_secret: String,
    /// Secreto HS256 del token de renovacion (independiente del de
    /// acceso; derivado si no se configura).
    pub refresh_secret: String,
    /// Clave de datos AES-256-GCM (32 bytes).
    pub encryption_key: [u8; 32],
    /// Contrasena de edicion (EDIT_PASSWORD).
    pub edit_password: String,
    /// Duracion del token de acceso (por defecto 15 minutos).
    pub access_ttl: Duration,
    /// Duracion del token de renovacion (por defecto 7 dias).
    pub refresh_ttl: Duration,
    /// Maximo absoluto de una sesion desde su inicio (7 dias, como Go).
    pub absolute_session_ttl: Duration,
    /// Intentos de login antes del bloqueo (por defecto 5). Lo usa el
    /// handler de login de la fase 4.
    #[allow(dead_code)]
    pub max_login_attempts: i64,
    /// Minutos de bloqueo tras agotar los intentos (por defecto 15).
    /// Lo usa el handler de login de la fase 4.
    #[allow(dead_code)]
    pub lockout_minutes: i64,
    /// Ventana del limite general, en milisegundos (por defecto 60000).
    pub rate_window_ms: u64,
    /// Maximo de peticiones del limite general por ventana (por
    /// defecto 100).
    pub rate_max_requests: u32,
    /// Origen publico de la aplicacion (APP_URL).
    pub app_url: String,
    /// Origenes adicionales permitidos (CORS_ORIGINS).
    pub cors_origins: Vec<String>,
    /// Proxies de confianza para X-Forwarded-For.
    pub trusted_proxies: Vec<TrustedPrefix>,
}

impl Config {
    pub fn load() -> Result<Self> {
        let (file, config_path) = load_config_file();
        let file = file.unwrap_or_default();
        if file.security.has_secrets() {
            tracing::warn!(
                "los secretos en config.toml se ignoran: usen variables de entorno o el archivo de secretos (DPAPI)"
            );
        }
        if file.has_future_sections() {
            tracing::info!(
                "las secciones [mail], [retention] y [backup] de config.toml aún no tienen efecto (fase 6)"
            );
        }

        let bind = std::env::var("LOGMASTER_BIND")
            .ok()
            .filter(|v| !v.is_empty())
            .or(file.server.bind)
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let port = std::env::var("LOGMASTER_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .or(file.server.port)
            .unwrap_or(8443);
        let db_path = std::env::var("LOGMASTER_DB_PATH")
            .map(PathBuf::from)
            .ok()
            .filter(|p| !p.as_os_str().is_empty())
            .or(file.database.path.map(PathBuf::from))
            .unwrap_or_else(default_db_path);
        let database_engine = match std::env::var("LOGMASTER_DATABASE").ok() {
            Some(value) if !value.is_empty() => DatabaseEngine::parse(&value)?,
            _ => match file.database.engine.as_deref() {
                Some(value) => DatabaseEngine::parse(value)?,
                None => DatabaseEngine::Sqlite,
            },
        };
        let database_url = std::env::var("DATABASE_URL")
            .ok()
            .filter(|v| !v.is_empty())
            .or(file.database.url);
        // La prueba de conexión al arrancar es obligatoria: el
        // ejemplo la trae en `true` y `false` es un error de
        // configuración, no una opción silenciosa.
        if file.database.test_on_startup == Some(false) {
            bail!("test_on_startup no se puede desactivar: la validación de la conexión al arrancar es obligatoria");
        }
        let test_connection_on_startup = true;
        if database_engine == DatabaseEngine::Postgres && database_url.is_none() {
            bail!(
                "database = \"postgres\" necesita una cadena de conexión: [database] url en config.toml o DATABASE_URL"
            );
        }

        let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_default();
        if jwt_secret.len() < 32 {
            bail!("JWT_SECRET must contain at least 32 bytes");
        }
        let refresh_secret = match std::env::var("JWT_REFRESH_SECRET").ok() {
            Some(secret) if !secret.is_empty() => secret,
            _ => {
                let mut hasher = Sha256::new();
                hasher.update(format!("{jwt_secret}:refresh").as_bytes());
                hex::encode(hasher.finalize())
            }
        };
        if refresh_secret.len() < 32 || refresh_secret == jwt_secret {
            bail!("JWT_REFRESH_SECRET must be independent and at least 32 bytes");
        }
        let encryption_key = load_key_from_env().map_err(|e| anyhow!(e))?;
        let edit_password = std::env::var("EDIT_PASSWORD").unwrap_or_default();
        if edit_password.is_empty() {
            bail!("EDIT_PASSWORD is required");
        }
        let access_ttl = match std::env::var("JWT_ACCESS_EXPIRATION").ok() {
            Some(raw) if !raw.is_empty() => parse_duration(&raw, Duration::from_secs(15 * 60))?,
            _ => match file.session.access_minutes {
                Some(minutes) => Duration::from_secs(minutes * 60),
                None => Duration::from_secs(15 * 60),
            },
        };
        let refresh_ttl = match std::env::var("JWT_REFRESH_EXPIRATION").ok() {
            Some(raw) if !raw.is_empty() => {
                parse_duration(&raw, Duration::from_secs(7 * 24 * 3600))?
            }
            _ => match file.session.refresh_days {
                Some(days) => Duration::from_secs(days * 24 * 3600),
                None => Duration::from_secs(7 * 24 * 3600),
            },
        };
        let max_login_attempts = parse_int_env("MAX_LOGIN_ATTEMPTS", 5)?;
        let lockout_minutes = parse_int_env("LOCKOUT_DURATION_MINUTES", 15)?;
        let rate_window_ms = parse_int_env("RATE_LIMIT_WINDOW_MS", 60_000)? as u64;
        let rate_max_requests = parse_int_env("RATE_LIMIT_MAX_REQUESTS", 100)? as u32;
        let app_url = std::env::var("APP_URL")
            .ok()
            .filter(|v| !v.is_empty())
            .or(file.server.app_url)
            .unwrap_or_else(|| "https://localhost:8443".to_string());
        let cors_origins = std::env::var("CORS_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect();
        let mut trusted_proxies = Vec::new();
        for entry in std::env::var("TRUSTED_PROXY_CIDRS")
            .unwrap_or_default()
            .split(',')
        {
            let entry = entry.trim();
            if entry.is_empty() {
                continue;
            }
            trusted_proxies.push(
                entry
                    .parse::<TrustedPrefix>()
                    .map_err(|_| anyhow!("invalid trusted proxy CIDR"))?,
            );
        }

        let install_folder = file
            .install
            .folder
            .unwrap_or_else(|| r"C:\LogMaster".to_string());
        let desktop_shortcut = file.install.desktop_shortcut.unwrap_or(true);

        Ok(Self {
            bind,
            port,
            db_path,
            database_engine,
            database_url,
            test_connection_on_startup,
            install_folder,
            desktop_shortcut,
            config_path,
            jwt_secret,
            refresh_secret,
            encryption_key,
            edit_password,
            access_ttl,
            refresh_ttl,
            absolute_session_ttl: Duration::from_secs(7 * 24 * 3600),
            max_login_attempts,
            lockout_minutes,
            rate_window_ms,
            rate_max_requests,
            app_url,
            cors_origins,
            trusted_proxies,
        })
    }

    /// `bind:port` para el listener de Tokio.
    pub fn addr(&self) -> String {
        format!("{}:{}", self.bind, self.port)
    }

    /// Origenes permitidos para `Origin`/`Referer` y CORS: el origen
    /// de la aplicacion mas los adicionales configurados.
    pub fn allowed_origins(&self) -> Vec<String> {
        let mut origins = vec![self.app_url.clone()];
        origins.extend(self.cors_origins.iter().cloned());
        origins
    }

    /// Configuración para abrir la base con el motor elegido.
    pub fn database_config(&self) -> DatabaseConfig {
        DatabaseConfig {
            engine: self.database_engine,
            sqlite_path: self.db_path.clone(),
            postgres_url: self.database_url.clone(),
        }
    }
}

/// Ejemplo incrustado (`rust/config.example.toml`).
const CONFIG_EXAMPLE: &str = include_str!("../../../config.example.toml");

/// Contenido de `config.toml`. Los secretos no se leen de aquí nunca
/// (ver `FileSecurity`); las secciones de correo, retención y
/// respaldo se parsean para avisar que aún no tienen efecto (fase 6).
/// Un campo desconocido es un error: un typo en la configuración no
/// debe pasar en silencio.
#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileConfig {
    server: FileServer,
    database: FileDatabase,
    session: FileSession,
    security: FileSecurity,
    mail: FileMail,
    retention: FileRetention,
    backup: FileBackup,
    install: FileInstall,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileServer {
    bind: Option<String>,
    port: Option<u16>,
    app_url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileDatabase {
    engine: Option<String>,
    path: Option<String>,
    url: Option<String>,
    test_on_startup: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileSession {
    access_minutes: Option<u64>,
    refresh_days: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileSecurity {
    jwt_secret: Option<String>,
    jwt_refresh_secret: Option<String>,
    encryption_key: Option<String>,
    edit_password: Option<String>,
}

impl FileSecurity {
    fn has_secrets(&self) -> bool {
        self.jwt_secret.is_some()
            || self.jwt_refresh_secret.is_some()
            || self.encryption_key.is_some()
            || self.edit_password.is_some()
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileMail {
    host: Option<String>,
    port: Option<u16>,
    from: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileRetention {
    enabled: Option<bool>,
    run_at: Option<String>,
    data_days: Option<u64>,
    audit_days: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileBackup {
    path: Option<String>,
    keep: Option<u32>,
    daily_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct FileInstall {
    folder: Option<String>,
    desktop_shortcut: Option<bool>,
}

impl FileConfig {
    fn has_future_sections(&self) -> bool {
        self.mail.host.is_some()
            || self.mail.port.is_some()
            || self.mail.from.is_some()
            || self.retention.enabled.is_some()
            || self.retention.run_at.is_some()
            || self.retention.data_days.is_some()
            || self.retention.audit_days.is_some()
            || self.backup.path.is_some()
            || self.backup.keep.is_some()
            || self.backup.daily_at.is_some()
    }
}

/// Localiza el `config.toml` y lo parsea. Devuelve el contenido y
/// la ruta usada (o creada).
///
/// Orden: `LOGMASTER_CONFIG` si está definida; si no, junto al
/// ejecutable; si no, en el directorio de trabajo. Si no existe en
/// ningún sitio, se crea junto al ejecutable a partir del ejemplo
/// del repo (nunca se pisa uno existente; si no se puede crear, se
/// avisa y se sigue solo con entorno y valores por defecto).
fn load_config_file() -> (Option<FileConfig>, Option<PathBuf>) {
    let explicit = std::env::var("LOGMASTER_CONFIG")
        .ok()
        .filter(|v| !v.is_empty())
        .map(PathBuf::from);
    if let Some(path) = explicit {
        return (read_or_create_config(&path), Some(path));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let path = dir.join("config.toml");
            if path.exists() {
                return (read_config(&path), Some(path));
            }
            if let Some(cwd) = std::env::current_dir()
                .ok()
                .map(|cwd| cwd.join("config.toml"))
                .filter(|p| p.exists())
            {
                return (read_config(&cwd), Some(cwd));
            }
            // Primera ejecución: crear junto al .exe desde el ejemplo.
            return (read_or_create_config(&path), Some(path));
        }
    }
    (None, None)
}

/// Lee un `config.toml`. Si no existe, intenta crearlo desde el
/// ejemplo; si no se puede crear o parsear, avisa y devuelve `None`.
fn read_or_create_config(path: &PathBuf) -> Option<FileConfig> {
    if !path.exists() {
        match std::fs::write(path, CONFIG_EXAMPLE) {
            Ok(()) => {
                tracing::info!(
                    path = %path.display(),
                    "config.toml creado a partir del ejemplo; revíselo antes de personalizarlo"
                );
            }
            Err(e) => {
                tracing::warn!(
                    path = %path.display(),
                    error = %e,
                    "no se pudo crear config.toml junto al .exe; se sigue solo con entorno y valores por defecto"
                );
                return None;
            }
        }
    }
    read_config(path)
}

fn read_config(path: &PathBuf) -> Option<FileConfig> {
    match std::fs::read_to_string(path) {
        Ok(text) => match toml::from_str::<FileConfig>(&text) {
            Ok(file) => Some(file),
            Err(e) => {
                tracing::warn!(
                    path = %path.display(),
                    error = %e,
                    "config.toml inválido; se sigue solo con entorno y valores por defecto"
                );
                None
            }
        },
        Err(e) => {
            tracing::warn!(
                path = %path.display(),
                error = %e,
                "no se pudo leer config.toml; se sigue solo con entorno y valores por defecto"
            );
            None
        }
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

/// Entero de entorno con valor por defecto, validado como Go
/// (1..=10_000_000).
fn parse_int_env(key: &str, fallback: i64) -> Result<i64> {
    match std::env::var(key).ok() {
        Some(raw) if !raw.is_empty() => {
            let value: i64 = raw.parse().map_err(|_| anyhow!("invalid {key}"))?;
            if !(1..=10_000_000).contains(&value) {
                bail!("invalid {key}");
            }
            Ok(value)
        }
        _ => Ok(fallback),
    }
}

/// Duracion estilo Go, como `config.duration` de Go.
///
/// - Vacia: el valor por defecto.
/// - Sufijo `d`: dias enteros (1..=3650).
/// - Resto: duracion de Go (`15m`, `1h30m`, `90s`, `500ms`, ...),
///   con unidades `ns`, `us`/`µs`/`μs`, `ms`, `s`, `m` y `h`.
///   Debe ser mayor que cero.
pub fn parse_duration(raw: &str, fallback: Duration) -> Result<Duration> {
    if raw.is_empty() {
        return Ok(fallback);
    }
    if let Some(days) = raw.strip_suffix('d') {
        let value: u64 = days
            .parse()
            .map_err(|_| anyhow!("invalid token duration"))?;
        if !(1..=3650).contains(&value) {
            bail!("invalid token duration");
        }
        return Ok(Duration::from_secs(value * 24 * 3600));
    }
    let mut total_nanos: u128 = 0;
    let mut rest = raw;
    let mut any = false;
    while !rest.is_empty() {
        let digits_end = rest
            .find(|c: char| !c.is_ascii_digit() && c != '.')
            .unwrap_or(rest.len());
        if digits_end == 0 {
            bail!("invalid token duration");
        }
        let number: f64 = rest[..digits_end]
            .parse()
            .map_err(|_| anyhow!("invalid token duration"))?;
        rest = &rest[digits_end..];
        let unit_end = rest
            .find(|c: char| c.is_ascii_digit())
            .unwrap_or(rest.len());
        if unit_end == 0 {
            bail!("invalid token duration");
        }
        let unit = &rest[..unit_end];
        rest = &rest[unit_end..];
        let nanos_per_unit: f64 = match unit {
            "ns" => 1.0,
            "us" | "µs" | "μs" => 1_000.0,
            "ms" => 1_000_000.0,
            "s" => 1_000_000_000.0,
            "m" => 60_000_000_000.0,
            "h" => 3_600_000_000_000.0,
            _ => bail!("invalid token duration"),
        };
        total_nanos += (number * nanos_per_unit) as u128;
        any = true;
    }
    if !any || total_nanos == 0 {
        bail!("invalid token duration");
    }
    Ok(Duration::from_nanos(
        total_nanos.min(u64::MAX as u128) as u64
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ENV_LOCK;

    // Las pruebas de variables de entorno comparten el proceso: se
    // serializan con el candado compartido de `config.rs`.

    const SECRET_64: &str = "ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss";
    const KEY_HEX: &str = "1919191919191919191919191919191919191919191919191919191919191919";

    const VARS: &[&str] = &[
        "LOGMASTER_BIND",
        "LOGMASTER_PORT",
        "LOGMASTER_DB_PATH",
        "LOGMASTER_DATABASE",
        "LOGMASTER_CONFIG",
        "DATABASE_URL",
        "JWT_SECRET",
        "JWT_REFRESH_SECRET",
        "ENCRYPTION_KEY",
        "PII_ENCRYPTION_KEY",
        "EDIT_PASSWORD",
        "JWT_ACCESS_EXPIRATION",
        "JWT_REFRESH_EXPIRATION",
        "MAX_LOGIN_ATTEMPTS",
        "LOCKOUT_DURATION_MINUTES",
        "RATE_LIMIT_WINDOW_MS",
        "RATE_LIMIT_MAX_REQUESTS",
        "APP_URL",
        "CORS_ORIGINS",
        "TRUSTED_PROXY_CIDRS",
    ];

    fn with_env(vars: &[(&str, Option<&str>)], f: impl FnOnce()) {
        // Si un test anterior entró en pánico con el candado tomado,
        // se recupera en vez de envenenar toda la suite.
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let saved: Vec<(String, Option<String>)> = VARS
            .iter()
            .map(|k| (k.to_string(), std::env::var(k).ok()))
            .collect();
        for k in VARS {
            std::env::remove_var(k);
        }
        for (k, v) in vars {
            match v {
                Some(value) => std::env::set_var(k, value),
                None => std::env::remove_var(k),
            }
        }
        f();
        for k in VARS {
            std::env::remove_var(k);
        }
        for (k, v) in saved {
            if let Some(value) = v {
                std::env::set_var(k, value);
            }
        }
    }

    fn base_vars() -> Vec<(&'static str, Option<&'static str>)> {
        vec![
            ("JWT_SECRET", Some(SECRET_64)),
            ("ENCRYPTION_KEY", Some(KEY_HEX)),
            ("EDIT_PASSWORD", Some("fixture-edit-password")),
        ]
    }

    #[test]
    fn parse_duration_matches_go() {
        let fallback = Duration::from_secs(900);
        assert_eq!(parse_duration("", fallback).unwrap(), fallback);
        assert_eq!(
            parse_duration("15m", fallback).unwrap(),
            Duration::from_secs(900)
        );
        assert_eq!(
            parse_duration("7d", fallback).unwrap(),
            Duration::from_secs(7 * 24 * 3600)
        );
        assert_eq!(
            parse_duration("1h30m", fallback).unwrap(),
            Duration::from_secs(5400)
        );
        assert_eq!(
            parse_duration("500ms", fallback).unwrap(),
            Duration::from_millis(500)
        );
        for bad in ["0m", "999999999999d", "0d", "tru", "15x", "m", "-5m"] {
            assert!(parse_duration(bad, fallback).is_err(), "{bad} debe fallar");
        }
    }

    #[test]
    fn load_defaults_and_derived_refresh_secret() {
        with_env(&base_vars(), || {
            let cfg = Config::load().unwrap();
            assert_eq!(cfg.access_ttl, Duration::from_secs(15 * 60));
            assert_eq!(cfg.refresh_ttl, Duration::from_secs(7 * 24 * 3600));
            assert_eq!(cfg.max_login_attempts, 5);
            assert_eq!(cfg.lockout_minutes, 15);
            assert_eq!(cfg.rate_window_ms, 60_000);
            assert_eq!(cfg.rate_max_requests, 100);
            assert_eq!(cfg.encryption_key, [0x19u8; 32]);
            assert_ne!(cfg.refresh_secret, cfg.jwt_secret);
            assert!(cfg.refresh_secret.len() >= 32);
            assert_eq!(cfg.app_url, "https://localhost:8443");
        });
    }

    #[test]
    fn load_rejects_bad_secrets() {
        // JWT_SECRET corto.
        with_env(
            &[
                ("JWT_SECRET", Some("short")),
                ("ENCRYPTION_KEY", Some(KEY_HEX)),
                ("EDIT_PASSWORD", Some("fixture-edit-password")),
            ],
            || assert!(Config::load().is_err()),
        );
        // Refresh igual al de acceso.
        with_env(
            &[
                ("JWT_SECRET", Some(SECRET_64)),
                ("JWT_REFRESH_SECRET", Some(SECRET_64)),
                ("ENCRYPTION_KEY", Some(KEY_HEX)),
                ("EDIT_PASSWORD", Some("fixture-edit-password")),
            ],
            || assert!(Config::load().is_err()),
        );
        // Clave de datos mala y EDIT_PASSWORD vacia.
        with_env(
            &[
                ("JWT_SECRET", Some(SECRET_64)),
                ("ENCRYPTION_KEY", Some("bad")),
                ("EDIT_PASSWORD", Some("fixture-edit-password")),
            ],
            || assert!(Config::load().is_err()),
        );
        with_env(
            &[
                ("JWT_SECRET", Some(SECRET_64)),
                ("ENCRYPTION_KEY", Some(KEY_HEX)),
                ("EDIT_PASSWORD", Some("")),
            ],
            || assert!(Config::load().is_err()),
        );
        // Duraciones invalidas.
        with_env(
            &[
                ("JWT_SECRET", Some(SECRET_64)),
                ("ENCRYPTION_KEY", Some(KEY_HEX)),
                ("EDIT_PASSWORD", Some("fixture-edit-password")),
                ("JWT_ACCESS_EXPIRATION", Some("0m")),
            ],
            || assert!(Config::load().is_err()),
        );
    }

    #[test]
    fn load_from_toml_file() {
        let dir = std::env::temp_dir().join("logmaster-config-test-load");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        std::fs::write(
            &path,
            r#"
[server]
bind = "0.0.0.0"
port = 9443
app_url = "https://example.test:9443"

[database]
engine = "postgres"
url = "postgres://logmaster_runtime:clave@127.0.0.1:5432/logmaster"
test_on_startup = true

[session]
access_minutes = 30
refresh_days = 3

[install]
folder = "D:\\LogMaster"
desktop_shortcut = false
"#,
        )
        .unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mut vars = base_vars();
        vars.push((
            "LOGMASTER_CONFIG",
            Some(Box::leak(path_str.into_boxed_str()) as &'static str),
        ));
        with_env(&vars, || {
            let cfg = Config::load().unwrap();
            assert_eq!(cfg.bind, "0.0.0.0");
            assert_eq!(cfg.port, 9443);
            assert_eq!(cfg.app_url, "https://example.test:9443");
            assert_eq!(
                cfg.database_engine,
                logmaster_store::DatabaseEngine::Postgres
            );
            assert_eq!(
                cfg.database_url.as_deref(),
                Some("postgres://logmaster_runtime:clave@127.0.0.1:5432/logmaster")
            );
            assert!(cfg.test_connection_on_startup);
            assert_eq!(cfg.access_ttl, Duration::from_secs(30 * 60));
            assert_eq!(cfg.refresh_ttl, Duration::from_secs(3 * 24 * 3600));
            assert_eq!(cfg.install_folder, "D:\\LogMaster");
            assert!(!cfg.desktop_shortcut);
            assert_eq!(cfg.config_path.as_deref(), Some(path.as_path()));
        });
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn load_env_overrides_toml() {
        let dir = std::env::temp_dir().join("logmaster-config-test-override");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        std::fs::write(
            &path,
            "[database]\nengine = \"postgres\"\nurl = \"postgres://u:p@127.0.0.1:5432/db\"\n",
        )
        .unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mut vars = base_vars();
        vars.push((
            "LOGMASTER_CONFIG",
            Some(Box::leak(path_str.into_boxed_str()) as &'static str),
        ));
        vars.push(("LOGMASTER_DATABASE", Some("sqlite")));
        vars.push(("DATABASE_URL", None));
        with_env(&vars, || {
            let cfg = Config::load().unwrap();
            assert_eq!(cfg.database_engine, logmaster_store::DatabaseEngine::Sqlite);
            // Sin DATABASE_URL en el entorno, manda la del archivo.
            assert_eq!(
                cfg.database_url.as_deref(),
                Some("postgres://u:p@127.0.0.1:5432/db")
            );
        });
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn load_rejects_disabled_test_on_startup() {
        let dir = std::env::temp_dir().join("logmaster-config-test-notest");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        std::fs::write(&path, "[database]\ntest_on_startup = false\n").unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mut vars = base_vars();
        vars.push((
            "LOGMASTER_CONFIG",
            Some(Box::leak(path_str.into_boxed_str()) as &'static str),
        ));
        with_env(&vars, || assert!(Config::load().is_err()));
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn load_rejects_postgres_without_url() {
        let dir = std::env::temp_dir().join("logmaster-config-test-nourl");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        std::fs::write(&path, "[database]\nengine = \"postgres\"\n").unwrap();
        let path_str = path.to_string_lossy().to_string();
        let mut vars = base_vars();
        vars.push((
            "LOGMASTER_CONFIG",
            Some(Box::leak(path_str.into_boxed_str()) as &'static str),
        ));
        with_env(&vars, || assert!(Config::load().is_err()));
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn load_ignores_secrets_in_toml() {
        // El secreto en el archivo no vale: sin JWT_SECRET en el
        // entorno, la carga debe fallar igual.
        let dir = std::env::temp_dir().join("logmaster-config-test-secrets");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        std::fs::write(
            &path,
            "[security]\njwt_secret = \"ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss\"\n",
        )
        .unwrap();
        let path_str = path.to_string_lossy().to_string();
        with_env(
            &[
                (
                    "LOGMASTER_CONFIG",
                    Some(Box::leak(path_str.into_boxed_str()) as &'static str),
                ),
                ("JWT_SECRET", None),
                ("ENCRYPTION_KEY", Some(KEY_HEX)),
                ("EDIT_PASSWORD", Some("fixture-edit-password")),
            ],
            || assert!(Config::load().is_err()),
        );
        std::fs::remove_file(&path).unwrap();
    }
}
