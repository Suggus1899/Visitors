//! Base de datos elegible por configuración (doble motor).
//!
//! - `sqlite` (por defecto): `Store` embebido en WAL, un solo
//!   archivo, sin proceso externo.
//! - `postgres`: `PgStore` sobre sqlx contra un PostgreSQL 16
//!   externo, con las migraciones Goose 00001–00006.
//!
//! No hay sincronización entre ambos motores: son dos destinos
//! distintos y cada despliegue usa uno. `convert` sigue siendo el
//! camino PG → SQLite, de una sola vez.
//!
//! `Database` es el único punto de entrada que la aplicación usa:
//! abre el motor configurado, aplica sus migraciones, verifica
//! (ping + integridad/esquema + huellas de clave) y entrega los
//! repositorios como traits. Los handlers de la fase 4 trabajan
//! solo contra `Repositories`.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};

use crate::pg_migrations;
use crate::repos::pg::{
    PgArcoRepository, PgAuditRepository, PgCatalogRepository, PgSearchTokenRepository, PgStore,
    PgUserRepository, PgVisitRepository, PgVisitorRepository,
};
use crate::repos::sqlite::{
    SqliteArcoRepository, SqliteAuditRepository, SqliteCatalogRepository,
    SqliteSearchTokenRepository, SqliteUserRepository, SqliteVisitRepository,
    SqliteVisitorRepository,
};
use crate::repos::traits::{
    ArcoRepository, AuditRepository, CatalogRepository, SearchTokenRepository, UserRepository,
    VisitRepository, VisitorRepository,
};
use crate::Store;

/// Motor de base de datos (`[database] engine` en `config.toml`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseEngine {
    /// SQLite embebido en WAL (destino principal).
    Sqlite,
    /// PostgreSQL externo (variante por configuración).
    Postgres,
}

impl DatabaseEngine {
    /// Nombre en configuración (`"sqlite"` / `"postgres"`).
    pub fn as_str(self) -> &'static str {
        match self {
            DatabaseEngine::Sqlite => "sqlite",
            DatabaseEngine::Postgres => "postgres",
        }
    }

    /// Parsea el valor de configuración (insensible a mayúsculas).
    pub fn parse(value: &str) -> Result<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "sqlite" => Ok(DatabaseEngine::Sqlite),
            "postgres" | "postgresql" | "pg" => Ok(DatabaseEngine::Postgres),
            other => anyhow::bail!(
                "motor de base de datos desconocido: {other} (use \"sqlite\" o \"postgres\")"
            ),
        }
    }
}

/// Configuración para abrir la base (la construye `Config` en el
/// binario a partir de `config.toml` y el entorno).
#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    /// Motor elegido.
    pub engine: DatabaseEngine,
    /// Archivo SQLite (solo si el motor es `sqlite`).
    pub sqlite_path: PathBuf,
    /// Cadena de conexión PostgreSQL en formato URL
    /// (`postgres://usuario:clave@host:5432/base`); solo si el motor
    /// es `postgres`. Sin TLS, igual que `convert`.
    pub postgres_url: Option<String>,
}

/// Los siete repositorios como traits, listos para el dominio y los
/// handlers. Se clonan con `Arc`: todos los clones comparten la
/// misma base.
#[derive(Clone)]
pub struct Repositories {
    /// Cuentas de usuario.
    pub users: Arc<dyn UserRepository>,
    /// Perfiles de visitante e historial.
    pub visitors: Arc<dyn VisitorRepository>,
    /// Visitas y salidas temporales.
    pub visits: Arc<dyn VisitRepository>,
    /// Bitácora de actividad.
    pub audit: Arc<dyn AuditRepository>,
    /// Solicitudes ARCO y cancelación.
    pub arco: Arc<dyn ArcoRepository>,
    /// Catálogos heredados.
    pub catalogs: Arc<dyn CatalogRepository>,
    /// Búsqueda protegida y estados de índice.
    pub search: Arc<dyn SearchTokenRepository>,
}

/// Resultado de la prueba real de conexión: se usa en el log de
/// arranque, en `check` y en `GET /api/v1/health`.
#[derive(Debug, Clone)]
pub struct ConnectionProbe {
    /// Motor activo (`"sqlite"` o `"postgres"`).
    pub engine: &'static str,
    /// Versión del motor (`SQLite 3.x` o la cadena de
    /// `SELECT version()` de PostgreSQL).
    pub version: String,
    /// Latencia de la consulta de prueba, en milisegundos.
    pub latency_ms: u128,
    /// Host de PostgreSQL (solo `postgres`).
    pub host: Option<String>,
    /// Puerto de PostgreSQL (solo `postgres`).
    pub port: Option<u16>,
    /// Base de PostgreSQL (solo `postgres`).
    pub database: Option<String>,
    /// Archivo SQLite (solo `sqlite`).
    pub path: Option<PathBuf>,
    /// Versión de esquema aplicada (7 en SQLite, 6 en PostgreSQL).
    pub schema_version: usize,
}

/// Base de datos abierta, en uno de los dos motores.
#[derive(Clone)]
pub enum Database {
    /// SQLite embebido.
    Sqlite(Store),
    /// PostgreSQL externo (en caja: `PgStore` es mucho mayor que
    /// `Store` y clippy lo señala).
    Postgres(Box<PgStore>),
}

impl Database {
    /// Abre el motor configurado. Para PostgreSQL, la conexión se
    /// establece aquí (un fallo —credenciales, host, base— es un
    /// error con el motivo concreto, no un arranque silencioso).
    pub async fn open(config: &DatabaseConfig) -> Result<Self> {
        match config.engine {
            DatabaseEngine::Sqlite => {
                let store = Store::open(&config.sqlite_path)?;
                Ok(Database::Sqlite(store))
            }
            DatabaseEngine::Postgres => {
                let url = config.postgres_url.as_deref().ok_or_else(|| {
                    anyhow::anyhow!(
                        "database = \"postgres\" necesita una cadena de conexión: \
                         [database] url en config.toml o DATABASE_URL"
                    )
                })?;
                let pg = PgStore::open(url).await?;
                Ok(Database::Postgres(Box::new(pg)))
            }
        }
    }

    /// Motor activo.
    pub fn engine(&self) -> DatabaseEngine {
        match self {
            Database::Sqlite(_) => DatabaseEngine::Sqlite,
            Database::Postgres(_) => DatabaseEngine::Postgres,
        }
    }

    /// Acceso al `Store` SQLite subyacente, si el motor es `sqlite`.
    /// Lo usan `convert` y `preflight --db`, que son SQLite puros.
    pub fn sqlite_store(&self) -> Option<&Store> {
        match self {
            Database::Sqlite(store) => Some(store),
            Database::Postgres(_) => None,
        }
    }

    /// Los siete repositorios como traits.
    pub fn repositories(&self) -> Repositories {
        match self {
            Database::Sqlite(store) => Repositories {
                users: Arc::new(SqliteUserRepository::new(store.clone())),
                visitors: Arc::new(SqliteVisitorRepository::new(store.clone())),
                visits: Arc::new(SqliteVisitRepository::new(store.clone())),
                audit: Arc::new(SqliteAuditRepository::new(store.clone())),
                arco: Arc::new(SqliteArcoRepository::new(store.clone())),
                catalogs: Arc::new(SqliteCatalogRepository::new(store.clone())),
                search: Arc::new(SqliteSearchTokenRepository::new(store.clone())),
            },
            Database::Postgres(pg) => {
                let pool = pg.pool().clone();
                Repositories {
                    users: Arc::new(PgUserRepository::new(pool.clone())),
                    visitors: Arc::new(PgVisitorRepository::new(pool.clone())),
                    visits: Arc::new(PgVisitRepository::new(pool.clone())),
                    audit: Arc::new(PgAuditRepository::new(pool.clone())),
                    arco: Arc::new(PgArcoRepository::new(pool.clone())),
                    catalogs: Arc::new(PgCatalogRepository::new(pool.clone())),
                    search: Arc::new(PgSearchTokenRepository::new(pool)),
                }
            }
        }
    }

    /// Aplica las migraciones pendientes del motor elegido.
    pub async fn migrate(&self) -> Result<()> {
        match self {
            Database::Sqlite(store) => store.migrate(),
            Database::Postgres(pg) => pg.migrate().await,
        }
    }

    /// Comprueba que la base responde (`SELECT 1`).
    pub async fn ping(&self) -> Result<()> {
        match self {
            Database::Sqlite(store) => store.ping(),
            Database::Postgres(pg) => pg.ping().await,
        }
    }

    /// Versión de esquema aplicada (7 en SQLite —la 1 es
    /// infraestructura propia—; 6 en PostgreSQL, la última Goose).
    pub async fn schema_version(&self) -> Result<usize> {
        match self {
            Database::Sqlite(store) => store.schema_version(),
            Database::Postgres(pg) => pg.schema_version().await,
        }
    }

    /// Verificación completa para el arranque y `check`: responde y
    /// es íntegra (SQLite: `integrity_check`; PostgreSQL: versión de
    /// esquema esperada). Si algo falla, el proceso no debe abrir el
    /// puerto.
    pub async fn verify(&self) -> Result<()> {
        match self {
            Database::Sqlite(store) => store.verify(),
            Database::Postgres(pg) => {
                pg.ping().await?;
                let version = pg.schema_version().await?;
                anyhow::ensure!(
                    version == pg_migrations::PG_MIGRATION_COUNT,
                    "versión de esquema PostgreSQL {version}, se esperaba {}",
                    pg_migrations::PG_MIGRATION_COUNT
                );
                Ok(())
            }
        }
    }

    /// Comprueba las huellas de clave de los índices de identidad y
    /// búsqueda, como `Store::verify_key_fingerprints`. Devuelve
    /// `true` si ambos índices están preparados (`ready`) con la
    /// huella de la clave dada.
    pub async fn verify_key_fingerprints(&self, key: &[u8; 32]) -> Result<bool> {
        match self {
            Database::Sqlite(store) => store.verify_key_fingerprints(key),
            Database::Postgres(_) => {
                let search = self.repositories().search;
                let search_state = search
                    .get_search_state()
                    .await
                    .context("leer SearchIndexState")?;
                let identity_state = search
                    .get_identity_state()
                    .await
                    .context("leer IdentityIndexState")?;
                if search_state.ready
                    && search_state.fingerprint != logmaster_crypto::search_fingerprint(key)
                {
                    anyhow::bail!("la huella del índice de búsqueda no coincide con la clave");
                }
                if identity_state.ready
                    && identity_state.fingerprint != logmaster_crypto::identity_fingerprint(key)
                {
                    anyhow::bail!("la huella del índice de identidad no coincide con la clave");
                }
                Ok(search_state.ready && identity_state.ready)
            }
        }
    }

    /// Prueba real de la conexión configurada: abre la conexión,
    /// ejecuta una consulta mínima y mide la latencia.
    /// - PostgreSQL: `SELECT version()`; informa host, puerto, base
    ///   y versión del servidor. Un fallo trae el motivo concreto
    ///   (credenciales, host inalcanzable, base inexistente, TLS).
    /// - SQLite: `SELECT 1` + versión de esquema; informa el archivo
    ///   y la versión de SQLite.
    pub async fn test_connection(&self) -> Result<ConnectionProbe> {
        let start = Instant::now();
        match self {
            Database::Sqlite(store) => {
                store.ping()?;
                let version = store.schema_version()?;
                Ok(ConnectionProbe {
                    engine: "sqlite",
                    version: format!("SQLite {}", rusqlite::version()),
                    latency_ms: start.elapsed().as_millis(),
                    host: None,
                    port: None,
                    database: None,
                    path: Some(store.path().to_path_buf()),
                    schema_version: version,
                })
            }
            Database::Postgres(pg) => {
                let version = pg.server_version().await?;
                let schema_version = pg.schema_version().await?;
                Ok(ConnectionProbe {
                    engine: "postgres",
                    version,
                    latency_ms: start.elapsed().as_millis(),
                    host: Some(pg.host().to_string()),
                    port: Some(pg.port()),
                    database: pg.database().map(str::to_string),
                    path: None,
                    schema_version,
                })
            }
        }
    }
}
