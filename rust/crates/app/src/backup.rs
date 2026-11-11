//! Respaldos con age (fase 6; documento §16, línea base §10).
//!
//! Formato propio `logmaster-rust/1` (sin pg_dump, como pide la
//! línea base):
//!
//! - Archivo `backup-<AAAA-MM-DDTHH-MM-SS>-<12 hex>.dump.enc`: el
//!   mismo patrón de nombre que Go, así el listado de fase 4 lo
//!   sigue viendo. La contraseña es aleatoria por copia (64 hex).
//! - Cifrado age con scrypt, factor de trabajo 15, como Go
//!   (`writeVersioned`).
//! - Manifiesto `<nombre>.meta` (JSON): versión, fecha, motor,
//!   versión de esquema, conteos por tabla, huella SHA-256 del
//!   contenido en claro y hash SHA-256 de la contraseña (como Go).
//! - Contraseña cifrada con AES-GCM (clave de datos
//!   `ENCRYPTION_KEY`) en `<nombre>.password.enc`, dentro de la
//!   carpeta aparte de contraseñas: solo las copias automáticas la
//!   guardan (como Go: `Managed`); las manuales devuelven la
//!   contraseña una sola vez y nunca se podan.
//! - Contenido en claro, según el motor:
//!   - SQLite: copia en línea (API de respaldo de rusqlite) del
//!     archivo completo.
//!   - PostgreSQL: volcado lógico por tabla con `COPY "Tabla" TO
//!     STDOUT` (texto, zona UTC) en orden de dependencias,
//!     secciones `##TABLE "Nombre" N` … `##END`. La restauración
//!     usa `COPY ... FROM STDIN` tras `DROP SCHEMA public CASCADE;
//!     CREATE SCHEMA public;` + migraciones, como el guion de Go.
//! - Retención: hasta 30 pares automáticos completos y verificados
//!   (`keep = 30` del config); manuales e incompletos se preservan.
//! - Estado: `backup-status.json` y `restore-status.json` en la
//!   carpeta de contraseñas, como Go.
//!
//! La restauración por HTTP solo cambia la base en vivo para
//! SQLite (intercambio de conexión en `Store::replace_with`); en
//! PostgreSQL devuelve 409, como Go fuera de `logmaster_restore_test`,
//! y se hace por CLI (`logmaster restore`).

use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use logmaster_crypto::{aead, random_token};
use logmaster_store::{Database, Store};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Versión del formato de respaldo.
pub const BACKUP_VERSION: u32 = 1;
/// Identificador del formato (en el manifiesto).
pub const BACKUP_FORMAT: &str = "logmaster-rust/1";
/// Límite de archivo cifrado, como Go (20 GiB).
pub const MAX_ARCHIVE_BYTES: u64 = 20 * 1024 * 1024 * 1024;
/// Límite de contenido en claro, como Go (80 GiB).
pub const MAX_PLAINTEXT_BYTES: u64 = 80 * 1024 * 1024 * 1024;
/// Factor de trabajo scrypt de age, como Go (15).
pub const SCRYPT_WORK_FACTOR: u8 = 15;
/// Pares automáticos que se conservan (`keep = 30` del config).
pub const BACKUP_KEEP_DEFAULT: usize = 30;

/// Tablas del volcado lógico de PostgreSQL, en orden de
/// dependencias (la restauración las carga en este orden).
/// `goose_db_version` queda fuera: la recrean las migraciones.
pub const BACKUP_TABLES: [&str; 12] = [
    "Users",
    "Departments",
    "VisitPurposes",
    "Visitors",
    "Visits",
    "IntermittentLogs",
    "VisitorEditHistories",
    "ActivityLogs",
    "ArcoRequests",
    "VisitorSearchTokens",
    "SearchIndexState",
    "IdentityIndexState",
];

/// Manifiesto de una copia (`<nombre>.meta`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub version: u32,
    pub format: String,
    pub created_at: String,
    pub password_hash: String,
    pub original_name: String,
    pub engine: String,
    pub sha256: String,
    pub schema_version: usize,
    pub counts: BTreeMap<String, u64>,
    pub automatic: bool,
}

/// Copia creada: nombre, contraseña (una sola vez) y manifiesto.
#[derive(Debug, Clone)]
pub struct CreatedBackup {
    pub name: String,
    pub restore_password: String,
    pub manifest: BackupManifest,
}

/// Copia descifrada y verificada, lista para restaurar. El
/// archivo temporal se borra al soltarla (como `Prepared` de Go).
#[derive(Debug)]
pub struct PreparedBackup {
    pub manifest: BackupManifest,
    pub temp_path: PathBuf,
}

impl Drop for PreparedBackup {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.temp_path);
        for suffix in ["-wal", "-shm"] {
            let _ = fs::remove_file(format!("{}{suffix}", self.temp_path.display()));
        }
    }
}

/// Resultado de una poda de respaldos.
#[derive(Debug, Clone, Default)]
pub struct PruneReport {
    pub kept: usize,
    pub removed: Vec<String>,
}

/// Resultado de un ensayo de restauración.
#[derive(Debug, Clone)]
pub struct Rehearsal {
    pub name: String,
    pub engine: String,
    pub counts: BTreeMap<String, u64>,
    pub verified_at: String,
}

/// Errores de respaldo con el código HTTP que les corresponde
/// en las rutas (mismos que Go).
#[derive(Debug)]
pub enum BackupError {
    /// La copia no existe (404).
    NotFound(String),
    /// Nombre de archivo inválido (400 `INVALID_FILENAME`).
    InvalidFilename(String),
    /// Falta la contraseña (400 `MISSING_PASSWORD`).
    MissingPassword,
    /// Contraseña incorrecta (401 `INVALID_PASSWORD`).
    InvalidPassword,
    /// Falta el manifiesto `.meta` (409 `MISSING_METADATA`).
    MissingMetadata(String),
    /// Manifiesto inválido o formato desconocido.
    InvalidManifest(String),
    /// La copia no pasó la verificación (huella, integridad o
    /// conteos).
    VerificationFailed(String),
    /// Ya hay un respaldo en curso (candado `.backup.lock`).
    BackupInProgress,
    /// El motor no es el esperado para la operación.
    WrongEngine(String),
    /// Cualquier otro fallo (E/S, base, age, sqlx).
    Other(String),
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(name) => write!(f, "respaldo no encontrado: {name}"),
            Self::InvalidFilename(name) => write!(f, "nombre de respaldo inválido: {name}"),
            Self::MissingPassword => write!(f, "falta la contraseña de restauración"),
            Self::InvalidPassword => write!(f, "contraseña de restauración incorrecta"),
            Self::MissingMetadata(name) => write!(f, "falta el manifiesto del respaldo: {name}"),
            Self::InvalidManifest(what) => write!(f, "manifiesto de respaldo inválido: {what}"),
            Self::VerificationFailed(what) => {
                write!(f, "la copia no pasó la verificación: {what}")
            }
            Self::BackupInProgress => write!(f, "ya hay un respaldo en curso"),
            Self::WrongEngine(what) => write!(f, "motor incorrecto para la operación: {what}"),
            Self::Other(what) => write!(f, "{what}"),
        }
    }
}

impl std::error::Error for BackupError {}

impl From<anyhow::Error> for BackupError {
    fn from(e: anyhow::Error) -> Self {
        Self::Other(e.to_string())
    }
}

impl From<std::io::Error> for BackupError {
    fn from(e: std::io::Error) -> Self {
        Self::Other(e.to_string())
    }
}

impl From<serde_json::Error> for BackupError {
    fn from(e: serde_json::Error) -> Self {
        Self::Other(e.to_string())
    }
}

impl From<sqlx::Error> for BackupError {
    fn from(e: sqlx::Error) -> Self {
        Self::Other(e.to_string())
    }
}

impl From<logmaster_crypto::CryptoError> for BackupError {
    fn from(e: logmaster_crypto::CryptoError) -> Self {
        Self::Other(e.to_string())
    }
}

/// Servicio de respaldos: carpetas y clave de datos.
#[derive(Debug, Clone)]
pub struct BackupService {
    pub backup_path: PathBuf,
    pub passwords_path: PathBuf,
    pub encryption_key: [u8; 32],
    /// Factor de trabajo scrypt (`SCRYPT_WORK_FACTOR` en
    /// producción; los tests lo bajan para no tardar un minuto).
    pub scrypt_work_factor: u8,
}

/// Nombre válido de copia: `backup-<...>.dump.enc`, sin rutas.
pub fn is_valid_backup_name(name: &str) -> bool {
    name.starts_with("backup-")
        && name.ends_with(".dump.enc")
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && name.len() > "backup-".len() + ".dump.enc".len()
}

/// SHA-256 en hex de unos bytes.
fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// SHA-256 en hex de un archivo, por bloques.
fn sha256_file_hex(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Copia con límite: si el origen trae más de `limit` bytes, falla
/// en vez de truncar en silencio.
fn copy_capped(reader: impl Read, mut writer: impl Write, limit: u64) -> Result<u64> {
    let copied = std::io::copy(&mut reader.take(limit + 1), &mut writer)?;
    anyhow::ensure!(
        copied <= limit,
        "contenido mayor que el límite de {limit} bytes"
    );
    Ok(copied)
}

/// Candado de respaldo (`.backup.lock`, como Go): una sola
/// creación a la vez. Se borra al soltarlo.
struct BackupLock {
    path: PathBuf,
}

impl BackupLock {
    fn acquire(dir: &Path) -> Result<Self, BackupError> {
        fs::create_dir_all(dir)?;
        let path = dir.join(".backup.lock");
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(_) => Ok(Self { path }),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                Err(BackupError::BackupInProgress)
            }
            Err(e) => Err(e.into()),
        }
    }
}

impl Drop for BackupLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn age_passphrase(password: &str) -> age::secrecy::SecretBox<str> {
    age::secrecy::SecretBox::new(password.to_string().into_boxed_str())
}

fn age_recipient(password: &str, work_factor: u8) -> Box<dyn age::Recipient> {
    let mut recipient = age::scrypt::Recipient::new(age_passphrase(password));
    recipient.set_work_factor(work_factor);
    Box::new(recipient)
}

/// Cifra `plain` con age+scrypt en `archive`.
fn encrypt_age(plain: File, archive: &File, password: &str, work_factor: u8) -> Result<()> {
    let recipient = age_recipient(password, work_factor);
    let encryptor =
        age::Encryptor::with_recipients(std::iter::once(&*recipient as &dyn age::Recipient))
            .map_err(|e| anyhow!("age: {e}"))?;
    let mut writer = encryptor
        .wrap_output(archive)
        .map_err(|e| anyhow!("age: {e}"))?;
    copy_capped(plain, &mut writer, MAX_PLAINTEXT_BYTES)?;
    writer.finish().map_err(|e| anyhow!("age: {e}"))?;
    Ok(())
}

/// Abre un lector age+scrypt de `archive`.
fn decrypt_age(archive: File, password: &str) -> Result<impl Read> {
    let decryptor = age::Decryptor::new(archive).map_err(|e| anyhow!("age: {e}"))?;
    let identity = age::scrypt::Identity::new(age_passphrase(password));
    decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|e| anyhow!("age: {e}"))
}

/// Nombre de copia: `backup-<UTC>-<12 hex>.dump.enc`.
fn backup_name(now: DateTime<Utc>) -> Result<String> {
    let token = random_token().map_err(anyhow::Error::from)?;
    Ok(format!(
        "backup-{}-{}.dump.enc",
        now.format("%Y-%m-%dT%H-%M-%S"),
        &token[..12]
    ))
}

/// Fecha ISO 8601 UTC con `Z`, como Go (`time.RFC3339`).
fn iso_now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

impl BackupService {
    pub fn new(backup_path: PathBuf, passwords_path: PathBuf, encryption_key: [u8; 32]) -> Self {
        Self {
            backup_path,
            passwords_path,
            encryption_key,
            scrypt_work_factor: SCRYPT_WORK_FACTOR,
        }
    }

    /// Factor de trabajo scrypt distinto del de producción (tests).
    pub fn with_scrypt_work_factor(mut self, work_factor: u8) -> Self {
        self.scrypt_work_factor = work_factor;
        self
    }

    fn archive_path(&self, name: &str) -> PathBuf {
        self.backup_path.join(name)
    }

    fn meta_path(&self, name: &str) -> PathBuf {
        self.backup_path.join(format!("{name}.meta"))
    }

    fn password_path(&self, name: &str) -> PathBuf {
        self.passwords_path.join(format!("{name}.password.enc"))
    }

    /// Crea una copia de la base y la verifica releyéndola, como
    /// Go. `automatic = true` guarda la contraseña cifrada aparte
    /// (par podable) y poda a 30; `automatic = false` es manual:
    /// la contraseña solo se devuelve una vez y no se poda.
    pub async fn create(
        &self,
        db: &Database,
        automatic: bool,
    ) -> Result<CreatedBackup, BackupError> {
        let _lock = BackupLock::acquire(&self.backup_path)?;
        fs::create_dir_all(&self.backup_path)?;
        fs::create_dir_all(&self.passwords_path)?;
        let now = Utc::now();
        let name = backup_name(now)?;
        let password = random_token().map_err(anyhow::Error::from)?;
        let plain_path = self.backup_path.join(format!("{name}.plain.partial"));
        let partial_path = self.backup_path.join(format!("{name}.partial"));
        let (engine_name, schema_version, counts) = match db {
            Database::Sqlite(store) => {
                store.backup_to(&plain_path)?;
                let staged = Store::open(&plain_path)?;
                let counts = staged.table_counts(&BACKUP_TABLES)?;
                let version = staged.schema_version()?;
                ("sqlite", version, counts)
            }
            Database::Postgres(pg) => {
                let (version, counts) = dump_postgres(pg.pool(), &plain_path).await?;
                ("postgres", version, counts)
            }
        };
        let sha256 = sha256_file_hex(&plain_path)?;
        let archive_file = File::create(&partial_path)?;
        if let Err(e) = encrypt_age(
            File::open(&plain_path)?,
            &archive_file,
            &password,
            self.scrypt_work_factor,
        ) {
            let _ = fs::remove_file(&plain_path);
            let _ = fs::remove_file(&partial_path);
            return Err(e.into());
        }
        let _ = fs::remove_file(&plain_path);
        let manifest = BackupManifest {
            version: BACKUP_VERSION,
            format: BACKUP_FORMAT.to_string(),
            created_at: now.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            password_hash: sha256_hex(password.as_bytes()),
            original_name: name.clone(),
            engine: engine_name.to_string(),
            sha256,
            schema_version,
            counts,
            automatic,
        };
        fs::write(
            self.meta_path(&name),
            serde_json::to_string_pretty(&manifest)?,
        )?;
        if automatic {
            let encrypted = aead::encrypt(&self.encryption_key, &password)?;
            fs::write(self.password_path(&name), encrypted)?;
        }
        fs::rename(&partial_path, self.archive_path(&name))?;
        // Verificación final releyendo la copia, como Go: si
        // falla, la copia no se da por buena.
        let prepared = match self.prepare(&name, &password) {
            Ok(prepared) => prepared,
            Err(e) => {
                let _ = fs::remove_file(self.archive_path(&name));
                let _ = fs::remove_file(self.meta_path(&name));
                let _ = fs::remove_file(self.password_path(&name));
                return Err(e);
            }
        };
        drop(prepared);
        if automatic {
            let _ = self.prune(BACKUP_KEEP_DEFAULT)?;
            self.write_backup_status(&name)?;
        }
        Ok(CreatedBackup {
            name,
            restore_password: password,
            manifest,
        })
    }

    /// Descifra y verifica una copia: manifiesto, huella del
    /// contenido en claro, integridad y conteos. Devuelve la copia
    /// preparada (temporal, se borra al soltarla).
    pub fn prepare(&self, name: &str, password: &str) -> Result<PreparedBackup, BackupError> {
        if !is_valid_backup_name(name) {
            return Err(BackupError::InvalidFilename(name.to_string()));
        }
        let archive = self.archive_path(name);
        if !archive.exists() {
            return Err(BackupError::NotFound(name.to_string()));
        }
        if archive.metadata()?.len() > MAX_ARCHIVE_BYTES {
            return Err(BackupError::VerificationFailed(format!(
                "el archivo supera el límite de {} bytes",
                MAX_ARCHIVE_BYTES
            )));
        }
        let meta_text = fs::read_to_string(self.meta_path(name))
            .map_err(|_| BackupError::MissingMetadata(name.to_string()))?;
        let manifest: BackupManifest = serde_json::from_str(&meta_text)
            .map_err(|e| BackupError::InvalidManifest(e.to_string()))?;
        if manifest.version != BACKUP_VERSION
            || manifest.format != BACKUP_FORMAT
            || manifest.original_name != name
        {
            return Err(BackupError::InvalidManifest(format!(
                "versión o formato inesperados en {name}"
            )));
        }
        if sha256_hex(password.as_bytes()) != manifest.password_hash {
            return Err(BackupError::InvalidPassword);
        }
        let temp_path = self.backup_path.join(format!(
            ".restore-{}.tmp",
            &random_token().map_err(anyhow::Error::from)?[..12]
        ));
        {
            let archive_file = File::open(&archive)?;
            let reader = decrypt_age(archive_file, password)
                .map_err(|e| BackupError::VerificationFailed(e.to_string()))?;
            let mut writer = File::create(&temp_path)?;
            copy_capped(reader, &mut writer, MAX_PLAINTEXT_BYTES)
                .map_err(|e| BackupError::VerificationFailed(e.to_string()))?;
        }
        if sha256_file_hex(&temp_path)? != manifest.sha256 {
            let _ = fs::remove_file(&temp_path);
            return Err(BackupError::VerificationFailed(
                "la huella del contenido no coincide con el manifiesto".to_string(),
            ));
        }
        match manifest.engine.as_str() {
            "sqlite" => verify_sqlite(&temp_path, &manifest)?,
            "postgres" => verify_postgres(&temp_path, &manifest)?,
            other => {
                let _ = fs::remove_file(&temp_path);
                return Err(BackupError::InvalidManifest(format!(
                    "motor desconocido: {other}"
                )));
            }
        }
        Ok(PreparedBackup {
            manifest,
            temp_path,
        })
    }

    /// Contraseña guardada de una copia automática (descifrada
    /// con la clave de datos). Las manuales no la tienen.
    pub fn stored_password(&self, name: &str) -> Result<String, BackupError> {
        let encrypted = fs::read_to_string(self.password_path(name))
            .map_err(|_| BackupError::MissingPassword)?;
        Ok(aead::decrypt(&self.encryption_key, encrypted.trim())?)
    }

    /// Ensayo de restauración: descifra, verifica integridad y
    /// conteos, y descarta el temporal. Registra el resultado en
    /// `restore-status.json`.
    pub fn rehearse(&self, name: &str, password: Option<&str>) -> Result<Rehearsal, BackupError> {
        fs::create_dir_all(&self.passwords_path)?;
        let owned;
        let password = match password {
            Some(password) => password,
            None => {
                owned = self.stored_password(name)?;
                &owned
            }
        };
        let prepared = self.prepare(name, password)?;
        let rehearsal = Rehearsal {
            name: name.to_string(),
            engine: prepared.manifest.engine.clone(),
            counts: prepared.manifest.counts.clone(),
            verified_at: iso_now(),
        };
        drop(prepared);
        self.write_rehearsal_status(&rehearsal)?;
        Ok(rehearsal)
    }
}

/// Verifica una copia SQLite: integridad, versión de esquema y
/// conteos del manifiesto.
fn verify_sqlite(path: &Path, manifest: &BackupManifest) -> Result<(), BackupError> {
    let store = Store::open(path)?;
    let integrity = store.integrity_check()?;
    if integrity != "ok" {
        return Err(BackupError::VerificationFailed(format!(
            "integridad de la copia: {integrity}"
        )));
    }
    let version = store.schema_version()?;
    if version != manifest.schema_version {
        return Err(BackupError::VerificationFailed(format!(
            "versión de esquema {} en la copia, {} en el manifiesto",
            version, manifest.schema_version
        )));
    }
    let counts = store.table_counts(&BACKUP_TABLES)?;
    if counts != manifest.counts {
        return Err(BackupError::VerificationFailed(
            "los conteos de la copia no coinciden con el manifiesto".to_string(),
        ));
    }
    Ok(())
}

/// Lee las secciones `##TABLE "Nombre" N` … `##END` de un volcado
/// lógico y cuenta las filas de cada una.
fn parse_pg_payload(path: &Path) -> Result<Vec<(String, u64, u64)>, BackupError> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut sections = Vec::new();
    let mut current: Option<(String, u64, u64)> = None;
    for line in reader.lines() {
        let line = line?;
        if let Some(rest) = line.strip_prefix("##TABLE ") {
            if current.is_some() {
                return Err(BackupError::InvalidManifest(
                    "sección de tabla sin cerrar en el volcado".to_string(),
                ));
            }
            let (name, expected) = rest
                .rsplit_once(' ')
                .and_then(|(name, count)| count.parse::<u64>().ok().map(|c| (name, c)))
                .ok_or_else(|| {
                    BackupError::InvalidManifest(format!("cabecera de tabla inválida: {rest}"))
                })?;
            let name = name
                .strip_prefix('"')
                .and_then(|n| n.strip_suffix('"'))
                .ok_or_else(|| {
                    BackupError::InvalidManifest(format!("nombre de tabla inválido: {name}"))
                })?;
            current = Some((name.to_string(), expected, 0));
        } else if line == "##END" {
            match current.take() {
                Some(section) => sections.push(section),
                None => {
                    return Err(BackupError::InvalidManifest(
                        "##END sin tabla abierta en el volcado".to_string(),
                    ));
                }
            }
        } else if let Some((_, _, count)) = current.as_mut() {
            *count += 1;
        } else {
            return Err(BackupError::InvalidManifest(
                "fila fuera de sección en el volcado".to_string(),
            ));
        }
    }
    if current.is_some() {
        return Err(BackupError::InvalidManifest(
            "volcado terminado con una sección sin cerrar".to_string(),
        ));
    }
    Ok(sections)
}

/// Verifica una copia PostgreSQL: todas las tablas, en orden, con
/// los conteos del manifiesto.
fn verify_postgres(path: &Path, manifest: &BackupManifest) -> Result<(), BackupError> {
    let sections = parse_pg_payload(path)?;
    if sections.len() != BACKUP_TABLES.len() {
        return Err(BackupError::VerificationFailed(format!(
            "el volcado trae {} tablas, se esperaban {}",
            sections.len(),
            BACKUP_TABLES.len()
        )));
    }
    for (i, (name, expected, counted)) in sections.iter().enumerate() {
        if name != BACKUP_TABLES[i] {
            return Err(BackupError::VerificationFailed(format!(
                "tabla {name} en la posición {i}, se esperaba {}",
                BACKUP_TABLES[i]
            )));
        }
        if counted != expected {
            return Err(BackupError::VerificationFailed(format!(
                "tabla {name}: {counted} filas en el volcado, {expected} en la cabecera"
            )));
        }
        if manifest.counts.get(name) != Some(expected) {
            return Err(BackupError::VerificationFailed(format!(
                "tabla {name}: {expected} filas, el manifiesto dice otra cosa"
            )));
        }
    }
    Ok(())
}

/// Volcado lógico de PostgreSQL con `COPY ... TO STDOUT` en una
/// transacción de lectura repetible (instantánea consistente) y
/// zona UTC, como el `pg_dump` que sustituye.
async fn dump_postgres(
    pool: &sqlx::PgPool,
    plain_path: &Path,
) -> Result<(usize, BTreeMap<String, u64>), BackupError> {
    use futures_util::TryStreamExt;
    let mut tx = pool.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SET LOCAL timezone = 'UTC'")
        .execute(&mut *tx)
        .await?;
    let schema_version: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version")
            .fetch_one(&mut *tx)
            .await?;
    let mut writer = BufWriter::new(File::create(plain_path)?);
    let mut counts = BTreeMap::new();
    for table in BACKUP_TABLES {
        let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{table}\""))
            .fetch_one(&mut *tx)
            .await?;
        counts.insert(table.to_string(), count as u64);
        writeln!(writer, "##TABLE \"{table}\" {count}")?;
        let mut stream = tx
            .copy_out_raw(&format!("COPY \"{table}\" TO STDOUT"))
            .await?;
        while let Some(chunk) = stream.try_next().await? {
            writer.write_all(&chunk)?;
        }
        writeln!(writer, "##END")?;
    }
    writer.flush()?;
    tx.commit().await?;
    Ok((schema_version as usize, counts))
}

/// Finalización de una restauración SQLite (guion de Go):
/// sube `tokenVersion` por encima del máximo vivo (todas las
/// sesiones anteriores quedan rechazadas), verifica que hay una
/// cuenta root en los datos restaurados y escribe
/// `BACKUP_RESTORE_COMPLETED`. Todo en una transacción.
fn finalize_sqlite(
    staged: &Store,
    live_max_version: i64,
    filename: &str,
    now_text: &str,
) -> Result<()> {
    let details = serde_json::json!({ "filename": filename }).to_string();
    staged.tx_immediate(|tx| {
        tx.execute(
            "UPDATE \"Users\" SET \"tokenVersion\" = MAX(\"tokenVersion\", ?1) + 1",
            [live_max_version],
        )?;
        let audited = tx.execute(
            "INSERT INTO \"ActivityLogs\" \
             (\"userId\", username, action, entity, \"entityId\", details, \"createdAt\", role, status) \
             SELECT id, username, 'BACKUP_RESTORE_COMPLETED', 'Backup', ?1, ?2, ?3, 'root', 'success' \
             FROM \"Users\" WHERE role = 'root' ORDER BY id LIMIT 1",
            rusqlite::params![filename, details, now_text],
        )?;
        if audited != 1 {
            anyhow::bail!("no hay cuenta root en el respaldo");
        }
        Ok(())
    })?;
    staged.checkpoint()?;
    Ok(())
}

impl BackupService {
    /// Restaura una copia SQLite en la base viva, con intercambio
    /// de conexión (`Store::replace_with`). La copia ya viene
    /// verificada (`prepare`); aquí solo se finaliza (bump de
    /// sesiones + auditoría) y se intercambia.
    pub fn restore_sqlite_live(
        &self,
        db: &Database,
        prepared: &PreparedBackup,
        now_text: &str,
    ) -> Result<(), BackupError> {
        let store = match db {
            Database::Sqlite(store) => store,
            Database::Postgres(_) => {
                return Err(BackupError::WrongEngine(
                    "la restauración en vivo de PostgreSQL no está permitida por HTTP".to_string(),
                ));
            }
        };
        let live_max = store.read(|conn| {
            Ok(conn.query_row(
                "SELECT COALESCE(MAX(\"tokenVersion\"), 0) FROM \"Users\"",
                [],
                |row| row.get::<_, i64>(0),
            )?)
        })?;
        let staged = Store::open(&prepared.temp_path)?;
        finalize_sqlite(
            &staged,
            live_max,
            &prepared.manifest.original_name,
            now_text,
        )?;
        drop(staged);
        // El intercambio exige el mismo sistema de archivos que
        // la base viva: copia de preparación en su carpeta.
        let live_dir = store
            .path()
            .parent()
            .ok_or_else(|| BackupError::Other("la base viva no tiene carpeta".to_string()))?;
        let staging = live_dir.join(format!(
            ".restore-{}.db",
            &random_token().map_err(anyhow::Error::from)?[..12]
        ));
        fs::copy(&prepared.temp_path, &staging)?;
        let result = store.replace_with(&staging);
        if result.is_err() {
            let _ = fs::remove_file(&staging);
        }
        Ok(result?)
    }

    /// Restaura una copia SQLite en un archivo de destino (CLI,
    /// con el servicio detenido). Guarda el archivo vivo como
    /// `<destino>.pre-restore` antes de sustituirlo.
    pub fn restore_sqlite_file(
        &self,
        prepared: &PreparedBackup,
        target: &Path,
        now_text: &str,
    ) -> Result<(), BackupError> {
        let live_max = if target.exists() {
            let live = Store::open(target)?;
            live.read(|conn| {
                Ok(conn.query_row(
                    "SELECT COALESCE(MAX(\"tokenVersion\"), 0) FROM \"Users\"",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            })?
        } else {
            0
        };
        let staged = Store::open(&prepared.temp_path)?;
        finalize_sqlite(
            &staged,
            live_max,
            &prepared.manifest.original_name,
            now_text,
        )?;
        drop(staged);
        if target.exists() {
            let fallback = target.with_extension("pre-restore");
            fs::rename(target, &fallback)?;
            for suffix in ["-wal", "-shm"] {
                let _ = fs::remove_file(format!("{}{suffix}", target.display()));
            }
            if let Err(e) = fs::rename(&prepared.temp_path, target) {
                let _ = fs::rename(&fallback, target);
                return Err(e.into());
            }
        } else {
            fs::rename(&prepared.temp_path, target)?;
        }
        let restored = Store::open(target)?;
        restored.verify()?;
        Ok(())
    }

    /// Secciones de datos de un volcado lógico: `(tabla, inicio,
    /// fin)` en bytes del archivo, sin las líneas `##TABLE`/`##END`.
    fn pg_payload_sections(path: &Path) -> Result<Vec<(String, u64, u64)>, BackupError> {
        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut offset = 0u64;
        let mut sections = Vec::new();
        let mut current: Option<(String, u64)> = None;
        loop {
            let mut line = String::new();
            let n = reader.read_line(&mut line)?;
            if n == 0 {
                break;
            }
            let trimmed = line.trim_end_matches(['\r', '\n']);
            if let Some(rest) = trimmed.strip_prefix("##TABLE ") {
                if current.is_some() {
                    return Err(BackupError::InvalidManifest(
                        "sección de tabla sin cerrar en el volcado".to_string(),
                    ));
                }
                let name = rest.rsplit_once(' ').map(|(name, _)| name).unwrap_or(rest);
                let name = name
                    .strip_prefix('"')
                    .and_then(|n| n.strip_suffix('"'))
                    .ok_or_else(|| {
                        BackupError::InvalidManifest(format!("nombre de tabla inválido: {name}"))
                    })?;
                current = Some((name.to_string(), offset + n as u64));
            } else if trimmed == "##END" {
                match current.take() {
                    Some((name, start)) => sections.push((name, start, offset)),
                    None => {
                        return Err(BackupError::InvalidManifest(
                            "##END sin tabla abierta en el volcado".to_string(),
                        ));
                    }
                }
            } else if current.is_none() {
                return Err(BackupError::InvalidManifest(
                    "fila fuera de sección en el volcado".to_string(),
                ));
            }
            offset += n as u64;
        }
        if current.is_some() {
            return Err(BackupError::InvalidManifest(
                "volcado terminado con una sección sin cerrar".to_string(),
            ));
        }
        Ok(sections)
    }

    /// Restaura una copia PostgreSQL (CLI): valida el destino,
    /// recrea el esquema, carga el volcado y finaliza en una
    /// transacción. Si falla después del `DROP SCHEMA`, el destino
    /// queda con el esquema vacío migrado: se vuelve a ejecutar
    /// la restauración.
    pub async fn restore_postgres(
        &self,
        db: &Database,
        prepared: &PreparedBackup,
    ) -> Result<(), BackupError> {
        let pool = match db {
            Database::Postgres(pg) => pg.pool(),
            Database::Sqlite(_) => {
                return Err(BackupError::WrongEngine(
                    "la copia es de PostgreSQL y la base es SQLite".to_string(),
                ));
            }
        };
        let (live_max,): (i64,) =
            sqlx::query_as("SELECT COALESCE(MAX(\"tokenVersion\"), 0) FROM \"Users\"")
                .fetch_one(pool)
                .await?;
        let root_live: Option<(i64,)> =
            sqlx::query_as("SELECT id FROM \"Users\" WHERE role = 'root' ORDER BY id LIMIT 1")
                .fetch_optional(pool)
                .await?;
        if root_live.is_none() {
            return Err(BackupError::Other(
                "no hay cuenta root en la base viva para auditar la restauración".to_string(),
            ));
        }
        sqlx::query("DROP SCHEMA public CASCADE")
            .execute(pool)
            .await
            .context("DROP SCHEMA public")?;
        sqlx::query("CREATE SCHEMA public")
            .execute(pool)
            .await
            .context("CREATE SCHEMA public")?;
        db.migrate().await.context("migraciones tras DROP SCHEMA")?;
        let sections = Self::pg_payload_sections(&prepared.temp_path)?;
        let mut tx = pool.begin().await?;
        for (table, start, end) in sections {
            let mut copy_in = tx
                .copy_in_raw(&format!("COPY \"{table}\" FROM STDIN"))
                .await?;
            let mut file = File::open(&prepared.temp_path)?;
            {
                use std::io::Seek;
                file.seek(std::io::SeekFrom::Start(start))?;
            }
            let reader = BufReader::new(file.take(end - start));
            for line in reader.lines() {
                let mut row = line?.into_bytes();
                row.push(b'\n');
                copy_in.send(bytes::Bytes::from(row)).await?;
            }
            copy_in.finish().await?;
        }
        let now_text = iso_now();
        let details =
            serde_json::json!({ "filename": prepared.manifest.original_name }).to_string();
        sqlx::query("UPDATE \"Users\" SET \"tokenVersion\" = GREATEST(\"tokenVersion\", $1) + 1")
            .bind(live_max)
            .execute(&mut *tx)
            .await?;
        let audited = sqlx::query(
            "INSERT INTO \"ActivityLogs\" \
             (\"userId\", username, action, entity, \"entityId\", details, \"createdAt\", role, status) \
             SELECT id, username, 'BACKUP_RESTORE_COMPLETED', 'Backup', $1, $2, $3, 'root', 'success' \
             FROM \"Users\" WHERE role = 'root' ORDER BY id LIMIT 1",
        )
        .bind(&prepared.manifest.original_name)
        .bind(&details)
        .bind(&now_text)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if audited != 1 {
            return Err(BackupError::Other(
                "no hay cuenta root en el respaldo".to_string(),
            ));
        }
        tx.commit().await?;
        Ok(())
    }

    /// Poda los pares automáticos verificados, conservando `keep`.
    /// Solo se podan pares con `.password.enc` que pasan la
    /// verificación; los manuales, incompletos o no verificables
    /// se preservan, como Go.
    pub fn prune(&self, keep: usize) -> Result<PruneReport, BackupError> {
        let mut pairs: Vec<(String, String)> = Vec::new();
        let entries = match fs::read_dir(&self.backup_path) {
            Ok(entries) => entries,
            Err(_) => return Ok(PruneReport::default()),
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_valid_backup_name(&name) {
                continue;
            }
            if !self.password_path(&name).exists() || !self.meta_path(&name).exists() {
                continue;
            }
            let meta_text = match fs::read_to_string(self.meta_path(&name)) {
                Ok(text) => text,
                Err(_) => continue,
            };
            let manifest: BackupManifest = match serde_json::from_str(&meta_text) {
                Ok(manifest) => manifest,
                Err(_) => continue,
            };
            if !manifest.automatic {
                continue;
            }
            // Verificación completa del par antes de considerarlo
            // podable: contraseña guardada + prepare.
            let password = match self.stored_password(&name) {
                Ok(password) => password,
                Err(_) => continue,
            };
            if self.prepare(&name, &password).is_err() {
                continue;
            }
            pairs.push((manifest.created_at, name));
        }
        pairs.sort();
        let mut report = PruneReport {
            kept: pairs.len().min(keep),
            removed: Vec::new(),
        };
        if pairs.len() > keep {
            for (_, name) in pairs.drain(..pairs.len() - keep) {
                let _ = fs::remove_file(self.archive_path(&name));
                let _ = fs::remove_file(self.meta_path(&name));
                let _ = fs::remove_file(self.password_path(&name));
                report.removed.push(name);
            }
        }
        Ok(report)
    }

    /// Escribe `backup-status.json` (como Go) tras una creación
    /// automática.
    fn write_backup_status(&self, name: &str) -> Result<()> {
        let count = fs::read_dir(&self.backup_path)
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|e| is_valid_backup_name(&e.file_name().to_string_lossy()))
                    .count()
            })
            .unwrap_or(0);
        let status = serde_json::json!({
            "lastBackup": name,
            "lastBackupAt": iso_now(),
            "count": count,
            "automatic": true,
        });
        fs::write(
            self.passwords_path.join("backup-status.json"),
            serde_json::to_string_pretty(&status)?,
        )?;
        Ok(())
    }

    /// Escribe `restore-status.json` (como Go) tras un ensayo.
    fn write_rehearsal_status(&self, rehearsal: &Rehearsal) -> Result<()> {
        let status = serde_json::json!({
            "lastRehearsal": rehearsal.name,
            "lastRehearsalAt": rehearsal.verified_at,
            "engine": rehearsal.engine,
            "counts": rehearsal.counts,
            "ok": true,
        });
        fs::write(
            self.passwords_path.join("restore-status.json"),
            serde_json::to_string_pretty(&status)?,
        )?;
        Ok(())
    }

    /// Copias en disco (nombre, manifiesto), más recientes primero.
    pub fn list(&self) -> Result<Vec<(String, BackupManifest)>, BackupError> {
        let mut out = Vec::new();
        let entries = match fs::read_dir(&self.backup_path) {
            Ok(entries) => entries,
            Err(_) => return Ok(out),
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_valid_backup_name(&name) {
                continue;
            }
            if let Ok(text) = fs::read_to_string(self.meta_path(&name)) {
                if let Ok(manifest) = serde_json::from_str::<BackupManifest>(&text) {
                    out.push((name, manifest));
                }
            }
        }
        out.sort_by(|a, b| b.1.created_at.cmp(&a.1.created_at));
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use logmaster_store::DatabaseConfig;

    fn test_key() -> [u8; 32] {
        [7u8; 32]
    }

    fn test_dir(name: &str) -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("backup-tests")
            .join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seed_sqlite(dir: &Path) -> Database {
        let store = Store::open(&dir.join("live.db")).unwrap();
        store.migrate().unwrap();
        store
            .tx_immediate(|tx| {
                tx.execute(
                    "INSERT INTO \"Users\" (username, email, \"tokenVersion\", password, role, \"createdAt\", \"updatedAt\") \
                     VALUES ('root', 'root@example.test', 3, 'hash', 'root', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                    [],
                )?;
                tx.execute(
                    "INSERT INTO \"Visitors\" (cedula, first_name, last_name, company, \"updatedAt\") \
                     VALUES ('hash-cedula', 'Ana', 'Prueba', 'Trébol', '2026-01-01T00:00:00Z')",
                    [],
                )?;
                tx.execute(
                    "INSERT INTO \"Visits\" (visitor_cedula, purpose, person_to_visit, status, \"createdAt\", \"updatedAt\", visitor_id) \
                     VALUES ('hash-cedula', 'Reunión', 'Anfitrión', 'completed', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)",
                    [],
                )?;
                Ok(())
            })
            .unwrap();
        Database::Sqlite(store)
    }

    fn service_for(dir: &Path) -> BackupService {
        BackupService::new(
            dir.join("backups"),
            dir.join("backups-passwords"),
            test_key(),
        )
        .with_scrypt_work_factor(10)
    }

    #[tokio::test]
    async fn sqlite_create_prepare_rehearse_and_restore() {
        let dir = test_dir("sqlite_roundtrip");
        let db = seed_sqlite(&dir);
        let service = service_for(&dir);
        let created = service.create(&db, false).await.unwrap();
        assert!(is_valid_backup_name(&created.name));
        assert_eq!(created.restore_password.len(), 64);
        assert_eq!(created.manifest.engine, "sqlite");
        assert_eq!(created.manifest.counts.get("Users"), Some(&1));
        assert_eq!(created.manifest.counts.get("Visitors"), Some(&1));
        assert_eq!(created.manifest.counts.get("Visits"), Some(&1));

        // Listado con manifiesto.
        let listed = service.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].0, created.name);

        // Contraseña incorrecta.
        assert!(matches!(
            service.prepare(&created.name, "contraseña-incorrecta"),
            Err(BackupError::InvalidPassword)
        ));
        // Nombre inválido y copia inexistente.
        assert!(matches!(
            service.prepare("../otro.dump.enc", &created.restore_password),
            Err(BackupError::InvalidFilename(_))
        ));
        assert!(matches!(
            service.prepare("backup-2026-01-01T00-00-00-abcdefabcdef.dump.enc", "x"),
            Err(BackupError::NotFound(_))
        ));

        // Preparar y ensayar.
        let prepared = service
            .prepare(&created.name, &created.restore_password)
            .unwrap();
        assert_eq!(prepared.manifest.counts.get("Visits"), Some(&1));
        drop(prepared);
        let rehearsal = service
            .rehearse(&created.name, Some(&created.restore_password))
            .unwrap();
        assert_eq!(rehearsal.engine, "sqlite");
        assert!(service.passwords_path.join("restore-status.json").exists());

        // Restauración por archivo a un destino nuevo: los datos
        // están, tokenVersion sube (3 -> 4) y queda la auditoría.
        let target = dir.join("restored.db");
        let prepared = service
            .prepare(&created.name, &created.restore_password)
            .unwrap();
        service
            .restore_sqlite_file(&prepared, &target, "2026-11-11T00:00:00Z")
            .unwrap();
        let restored = Store::open(&target).unwrap();
        let token_version = restored.read(|conn| {
            Ok(conn.query_row(
                "SELECT \"tokenVersion\" FROM \"Users\" WHERE username = 'root'",
                [],
                |row| row.get::<_, i64>(0),
            )?)
        });
        assert_eq!(token_version.unwrap(), 4);
        let audit = restored.read(|conn| {
            Ok(conn.query_row(
                "SELECT COUNT(*) FROM \"ActivityLogs\" WHERE action = 'BACKUP_RESTORE_COMPLETED'",
                [],
                |row| row.get::<_, i64>(0),
            )?)
        });
        assert_eq!(audit.unwrap(), 1);
        let visits = restored.read(|conn| {
            Ok(
                conn.query_row("SELECT COUNT(*) FROM \"Visits\"", [], |row| {
                    row.get::<_, i64>(0)
                })?,
            )
        });
        assert_eq!(visits.unwrap(), 1);

        // Restauración en vivo sobre la base original.
        let prepared = service
            .prepare(&created.name, &created.restore_password)
            .unwrap();
        service
            .restore_sqlite_live(&db, &prepared, "2026-11-11T00:00:00Z")
            .unwrap();
        let live_version = match &db {
            Database::Sqlite(store) => store.read(|conn| {
                Ok(conn.query_row(
                    "SELECT \"tokenVersion\" FROM \"Users\" WHERE username = 'root'",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            }),
            _ => unreachable!(),
        };
        // El máximo vivo era 3 (el respaldo trae 3): 3 -> 4.
        assert_eq!(live_version.unwrap(), 4);
    }

    #[tokio::test]
    async fn automatic_backups_prune_to_keep() {
        let dir = test_dir("prune");
        let db = seed_sqlite(&dir);
        let service = service_for(&dir);
        let first = service.create(&db, true).await.unwrap();
        let second = service.create(&db, true).await.unwrap();
        assert_ne!(first.name, second.name);
        // Las automáticas guardan la contraseña aparte.
        assert!(service.password_path(&first.name).exists());
        let report = service.prune(1).unwrap();
        assert_eq!(report.kept, 1);
        assert_eq!(report.removed, vec![first.name.clone()]);
        assert!(!service.archive_path(&first.name).exists());
        assert!(service.archive_path(&second.name).exists());
        // Una manual no se poda nunca.
        let manual = service.create(&db, false).await.unwrap();
        let report = service.prune(1).unwrap();
        assert!(!report.removed.contains(&manual.name));
        assert!(service.archive_path(&manual.name).exists());
    }

    #[tokio::test]
    async fn postgres_payload_format_parses_without_a_server() {
        // El formato del volcado lógico (cabeceras, conteos y
        // rangos de bytes) se verifica sin clúster: la restauración
        // lee por secciones con esos rangos.
        let dir = test_dir("pg_payload");
        let payload = dir.join("dump.txt");
        let mut text = String::new();
        for (i, table) in BACKUP_TABLES.iter().enumerate() {
            let rows = if i == 0 { 2 } else { 0 };
            text.push_str(&format!("##TABLE \"{table}\" {rows}\n"));
            for r in 0..rows {
                text.push_str(&format!("{r}\tvalor con \\n escapado\n"));
            }
            text.push_str("##END\n");
        }
        fs::write(&payload, &text).unwrap();
        let sections = parse_pg_payload(&payload).unwrap();
        assert_eq!(sections.len(), BACKUP_TABLES.len());
        assert_eq!(sections[0].0, "Users");
        assert_eq!(sections[0].1, 2);
        assert_eq!(sections[0].2, 2);
        let ranges = BackupService::pg_payload_sections(&payload).unwrap();
        assert_eq!(ranges.len(), BACKUP_TABLES.len());
        assert_eq!(ranges[0].0, "Users");
        // El rango de Users cubre exactamente sus dos filas.
        let data = fs::read(&payload).unwrap();
        let users_data = &data[ranges[0].1 as usize..ranges[0].2 as usize];
        assert_eq!(
            std::str::from_utf8(users_data).unwrap(),
            "0\tvalor con \\n escapado\n1\tvalor con \\n escapado\n"
        );
        // Verificación contra un manifiesto sintético.
        let mut counts = BTreeMap::new();
        for table in BACKUP_TABLES {
            counts.insert(table.to_string(), if table == "Users" { 2 } else { 0 });
        }
        let manifest = BackupManifest {
            version: BACKUP_VERSION,
            format: BACKUP_FORMAT.to_string(),
            created_at: "2026-11-11T00:00:00Z".to_string(),
            password_hash: String::new(),
            original_name: String::new(),
            engine: "postgres".to_string(),
            sha256: String::new(),
            schema_version: 6,
            counts,
            automatic: false,
        };
        verify_postgres(&payload, &manifest).unwrap();
    }

    #[tokio::test]
    async fn postgres_dump_and_restore() {
        // El clúster local de pruebas es compartido con los tests
        // de contrato del store (que hacen DROP SCHEMA): este test
        // solo corre con LOGMASTER_TEST_BACKUP_PG=1 y en serie.
        if std::env::var("LOGMASTER_TEST_BACKUP_PG").as_deref() != Ok("1") {
            return;
        }
        let url = std::env::var("LOGMASTER_TEST_BACKUP_PG_URL").unwrap_or_else(|_| {
            "postgres://logmaster_test:logmaster-test-only-local@127.0.0.1:5432/logmaster_pg_test"
                .to_string()
        });
        let config = DatabaseConfig {
            engine: logmaster_store::DatabaseEngine::Postgres,
            sqlite_path: PathBuf::from(":memory:"),
            postgres_url: Some(url),
        };
        let db = Database::open(&config).await.unwrap();
        db.migrate().await.unwrap();
        let pool = match &db {
            Database::Postgres(pg) => pg.pool().clone(),
            _ => unreachable!(),
        };
        sqlx::query("DELETE FROM \"ActivityLogs\"")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM \"Users\"")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO \"Users\" (username, email, \"tokenVersion\", password, role, \"createdAt\", \"updatedAt\") \
             VALUES ('root', 'root@example.test', 5, 'hash', 'root', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let dir = test_dir("postgres_roundtrip");
        let service = service_for(&dir);
        let created = service.create(&db, false).await.unwrap();
        assert_eq!(created.manifest.engine, "postgres");
        assert_eq!(created.manifest.counts.get("Users"), Some(&1));
        let prepared = service
            .prepare(&created.name, &created.restore_password)
            .unwrap();
        drop(prepared);
        let prepared = service
            .prepare(&created.name, &created.restore_password)
            .unwrap();
        service.restore_postgres(&db, &prepared).await.unwrap();
        let token_version: i64 =
            sqlx::query_scalar("SELECT \"tokenVersion\" FROM \"Users\" WHERE username = 'root'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(token_version, 6);
        let audit: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM \"ActivityLogs\" WHERE action = 'BACKUP_RESTORE_COMPLETED'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(audit, 1);
    }
}
