//! `init` y `secrets` (fase 6; documento §14 y Anexo A).
//!
//! - `logmaster init`: crea las carpetas de datos, respaldos,
//!   secretos, TLS y logs; crea el `config.toml` junto al .exe a
//!   partir del ejemplo si falta; genera los tres secretos
//!   aleatorios (`JWT_SECRET`, `JWT_REFRESH_SECRET`,
//!   `ENCRYPTION_KEY`) en el archivo de secretos si faltan, y con
//!   `--root-password-file` crea la cuenta root inicial con la
//!   contraseña de ese archivo privado (como `bootstrap-root` de
//!   Go). No pisa nada existente: cada paso es idempotente.
//! - `logmaster secrets set <NOMBRE>`: guarda un secreto leyendo
//!   el valor de stdin (una línea); `secrets list` muestra solo
//!   los nombres guardados, nunca los valores.

use std::io::Read;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use chrono::Utc;
use clap::Subcommand;
use logmaster_crypto::{hash_password, random_token, validate_password};
use logmaster_store::repos::users::NewUser;

use crate::config::{Config, InitPaths};
use crate::secrets::{SecretsStore, SECRET_NAMES};

/// Subcomandos de `secrets`.
#[derive(Subcommand)]
pub enum SecretsAction {
    /// Guarda un secreto leyendo el valor de stdin (una línea).
    /// Ejemplo: `logmaster secrets set JWT_SECRET < secreto.txt`.
    Set {
        /// Nombre del secreto (`JWT_SECRET`, `JWT_REFRESH_SECRET`,
        /// `ENCRYPTION_KEY` o `EDIT_PASSWORD`).
        name: String,
    },
    /// Lista los nombres guardados, sin valores.
    List,
}

/// `logmaster init [--root-password-file <archivo>]`.
pub async fn run_init(root_password_file: Option<PathBuf>) -> Result<()> {
    let paths = Config::load_paths()?;
    create_dirs(&paths)?;
    // El config.toml junto al .exe ya lo crea `load_config_file`
    // al leerlo; aquí solo se informa dónde quedó.
    match &paths.config_path {
        Some(path) => println!("config: {}", path.display()),
        None => println!("config: sin config.toml (solo entorno y valores por defecto)"),
    }
    let store = SecretsStore::new(paths.secrets_dir.clone());
    let existing = store.get_all().unwrap_or_default();
    let mut created = Vec::new();
    if !existing.contains_key("JWT_SECRET") {
        let value = random_token().context("generar JWT_SECRET")?;
        store.set("JWT_SECRET", &value)?;
        created.push("JWT_SECRET");
    }
    if !existing.contains_key("JWT_REFRESH_SECRET") {
        let value = random_token().context("generar JWT_REFRESH_SECRET")?;
        store.set("JWT_REFRESH_SECRET", &value)?;
        created.push("JWT_REFRESH_SECRET");
    }
    if !existing.contains_key("ENCRYPTION_KEY") {
        let value = random_token().context("generar ENCRYPTION_KEY")?;
        store.set("ENCRYPTION_KEY", &value)?;
        created.push("ENCRYPTION_KEY");
    }
    if created.is_empty() {
        println!("secretos: ya existían en {}", store.path().display());
    } else {
        println!(
            "secretos creados ({}): {}",
            store.path().display(),
            created.join(", ")
        );
    }
    println!("protección: {}", crate::secrets::PROTECTION);
    if !existing.contains_key("EDIT_PASSWORD") && store.get("EDIT_PASSWORD")?.is_none() {
        println!("EDIT_PASSWORD: pendiente — guárdela con `logmaster secrets set EDIT_PASSWORD < archivo`");
    }
    if let Some(file) = root_password_file {
        create_root(&file).await?;
    }
    println!("init: listo");
    Ok(())
}

/// Crea las carpetas de operación (datos, respaldos, secretos, TLS
/// y logs). En Windows, la de datos es `ProgramData\LogMaster\...`;
/// en desarrollo, las relativas al trabajo actual.
fn create_dirs(paths: &InitPaths) -> Result<()> {
    let mut dirs = vec![
        paths
            .db_path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("data")),
        paths.secrets_dir.clone(),
        paths.tls_dir.clone(),
        log_dir(),
    ];
    if let Some(backup) = &paths.backup_path {
        dirs.push(backup.clone());
    }
    for dir in dirs {
        if dir.as_os_str().is_empty() {
            continue;
        }
        std::fs::create_dir_all(&dir).with_context(|| format!("crear {}", dir.display()))?;
        println!("carpeta: {}", dir.display());
    }
    Ok(())
}

/// Carpeta de logs (`LOGMASTER_LOG_DIR` o, por defecto,
/// `<datos>/logs`; documento §14.3).
pub fn log_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("LOGMASTER_LOG_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let db_path = Config::load_paths()
        .map(|paths| paths.db_path)
        .unwrap_or_else(|_| PathBuf::from("data").join("logmaster.db"));
    db_path
        .parent()
        .and_then(|parent| parent.parent())
        .map(|grand| grand.join("logs"))
        .unwrap_or_else(|| PathBuf::from("logs"))
}

/// Crea la cuenta root inicial si no existe, con la contraseña del
/// archivo privado. La contraseña debe cumplir la política y la
/// cuenta queda con cambio obligatorio, como `bootstrap-root`.
/// Abre la base directamente desde las rutas (sin `Config::load`,
/// que exigiría los secretos que `init` acaba de crear y la
/// `EDIT_PASSWORD`, que puede seguir pendiente).
async fn create_root(file: &PathBuf) -> Result<()> {
    let password =
        std::fs::read_to_string(file).with_context(|| format!("leer {}", file.display()))?;
    let password = password.trim();
    validate_password(password).map_err(|e| anyhow::anyhow!("{e}"))?;
    let paths = Config::load_paths()?;
    let db = logmaster_store::Database::open(&logmaster_store::DatabaseConfig {
        engine: paths.database_engine,
        sqlite_path: paths.db_path.clone(),
        postgres_url: paths.database_url.clone(),
    })
    .await?;
    db.migrate().await?;
    let repos = db.repositories();
    let users = repos.users.list_all().await?;
    if users.iter().any(|u| u.role.as_deref() == Some("root")) {
        println!("root: ya existe una cuenta root; no se crea otra");
        return Ok(());
    }
    let hash = hash_password(password).map_err(|e| anyhow::anyhow!("{e}"))?;
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string();
    let id = repos
        .users
        .insert(&NewUser {
            username: "root",
            email: None,
            password_hash: &hash,
            role: "root",
            must_change_password: true,
            created_at: &now,
            updated_at: &now,
        })
        .await?;
    println!("root: cuenta creada (id {id}, cambio de contraseña obligatorio)");
    Ok(())
}

/// `logmaster secrets <accion>`.
pub fn run_secrets(action: SecretsAction) -> Result<()> {
    let paths = Config::load_paths()?;
    let store = SecretsStore::new(paths.secrets_dir.clone());
    match action {
        SecretsAction::List => {
            let names = store.names();
            if names.is_empty() {
                println!("sin secretos en {}", store.path().display());
            } else {
                println!("secretos en {}:", store.path().display());
                for name in names {
                    println!("  {name}");
                }
            }
            println!("protección: {}", crate::secrets::PROTECTION);
            Ok(())
        }
        SecretsAction::Set { name } => {
            if !SECRET_NAMES.contains(&name.as_str()) {
                bail!(
                    "nombre de secreto no admitido: {name} (use {})",
                    SECRET_NAMES.join(", ")
                );
            }
            let mut value = String::new();
            std::io::stdin()
                .read_to_string(&mut value)
                .context("leer el secreto de stdin")?;
            let value = value.trim_end_matches(['\n', '\r']);
            if value.is_empty() {
                bail!("el secreto está vacío; páselo por stdin");
            }
            validate_secret_value(&name, value)?;
            store.set(&name, value)?;
            println!("secreto guardado: {name} (en {})", store.path().display());
            Ok(())
        }
    }
}

/// Valida el valor antes de guardarlo: la clave de datos debe ser
/// 32 bytes en hex y los secretos de sesión, de al menos 32 bytes.
fn validate_secret_value(name: &str, value: &str) -> Result<()> {
    match name {
        "ENCRYPTION_KEY" => {
            logmaster_crypto::parse_key_hex(value).map_err(|e| anyhow::anyhow!(e))?;
        }
        "JWT_SECRET" | "JWT_REFRESH_SECRET" => {
            if value.len() < 32 {
                bail!("{name} debe tener al menos 32 bytes");
            }
        }
        "EDIT_PASSWORD" => {
            validate_password(value).map_err(|e| anyhow::anyhow!("{e}"))?;
        }
        _ => {}
    }
    Ok(())
}
