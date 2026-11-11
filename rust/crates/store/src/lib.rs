//! Acceso a la base embebida de LogMaster (SQLite en modo WAL).
//!
//! Reglas tomadas del documento de migracion (secciones 2.1 y 11.1):
//! - `journal_mode = WAL`: lecturas concurrentes con una escritura a la vez.
//! - `foreign_keys = ON` en cada conexion: en SQLite vienen apagadas por
//!   defecto y olvidarlas es el error clasico de esta migracion.
//! - `busy_timeout` de 5 s: las escrituras cortas esperan su turno en vez
//!   de fallar con SQLITE_BUSY.
//! - Una unica conexion compartida con Mutex: el destino es un solo
//!   proceso con un solo escritor, asi que no hace falta un pool.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result};
use rusqlite::{Connection, TransactionBehavior};

pub mod crypto;
pub mod database;
pub mod error;
pub mod migrations;
pub mod models;
pub mod pg_migrations;
pub mod preflight;
pub mod repos;
pub mod retention;

pub use database::{ConnectionProbe, Database, DatabaseConfig, DatabaseEngine, Repositories};
pub use retention::RetentionCounts;

/// Versión esperada del esquema (número de migraciones definidas).
pub const SCHEMA_VERSION: usize = migrations::MIGRATION_COUNT;

/// Base SQLite abierta. Clonable: todos los clones comparten la conexion.
#[derive(Clone)]
pub struct Store {
    conn: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl Store {
    /// Abre una conexión con los pragmas del diseño (WAL, FK ON,
    /// busy_timeout de 5 s). La usan `open` y `replace_with`.
    fn open_connection(path: &Path) -> Result<Connection> {
        let conn =
            Connection::open(path).with_context(|| format!("abrir base {}", path.display()))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(Duration::from_millis(5000))?;
        Ok(conn)
    }

    /// Abre (o crea) el archivo de base y deja los pragmas del diseno.
    /// Crea la carpeta padre si no existe.
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("crear carpeta de datos {}", parent.display()))?;
            }
        }
        let conn = Self::open_connection(path)?;
        tracing::debug!(path = %path.display(), "base SQLite abierta (WAL, FK ON)");
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            path: path.to_path_buf(),
        })
    }

    /// Ruta del archivo de base.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Aplica las migraciones pendientes, de forma transaccional.
    pub fn migrate(&self) -> Result<()> {
        let mut conn = self.conn.lock().expect("lock de la base");
        migrations::apply(&mut conn)
    }

    /// Versión de esquema aplicada. `rusqlite_migration` 1.x la guarda
    /// en `PRAGMA user_version`, no en una tabla propia.
    pub fn schema_version(&self) -> Result<usize> {
        let conn = self.conn.lock().expect("lock de la base");
        let version = migrations::migrations().current_version(&conn)?;
        Ok(usize::from(&version))
    }

    /// Ejecuta un cierre con la conexión, para lecturas.
    pub fn read<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let conn = self.conn.lock().expect("lock de la base");
        f(&conn)
    }

    /// Como `read`, pero el cierre devuelve `StoreResult` y el error
    /// de dominio se conserva sin pasar por anyhow: lo usan las
    /// implementaciones `Sqlite*Repository` de los traits, que deben
    /// devolver los mismos códigos de error que las funciones libres.
    pub fn read_store<T, F>(&self, f: F) -> crate::error::StoreResult<T>
    where
        F: FnOnce(&Connection) -> crate::error::StoreResult<T>,
    {
        let conn = self.conn.lock().expect("lock de la base");
        f(&conn)
    }

    /// Ejecuta un cierre dentro de una transacción inmediata: la
    /// escritura toma el candado al empezar, así que la lectura del
    /// estado, la mutación y la auditoría son atómicas —es el
    /// equivalente en SQLite al `FOR UPDATE` + transacción de Go—.
    /// Si el cierre devuelve error, la transacción se revierte.
    pub fn tx_immediate<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&rusqlite::Transaction<'_>) -> Result<T>,
    {
        let mut conn = self.conn.lock().expect("lock de la base");
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let result = f(&tx);
        match result {
            Ok(value) => {
                tx.commit()?;
                Ok(value)
            }
            Err(e) => {
                let _ = tx.rollback();
                Err(e)
            }
        }
    }

    /// Como `tx_immediate`, pero el cierre devuelve `StoreResult` y
    /// el error de dominio se conserva sin pasar por anyhow: lo usan
    /// las implementaciones `Sqlite*Repository` de los traits.
    pub fn tx_store<T, F>(&self, f: F) -> crate::error::StoreResult<T>
    where
        F: FnOnce(&rusqlite::Transaction<'_>) -> crate::error::StoreResult<T>,
    {
        let mut conn = self.conn.lock().expect("lock de la base");
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(crate::error::StoreError::from)?;
        let result = f(&tx);
        match result {
            Ok(value) => {
                tx.commit().map_err(crate::error::StoreError::from)?;
                Ok(value)
            }
            Err(e) => {
                let _ = tx.rollback();
                Err(e)
            }
        }
    }

    /// Comprueba que la base responde (`SELECT 1`).
    pub fn ping(&self) -> Result<()> {
        let conn = self.conn.lock().expect("lock de la base");
        let value: i64 = conn.query_row("SELECT 1", [], |row| row.get(0))?;
        anyhow::ensure!(value == 1, "SELECT 1 devolvio un valor inesperado");
        Ok(())
    }

    /// `PRAGMA integrity_check`: debe devolver `ok`.
    pub fn integrity_check(&self) -> Result<String> {
        let conn = self.conn.lock().expect("lock de la base");
        let value: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        Ok(value)
    }

    /// Verificacion completa para `check` y para el arranque: responde y
    /// es integra. Si algo falla, el proceso no debe abrir el puerto.
    pub fn verify(&self) -> Result<()> {
        self.ping()?;
        let integrity = self.integrity_check()?;
        anyhow::ensure!(integrity == "ok", "integridad de la base: {integrity}");
        Ok(())
    }

    /// Copia en línea de la base a otro archivo (API de respaldo de
    /// rusqlite): instantánea consistente sin detener el servidor.
    /// El destino queda como base SQLite válida, lista para cifrar.
    pub fn backup_to(&self, dest: &Path) -> Result<()> {
        let conn = self.conn.lock().expect("lock de la base");
        let mut dest_conn = Connection::open(dest)
            .with_context(|| format!("abrir destino de respaldo {}", dest.display()))?;
        let backup = rusqlite::backup::Backup::new(&conn, &mut dest_conn)
            .context("iniciar copia en línea de SQLite")?;
        backup
            .run_to_completion(100, Duration::from_millis(0), None)
            .context("copia en línea de SQLite")?;
        Ok(())
    }

    /// Número de filas por tabla (los nombres vienen de una lista
    /// interna fija, nunca de entrada externa).
    pub fn table_counts(&self, tables: &[&str]) -> Result<std::collections::BTreeMap<String, u64>> {
        self.read(|conn| {
            let mut counts = std::collections::BTreeMap::new();
            for table in tables {
                let count: i64 =
                    conn.query_row(&format!("SELECT COUNT(*) FROM \"{table}\""), [], |row| {
                        row.get(0)
                    })?;
                counts.insert((*table).to_string(), count as u64);
            }
            Ok(counts)
        })
    }

    /// Vacía el WAL en el archivo principal (los datos pendientes
    /// quedan en el `.db`, no en el `-wal`).
    pub fn checkpoint(&self) -> Result<()> {
        self.read(|conn| {
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
            Ok(())
        })
    }

    /// Sustituye el archivo de base vivo por otro ya verificado
    /// (`staged`, en la misma carpeta: el rename es atómico) y
    /// reabre la conexión sobre él. Es el intercambio en vivo de
    /// la restauración por HTTP (fase 6): todos los clones de este
    /// `Store` comparten la misma conexión, así que ven la base
    /// restaurada sin reiniciar. El archivo viejo queda sustituido;
    /// el llamador guarda antes una copia si quiere conservarlo.
    pub fn replace_with(&self, staged: &Path) -> Result<()> {
        anyhow::ensure!(
            staged.exists(),
            "archivo de restauración no encontrado: {}",
            staged.display()
        );
        let live = self.path.clone();
        let new_conn = Self::open_connection(staged)?;
        {
            let mut guard = self.conn.lock().expect("lock de la base");
            let old = std::mem::replace(&mut *guard, new_conn);
            drop(old); // cierra la conexión vieja: libera el archivo vivo
        }
        // El -wal/-shm del archivo vivo pertenecen a la conexión
        // vieja; el nuevo archivo ya trae los datos consolidados.
        for suffix in ["-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", live.display()));
        }
        std::fs::rename(staged, &live).with_context(|| {
            format!("sustituir base {} por {}", live.display(), staged.display())
        })?;
        // El -shm del archivo preparado quedó con el nombre viejo.
        for suffix in ["-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", staged.display()));
        }
        self.verify()
    }

    /// Comprueba las huellas de clave de los indices de identidad y
    /// busqueda, como `New()` de Go (que no arranca si no coinciden).
    /// Devuelve `true` si ambos indices estan preparados (`ready`) con
    /// la huella de la clave dada, y `false` si aun no estan
    /// preparados. La diferencia con Go es deliberada: Go se niega a
    /// arrancar con el indice sin preparar, pero en Rust la
    /// reconstruccion (`ops reindex`) llega en la fase 6 y una base
    /// nueva no podria arrancar nunca; aqui solo es un error que un
    /// indice preparado tenga otra huella (clave equivocada). El
    /// llamador avisa cuando no estan preparados.
    pub fn verify_key_fingerprints(&self, key: &[u8; 32]) -> Result<bool> {
        let (search, identity) = self.read(|conn| {
            let search =
                crate::repos::search::get_search_state(conn).map_err(anyhow::Error::from)?;
            let identity =
                crate::repos::search::get_identity_state(conn).map_err(anyhow::Error::from)?;
            Ok((search, identity))
        })?;
        if search.ready && search.fingerprint != logmaster_crypto::search_fingerprint(key) {
            anyhow::bail!("la huella del indice de busqueda no coincide con la clave");
        }
        if identity.ready && identity.fingerprint != logmaster_crypto::identity_fingerprint(key) {
            anyhow::bail!("la huella del indice de identidad no coincide con la clave");
        }
        Ok(search.ready && identity.ready)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated() -> Store {
        let store = Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        store
    }

    #[test]
    fn key_fingerprints_match_or_report_not_ready() {
        let key = [0x19u8; 32];
        let store = migrated();
        // Base nueva: indices sin preparar.
        assert!(!store.verify_key_fingerprints(&key).unwrap());
        // Preparados con la huella correcta: listos.
        store
            .tx_immediate(|tx| {
                crate::repos::search::set_search_state(
                    tx,
                    &logmaster_crypto::search_fingerprint(&key),
                    0,
                    true,
                )
                .map_err(anyhow::Error::from)?;
                crate::repos::search::set_identity_state(
                    tx,
                    &logmaster_crypto::identity_fingerprint(&key),
                    true,
                )
                .map_err(anyhow::Error::from)?;
                Ok(())
            })
            .unwrap();
        assert!(store.verify_key_fingerprints(&key).unwrap());
        // Otra clave: error, no arranque con datos de otra clave.
        assert!(store.verify_key_fingerprints(&[0x20u8; 32]).is_err());
    }
}
