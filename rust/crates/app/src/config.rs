//! Configuracion del ejecutable.
//!
//! Documento de migracion, secciones 15 y 18: el contrato actual son
//! unas 25 variables; en el ejecutable unico se consolidan en un
//! `config.toml` (fase 6). Hasta entonces, los secretos y limites se
//! leen del entorno con los mismos nombres actuales que Go
//! (`server-go/internal/config/config.go`), con los mismos valores por
//! defecto y las mismas validaciones:
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
//! - `MAX_LOGIN_ATTEMPTS` (5), `LOCKOUT_DURATION_MINUTES` (15),
//!   `RATE_LIMIT_WINDOW_MS` (60000) y `RATE_LIMIT_MAX_REQUESTS` (100).
//! - `APP_URL`: origen publico de la aplicacion, contra el que se
//!   valida `Origin`/`Referer` en las escrituras. Por defecto
//!   `https://localhost:8443` (el BFF usaba `https://localhost:5173`,
//!   el origen de Next; aqui ya no hay Next y el origen es el propio
//!   servidor). `CORS_ORIGINS` anade origenes permitidos adicionales.
//! - `TRUSTED_PROXY_CIDRS`: lista de CIDR de proxies de confianza para
//!   `X-Forwarded-For` (ver `client_ip`).

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, bail, Result};
use logmaster_crypto::load_key_from_env;
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
        let bind = std::env::var("LOGMASTER_BIND").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = std::env::var("LOGMASTER_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8443);
        let db_path = std::env::var("LOGMASTER_DB_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| default_db_path());

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
        let access_ttl = parse_duration(
            &std::env::var("JWT_ACCESS_EXPIRATION").unwrap_or_default(),
            Duration::from_secs(15 * 60),
        )?;
        let refresh_ttl = parse_duration(
            &std::env::var("JWT_REFRESH_EXPIRATION").unwrap_or_default(),
            Duration::from_secs(7 * 24 * 3600),
        )?;
        let max_login_attempts = parse_int_env("MAX_LOGIN_ATTEMPTS", 5)?;
        let lockout_minutes = parse_int_env("LOCKOUT_DURATION_MINUTES", 15)?;
        let rate_window_ms = parse_int_env("RATE_LIMIT_WINDOW_MS", 60_000)? as u64;
        let rate_max_requests = parse_int_env("RATE_LIMIT_MAX_REQUESTS", 100)? as u32;
        let app_url = std::env::var("APP_URL")
            .ok()
            .filter(|v| !v.is_empty())
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

        Ok(Self {
            bind,
            port,
            db_path,
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
        let _guard = ENV_LOCK.lock().unwrap();
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
}
