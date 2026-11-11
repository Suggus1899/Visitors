//! Implementaciones PostgreSQL de los traits de repositorio, sobre
//! sqlx.
//!
//! Reutilizan casi literal el SQL de Go (`server-go/db/queries.sql`
//! y los SQL de `visits.go` y `privacy.go`): mismo dialecto (`$n`,
//! `RETURNING`, upserts con `ON CONFLICT DO NOTHING`, `FOR UPDATE`
//! en las lecturas que bloquean fila). Diferencias con Go, todas
//! deliberadas y documentadas:
//! - Las marcas de tiempo las pasa el llamador (`now: &str`, en UTC
//!   ISO 8601 canónico) en vez de `now()` del servidor, igual que la
//!   variante SQLite: las pruebas son deterministas y el valor
//!   guardado es el mismo en ambos motores.
//! - Los enums (`Users.role`, `Visits.status`, `Visits.action`,
//!   `ArcoRequests.requestType/status`) se leen con `::text` y se
//!   comparan con `$n::"enum_..."`, porque sqlx no decodifica un
//!   enum de PostgreSQL a `String` por sí solo. En INSERT/UPDATE el
//!   parámetro de texto se convierte por asignación, como en Go.
//! - `SearchIndexState.id` e `IdentityIndexState.id` son `BOOLEAN`
//!   en PostgreSQL y `INTEGER` 1 en SQLite (y en los modelos): se
//!   seleccionan como el literal `1` y se filtran con `id = true`,
//!   como hace Go (`WHERE id=true`).
//! - Los ids de PostgreSQL son `INTEGER` (int4) y los modelos usan
//!   `i64`: se convierten con `as i32` al enlazar y `as i64` al leer.
//!   Las secuencias son `integer`, así que no hay truncado real.
//! - La cancelación ARCO usa `= ANY($n)` con arrays, como Go;
//!   la variante SQLite construye los `IN (?, ?, ...)` a mano.
//! - Los valores cifrados/HMAC/trigramas se calculan en la crate
//!   `crypto` y se guardan como columnas: eso no cambia entre
//!   motores.
//!
//! Cada método de escritura multi-sentencia (`transition`,
//! `cancel_subject`, `replace_tokens`) corre en una transacción
//! sqlx; los de una sola sentencia se ejecutan directos sobre el
//! pool (ya son atómicos).

use std::str::FromStr;

use async_trait::async_trait;
use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgRow};
use sqlx::{PgPool, Row};

use crate::error::{is_pg_unique_violation, StoreError, StoreResult};
use crate::models::{
    ActivityLog, ArcoRequest, Department, IdentityIndexState, IntermittentLog, ReportRow,
    SearchIndexState, User, Visit, VisitPurpose, Visitor, VisitorEditHistory, VisitorSearchToken,
};
use crate::pg_migrations;
use crate::repos::audit::{AuditEntry, AuditFilter};
use crate::repos::privacy::{ArcoFilter, CancelAudit, NewArcoRequest};
use crate::repos::traits::{
    ArcoRepository, AuditRepository, CatalogRepository, CheckinInput, CheckinOutcome, ProfileEdit,
    SearchTokenRepository, UnitOfWork, UserRepository, VisitRepository, VisitorRepository,
};
use crate::repos::users::NewUser;
use crate::repos::visitors::{NewEditHistory, NewVisitor, VisitorFilter};
use crate::repos::visits::{NewVisit, Transition, TransitionCall, VisitFilter};
use crate::repos::Actor;

/// Formato canónico de fecha del modelo: UTC ISO 8601 con 6
/// decimales y `Z` (`%Y-%m-%dT%H:%M:%S%.6fZ`).
fn fmt_ts(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string()
}

/// `TIMESTAMP` (sin zona) → canónico, asumiendo UTC como hace el
/// resto de la capa (los valores los escribe este código en UTC).
fn fmt_naive(dt: NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string()
}

/// Canónico → `TIMESTAMPTZ`.
fn parse_ts(value: &str) -> StoreResult<DateTime<Utc>> {
    DateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.6fZ")
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|_| value.parse::<DateTime<Utc>>())
        .map_err(|e| StoreError::Validation(format!("fecha inválida {value}: {e}")))
}

/// Canónico → `TIMESTAMP` (sin zona).
fn parse_naive(value: &str) -> StoreResult<NaiveDateTime> {
    let trimmed = value.strip_suffix('Z').unwrap_or(value);
    NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S%.6f")
        .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S"))
        .map_err(|e| StoreError::Validation(format!("fecha inválida {value}: {e}")))
}

/// Id del modelo (`i64`) → `INTEGER` de PostgreSQL.
fn id32(id: i64) -> i32 {
    id as i32
}

/// Motivo concreto de un fallo de conexión o consulta a PostgreSQL,
/// en español, para el log de arranque y `check`: distingue
/// credenciales, base inexistente, host inalcanzable y TLS.
pub fn pg_error_reason(error: &sqlx::Error) -> String {
    match error {
        sqlx::Error::Database(db) => match db.code().as_deref() {
            Some("28P01") => {
                "credenciales rechazadas por PostgreSQL (usuario o contraseña incorrectos)"
                    .to_string()
            }
            Some("3D000") => "la base de datos no existe en ese servidor".to_string(),
            Some("28000") => {
                "autorización no válida (rol inexistente o sin permiso de conexión)".to_string()
            }
            Some("42501") => "permiso denegado en PostgreSQL (faltan privilegios)".to_string(),
            Some(code) => format!("PostgreSQL devolvió {code}: {}", db.message()),
            None => format!("PostgreSQL devolvió un error: {}", db.message()),
        },
        sqlx::Error::Io(e) => {
            let text = e.to_string();
            if text.contains("Connection refused") {
                "host inalcanzable: conexión rechazada (¿PostgreSQL está en marcha y el puerto es el correcto?)".to_string()
            } else if text.contains("failed to lookup address") || text.contains("dns") {
                "host inalcanzable: no se pudo resolver el nombre del servidor".to_string()
            } else if text.contains("timed out") || text.contains("TimedOut") {
                "host inalcanzable: tiempo de espera agotado (¿firewall o servidor apagado?)"
                    .to_string()
            } else {
                format!("error de red al conectar con PostgreSQL: {text}")
            }
        }
        sqlx::Error::Tls(e) => {
            format!("TLS con PostgreSQL: {e} (la conexión es sin TLS por defecto; ver config.toml)")
        }
        other => {
            let text = other.to_string();
            if text.contains("Connection refused") {
                "host inalcanzable: conexión rechazada (¿PostgreSQL está en marcha y el puerto es el correcto?)".to_string()
            } else if text.contains("password authentication failed") {
                "credenciales rechazadas por PostgreSQL (usuario o contraseña incorrectos)"
                    .to_string()
            } else if text.contains("database") && text.contains("does not exist") {
                "la base de datos no existe en ese servidor".to_string()
            } else {
                format!("error de PostgreSQL: {text}")
            }
        }
    }
}

/// Conexión sqlx a PostgreSQL, con migraciones Goose y repositorios.
#[derive(Clone)]
pub struct PgStore {
    pool: PgPool,
    options: PgConnectOptions,
}

impl PgStore {
    /// Abre el pool contra la cadena de conexión (formato URL:
    /// `postgres://usuario:clave@host:5432/base`). Sin TLS, igual
    /// que `convert`: mismo host o red de confianza.
    pub async fn open(url: &str) -> anyhow::Result<Self> {
        let options = PgConnectOptions::from_str(url)
            .map_err(|e| anyhow::anyhow!("cadena de conexión PostgreSQL inválida: {e}"))?;
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect_with(options.clone())
            .await
            .map_err(|e| anyhow::anyhow!("{}: {e}", pg_error_reason(&e)))?;
        Ok(Self { pool, options })
    }

    /// Pool sqlx.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Host configurado (para el informe de conexión).
    pub fn host(&self) -> &str {
        self.options.get_host()
    }

    /// Puerto configurado.
    pub fn port(&self) -> u16 {
        self.options.get_port()
    }

    /// Base configurada.
    pub fn database(&self) -> Option<&str> {
        self.options.get_database()
    }

    /// Usuario configurado.
    pub fn username(&self) -> &str {
        self.options.get_username()
    }

    /// Aplica las migraciones Goose pendientes.
    pub async fn migrate(&self) -> anyhow::Result<()> {
        pg_migrations::apply(&self.pool).await
    }

    /// Versión de esquema aplicada (máxima Goose en
    /// `goose_db_version`; 0 si aún no hay nada).
    pub async fn schema_version(&self) -> anyhow::Result<usize> {
        pg_migrations::schema_version(&self.pool).await
    }

    /// Comprueba que la base responde (`SELECT 1`).
    pub async fn ping(&self) -> anyhow::Result<()> {
        sqlx::query_scalar::<_, i32>("SELECT 1")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| anyhow::anyhow!("{}: {e}", pg_error_reason(&e)))?;
        Ok(())
    }

    /// Versión del servidor (`SELECT version()`).
    pub async fn server_version(&self) -> anyhow::Result<String> {
        let version = sqlx::query_scalar::<_, String>("SELECT version()")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| anyhow::anyhow!("{}: {e}", pg_error_reason(&e)))?;
        Ok(version)
    }
}

// ---------------------------------------------------------------------
// Mapeo de filas (mismo orden de columnas que las listas SQLite).
// ---------------------------------------------------------------------

const USER_COLUMNS: &str = "id, username, email, \"tokenVersion\", password, \
    role::text AS role, \"resetToken\", \"resetTokenExpiry\", \"createdAt\", \"updatedAt\", \
    \"mustChangePassword\", \"passwordChangedAt\", \"loginAttempts\", \"lockedUntil\"";

fn user_from_row(row: &PgRow) -> Result<User, sqlx::Error> {
    Ok(User {
        id: row.try_get::<i32, _>(0)? as i64,
        username: row.try_get(1)?,
        email: row.try_get(2)?,
        token_version: row.try_get::<i32, _>(3)? as i64,
        password_hash: row.try_get(4)?,
        role: row.try_get(5)?,
        reset_token: row.try_get(6)?,
        reset_token_expiry: row.try_get::<Option<DateTime<Utc>>, _>(7)?.map(fmt_ts),
        created_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(8)?),
        updated_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(9)?),
        must_change_password: row.try_get::<Option<bool>, _>(10)?,
        password_changed_at: row.try_get::<Option<DateTime<Utc>>, _>(11)?.map(fmt_ts),
        login_attempts: row.try_get::<Option<i32>, _>(12)?.map(i64::from),
        locked_until: row.try_get::<Option<DateTime<Utc>>, _>(13)?.map(fmt_ts),
    })
}

const VISITOR_COLUMNS: &str = "id, \"anonymizedAt\", cedula, encrypted_cedula, first_name, \
    last_name, company, job_title, photo_url, id_photo_url, email, phone, \"updatedAt\", \
    photo_data, id_photo_data, \"isBlocked\", observations, \"createdAt\"";

fn visitor_from_row(row: &PgRow) -> Result<Visitor, sqlx::Error> {
    Ok(Visitor {
        id: row.try_get::<i32, _>(0)? as i64,
        anonymized_at: row.try_get::<Option<DateTime<Utc>>, _>(1)?.map(fmt_ts),
        cedula: row.try_get(2)?,
        encrypted_cedula: row.try_get(3)?,
        first_name: row.try_get(4)?,
        last_name: row.try_get(5)?,
        company: row.try_get(6)?,
        job_title: row.try_get(7)?,
        photo_url: row.try_get(8)?,
        id_photo_url: row.try_get(9)?,
        email: row.try_get(10)?,
        phone: row.try_get(11)?,
        updated_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(12)?),
        photo_data: row.try_get(13)?,
        id_photo_data: row.try_get(14)?,
        is_blocked: row.try_get::<Option<bool>, _>(15)?,
        observations: row.try_get(16)?,
        created_at: row.try_get::<Option<DateTime<Utc>>, _>(17)?.map(fmt_ts),
    })
}

const VISIT_COLUMNS: &str = "id, visitor_cedula, purpose, person_to_visit, check_in_time, \
    check_out_time, status::text AS status, notes, companion_name, companion_cedula, \
    vehicle_brand, vehicle_model, vehicle_plate, area, action::text AS action, department, \
    \"createdAt\", \"updatedAt\", visitor_id, arrival_time, entry_time, exit_time, \
    target_department, host_person, consent_policy_version, consent_accepted_at, \
    consent_recorded_by, cancellation_reason";

/// Como `VISIT_COLUMNS`, con el alias `v.` de `list_filtered` (que
/// une `Visitors` como `p`, igual que `visitFrom` de Go).
const VISIT_COLUMNS_V: &str = "v.id, v.visitor_cedula, v.purpose, v.person_to_visit, v.check_in_time, \
    v.check_out_time, v.status::text AS status, v.notes, v.companion_name, v.companion_cedula, \
    v.vehicle_brand, v.vehicle_model, v.vehicle_plate, v.area, v.action::text AS action, v.department, \
    v.\"createdAt\", v.\"updatedAt\", v.visitor_id, v.arrival_time, v.entry_time, v.exit_time, \
    v.target_department, v.host_person, v.consent_policy_version, v.consent_accepted_at, \
    v.consent_recorded_by, v.cancellation_reason";

/// Condiciones de `list_filtered` (`visitFilter` de Go): rango,
/// estado, empresa (ILIKE), hash de cédula y búsqueda por texto
/// (propósito, a quién visita, notas, anfitrión, departamento
/// destino, empresa o candidatos del índice). La unión es la de
/// `visitFrom` de Go: el perfil por id, o por cédula cuando la
/// visita no guarda id (legado).
fn visit_filter_where<'a>(
    qb: &mut sqlx::QueryBuilder<'a, sqlx::Postgres>,
    filter: &'a VisitFilter,
) -> StoreResult<()> {
    qb.push(" WHERE 1 = 1");
    if let Some(start) = &filter.start {
        qb.push(" AND v.check_in_time >= ");
        qb.push_bind(parse_ts(start)?);
    }
    if let Some(end) = &filter.end {
        qb.push(" AND v.check_in_time < ");
        qb.push_bind(parse_ts(end)?);
    }
    if let Some(status) = &filter.status {
        qb.push(" AND v.status = ");
        qb.push_bind(status);
        qb.push("::\"enum_Visits_status\"");
    }
    if let Some(company) = &filter.company {
        qb.push(" AND p.company ILIKE '%' || ");
        qb.push_bind(company);
        qb.push(" || '%'");
    }
    if let Some(hash) = &filter.cedula_hash {
        qb.push(" AND v.visitor_cedula = ");
        qb.push_bind(hash);
    }
    if let Some(ids) = &filter.visitor_ids {
        let ids: Vec<i32> = ids.iter().map(|id| *id as i32).collect();
        qb.push(" AND p.id = ANY(");
        qb.push_bind(ids);
        qb.push(")");
    }
    if let Some(search) = &filter.search {
        qb.push(" AND (v.purpose ILIKE '%' || ");
        qb.push_bind(search);
        qb.push(" || '%' OR v.person_to_visit ILIKE '%' || ");
        qb.push_bind(search);
        qb.push(" || '%' OR v.notes ILIKE '%' || ");
        qb.push_bind(search);
        qb.push(" || '%' OR v.host_person ILIKE '%' || ");
        qb.push_bind(search);
        qb.push(" || '%' OR v.target_department ILIKE '%' || ");
        qb.push_bind(search);
        qb.push(" || '%' OR p.company ILIKE '%' || ");
        qb.push_bind(search);
        qb.push(" || '%')");
    }
    Ok(())
}

/// Orden de `list_filtered` (`parseVisitSort` de Go): columna en
/// lista blanca y dirección `asc`/`desc`, con `NULLS LAST, v.id DESC`.
fn visit_sort(filter: &VisitFilter) -> String {
    let column = match filter.sort_field.as_str() {
        "arrival_time" => "v.arrival_time",
        "check_in_time" => "v.check_in_time",
        "entry_time" => "v.entry_time",
        "exit_time" => "v.exit_time",
        "check_out_time" => "v.check_out_time",
        "status" => "v.status",
        "company" => "p.company",
        _ => "v.check_in_time",
    };
    let dir = if filter.sort_dir.eq_ignore_ascii_case("asc") {
        "ASC"
    } else {
        "DESC"
    };
    format!(" ORDER BY {column} {dir} NULLS LAST, v.id DESC")
}

fn visit_from_row(row: &PgRow) -> Result<Visit, sqlx::Error> {
    Ok(Visit {
        id: row.try_get::<i32, _>(0)? as i64,
        visitor_cedula: row.try_get(1)?,
        purpose: row.try_get(2)?,
        person_to_visit: row.try_get(3)?,
        check_in_time: row.try_get::<Option<DateTime<Utc>>, _>(4)?.map(fmt_ts),
        check_out_time: row.try_get::<Option<DateTime<Utc>>, _>(5)?.map(fmt_ts),
        status: row.try_get(6)?,
        notes: row.try_get(7)?,
        companion_name: row.try_get(8)?,
        companion_cedula: row.try_get(9)?,
        vehicle_brand: row.try_get(10)?,
        vehicle_model: row.try_get(11)?,
        vehicle_plate: row.try_get(12)?,
        area: row.try_get(13)?,
        action: row.try_get(14)?,
        department: row.try_get(15)?,
        created_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(16)?),
        updated_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(17)?),
        visitor_id: row.try_get::<Option<i32>, _>(18)?.map(i64::from),
        arrival_time: row.try_get::<Option<DateTime<Utc>>, _>(19)?.map(fmt_ts),
        entry_time: row.try_get::<Option<DateTime<Utc>>, _>(20)?.map(fmt_ts),
        exit_time: row.try_get::<Option<DateTime<Utc>>, _>(21)?.map(fmt_ts),
        target_department: row.try_get(22)?,
        host_person: row.try_get(23)?,
        consent_policy_version: row.try_get(24)?,
        consent_accepted_at: row.try_get::<Option<DateTime<Utc>>, _>(25)?.map(fmt_ts),
        consent_recorded_by: row.try_get::<Option<i32>, _>(26)?.map(i64::from),
        cancellation_reason: row.try_get(27)?,
    })
}

const LOG_COLUMNS: &str = "id, \"userId\", username, action, entity, \"entityId\", details, \
    \"ipAddress\", \"userAgent\", \"createdAt\", method, path, \"statusCode\", duration, \
    severity, role, resource, \"resourceId\", status";

fn log_from_row(row: &PgRow) -> Result<ActivityLog, sqlx::Error> {
    Ok(ActivityLog {
        id: row.try_get::<i32, _>(0)? as i64,
        user_id: row.try_get::<i32, _>(1)? as i64,
        username: row.try_get(2)?,
        action: row.try_get(3)?,
        entity: row.try_get(4)?,
        entity_id: row.try_get(5)?,
        details: row.try_get(6)?,
        ip_address: row.try_get(7)?,
        user_agent: row.try_get(8)?,
        created_at: row.try_get::<Option<DateTime<Utc>>, _>(9)?.map(fmt_ts),
        method: row.try_get(10)?,
        path: row.try_get(11)?,
        status_code: row.try_get::<Option<i32>, _>(12)?.map(i64::from),
        duration: row.try_get::<Option<i32>, _>(13)?.map(i64::from),
        severity: row.try_get(14)?,
        role: row.try_get(15)?,
        resource: row.try_get(16)?,
        resource_id: row.try_get::<Option<i32>, _>(17)?.map(i64::from),
        status: row.try_get(18)?,
    })
}

const REQUEST_COLUMNS: &str = "id, \"requestType\"::text AS \"requestType\", \
    \"subjectCedulaHash\", \"subjectCedulaEncrypted\", \"requestedByName\", \"requestedByUserId\", \
    \"contactEmail\", reason, \"requestPayload\", status::text AS status, \"resolutionNotes\", \
    \"resolvedAt\", \"createdAt\", \"updatedAt\"";

fn request_from_row(row: &PgRow) -> Result<ArcoRequest, sqlx::Error> {
    Ok(ArcoRequest {
        id: row.try_get::<i32, _>(0)? as i64,
        request_type: row.try_get(1)?,
        subject_cedula_hash: row.try_get(2)?,
        subject_cedula_encrypted: row.try_get(3)?,
        requested_by_name: row.try_get(4)?,
        requested_by_user_id: row.try_get::<Option<i32>, _>(5)?.map(i64::from),
        contact_email: row.try_get(6)?,
        reason: row.try_get(7)?,
        request_payload: row.try_get(8)?,
        status: row.try_get(9)?,
        resolution_notes: row.try_get(10)?,
        resolved_at: row.try_get::<Option<DateTime<Utc>>, _>(11)?.map(fmt_ts),
        created_at: row.try_get::<Option<DateTime<Utc>>, _>(12)?.map(fmt_ts),
        updated_at: row.try_get::<Option<DateTime<Utc>>, _>(13)?.map(fmt_ts),
    })
}

fn history_from_row(row: &PgRow) -> Result<VisitorEditHistory, sqlx::Error> {
    Ok(VisitorEditHistory {
        id: row.try_get::<i32, _>(0)? as i64,
        visit_id: row.try_get::<Option<i32>, _>(1)?.map(i64::from),
        visitor_id: row.try_get::<i32, _>(2)? as i64,
        field: row.try_get(3)?,
        old_value: row.try_get(4)?,
        new_value: row.try_get(5)?,
        edited_by: row.try_get::<i32, _>(6)? as i64,
        edited_by_username: row.try_get(7)?,
        edited_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(8)?),
        created_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(9)?),
    })
}

fn log_row_from_row(row: &PgRow) -> Result<IntermittentLog, sqlx::Error> {
    Ok(IntermittentLog {
        id: row.try_get::<i32, _>(0)? as i64,
        visit_id: row.try_get::<i32, _>(1)? as i64,
        check_out: fmt_ts(row.try_get::<DateTime<Utc>, _>(2)?),
        re_entry: row.try_get::<Option<DateTime<Utc>>, _>(3)?.map(fmt_ts),
        notes: row.try_get(4)?,
        created_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(5)?),
        updated_at: fmt_ts(row.try_get::<DateTime<Utc>, _>(6)?),
        registered_by: row.try_get(7)?,
        reentered_by: row.try_get(8)?,
    })
}

fn department_from_row(row: &PgRow) -> Result<Department, sqlx::Error> {
    Ok(Department {
        id: row.try_get::<i32, _>(0)? as i64,
        name: row.try_get(1)?,
        code: row.try_get(2)?,
        is_active: row.try_get::<Option<bool>, _>(3)?,
        created_at: row.try_get::<Option<NaiveDateTime>, _>(4)?.map(fmt_naive),
    })
}

fn purpose_from_row(row: &PgRow) -> Result<VisitPurpose, sqlx::Error> {
    Ok(VisitPurpose {
        id: row.try_get::<i32, _>(0)? as i64,
        name: row.try_get(1)?,
        is_active: row.try_get::<Option<bool>, _>(2)?,
        created_at: row.try_get::<Option<NaiveDateTime>, _>(3)?.map(fmt_naive),
    })
}

/// Inserta una entrada de auditoría con cualquier ejecutor sqlx
/// (pool o transacción): `transition` y `cancel_subject` la usan
/// dentro de su transacción, como hace Go.
async fn insert_audit<'e, E>(executor: E, entry: &AuditEntry<'_>) -> StoreResult<i64>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    let id = sqlx::query_scalar::<_, i32>(
        "INSERT INTO \"ActivityLogs\"(\"userId\", username, action, entity, \"entityId\", details, \
         \"ipAddress\", \"userAgent\", \"createdAt\", role, method, path, status, \"statusCode\") \
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'success', 200) RETURNING id",
    )
    .bind(entry.user_id as i32)
    .bind(entry.username)
    .bind(entry.action)
    .bind(entry.entity)
    .bind(entry.entity_id)
    .bind(entry.details)
    .bind(entry.ip_address)
    .bind(entry.user_agent)
    .bind(parse_ts(entry.created_at)?)
    .bind(entry.role)
    .bind(entry.method)
    .bind(entry.path)
    .fetch_one(executor)
    .await
    .map_err(StoreError::from)?;
    Ok(id as i64)
}

// ---------------------------------------------------------------------
// Implementaciones de los traits sobre sqlx.
// ---------------------------------------------------------------------

/// Repositorio de usuarios sobre PostgreSQL.
#[derive(Clone)]
pub struct PgUserRepository {
    pool: PgPool,
}

impl PgUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn find_by_username(&self, username: &str) -> StoreResult<User> {
        let sql = format!("SELECT {USER_COLUMNS} FROM \"Users\" WHERE username = $1");
        sqlx::query(&sql)
            .bind(username)
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| user_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("USER_NOT_FOUND", format!("usuario {username} no existe"))
            })
    }

    async fn find_by_id(&self, id: i64) -> StoreResult<User> {
        let sql = format!("SELECT {USER_COLUMNS} FROM \"Users\" WHERE id = $1");
        sqlx::query(&sql)
            .bind(id32(id))
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| user_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("USER_NOT_FOUND", format!("usuario {id} no existe"))
            })
    }

    async fn find_by_reset_token(&self, token: &str) -> StoreResult<User> {
        let sql = format!("SELECT {USER_COLUMNS} FROM \"Users\" WHERE \"resetToken\" = $1");
        sqlx::query(&sql)
            .bind(token)
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| user_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("USER_NOT_FOUND", "token de recuperación inválido o vencido")
            })
    }

    async fn list_all(&self) -> StoreResult<Vec<User>> {
        let rows = sqlx::query(
            "SELECT id, username, email, role::text AS role, \"mustChangePassword\", \
             \"loginAttempts\", \"lockedUntil\" FROM \"Users\" ORDER BY id",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        let mut users = Vec::with_capacity(rows.len());
        for row in &rows {
            users.push(User {
                id: row.try_get::<i32, _>(0).map_err(StoreError::from)? as i64,
                username: row.try_get(1).map_err(StoreError::from)?,
                email: row.try_get(2).map_err(StoreError::from)?,
                token_version: 0,
                password_hash: String::new(),
                role: row.try_get(3).map_err(StoreError::from)?,
                reset_token: None,
                reset_token_expiry: None,
                created_at: String::new(),
                updated_at: String::new(),
                must_change_password: row
                    .try_get::<Option<bool>, _>(4)
                    .map_err(StoreError::from)?,
                password_changed_at: None,
                login_attempts: row
                    .try_get::<Option<i32>, _>(5)
                    .map_err(StoreError::from)?
                    .map(i64::from),
                locked_until: row
                    .try_get::<Option<DateTime<Utc>>, _>(6)
                    .map_err(StoreError::from)?
                    .map(fmt_ts),
            });
        }
        Ok(users)
    }

    async fn insert(&self, user: &NewUser<'_>) -> StoreResult<i64> {
        let id = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"Users\"(username, email, password, role, \"mustChangePassword\", \
             \"createdAt\", \"updatedAt\") VALUES($1, $2, $3, $4::\"enum_Users_role\", $5, $6, $7) RETURNING id",
        )
        .bind(user.username)
        .bind(user.email)
        .bind(user.password_hash)
        .bind(user.role)
        .bind(user.must_change_password)
        .bind(parse_ts(user.created_at)?)
        .bind(parse_ts(user.updated_at)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(id as i64)
    }

    async fn login_succeeded(&self, id: i64, now: &str) -> StoreResult<()> {
        sqlx::query(
            "UPDATE \"Users\" SET \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \
             \"updatedAt\" = $2 WHERE id = $1",
        )
        .bind(id32(id))
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(())
    }

    async fn login_failed(
        &self,
        id: i64,
        attempts: i64,
        locked_until: Option<&str>,
        now: &str,
    ) -> StoreResult<()> {
        let locked_until = locked_until.map(parse_ts).transpose()?;
        sqlx::query(
            "UPDATE \"Users\" SET \"loginAttempts\" = $2, \"lockedUntil\" = $3, \
             \"updatedAt\" = $4 WHERE id = $1",
        )
        .bind(id32(id))
        .bind(attempts as i32)
        .bind(locked_until)
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(())
    }

    async fn save_reset_token(
        &self,
        id: i64,
        token: &str,
        expiry: &str,
        email: &str,
        token_version: i64,
        now: &str,
    ) -> StoreResult<u64> {
        let rows = sqlx::query(
            "UPDATE \"Users\" SET \"resetToken\" = $2, \"resetTokenExpiry\" = $3, \
             \"updatedAt\" = $6 WHERE id = $1 AND email = $4 AND \"tokenVersion\" = $5",
        )
        .bind(id32(id))
        .bind(token)
        .bind(parse_ts(expiry)?)
        .bind(email)
        .bind(id32(token_version))
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(rows.rows_affected())
    }

    async fn consume_reset_token(
        &self,
        token: &str,
        new_password_hash: &str,
        now: &str,
    ) -> StoreResult<User> {
        let sql = format!(
            "UPDATE \"Users\" SET password = $2, \"resetToken\" = NULL, \
             \"resetTokenExpiry\" = NULL, \"mustChangePassword\" = false, \
             \"passwordChangedAt\" = $3, \"tokenVersion\" = \"tokenVersion\" + 1, \
             \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \"updatedAt\" = $3 \
             WHERE \"resetToken\" = $1 AND \"resetTokenExpiry\" > $3 \
             RETURNING {USER_COLUMNS}"
        );
        sqlx::query(&sql)
            .bind(token)
            .bind(new_password_hash)
            .bind(parse_ts(now)?)
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| user_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("USER_NOT_FOUND", "token de recuperación inválido o vencido")
            })
    }

    async fn change_password(
        &self,
        id: i64,
        new_password_hash: &str,
        must_change_password: bool,
        token_version: i64,
        now: &str,
    ) -> StoreResult<u64> {
        let rows = sqlx::query(
            "UPDATE \"Users\" SET password = $2, \"mustChangePassword\" = $3, \
             \"passwordChangedAt\" = $5, \"tokenVersion\" = \"tokenVersion\" + 1, \
             \"resetToken\" = NULL, \"resetTokenExpiry\" = NULL, \"loginAttempts\" = 0, \
             \"lockedUntil\" = NULL, \"updatedAt\" = $5 \
             WHERE id = $1 AND \"tokenVersion\" = $4",
        )
        .bind(id32(id))
        .bind(new_password_hash)
        .bind(must_change_password)
        .bind(id32(token_version))
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(rows.rows_affected())
    }

    async fn revoke_session(&self, id: i64, token_version: i64, now: &str) -> StoreResult<u64> {
        let rows = sqlx::query(
            "UPDATE \"Users\" SET \"tokenVersion\" = \"tokenVersion\" + 1, \"updatedAt\" = $3 \
             WHERE id = $1 AND \"tokenVersion\" = $2 AND \"tokenVersion\" < 2147483647",
        )
        .bind(id32(id))
        .bind(id32(token_version))
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(rows.rows_affected())
    }

    async fn clear_reset_token(&self, id: i64, token: &str) -> StoreResult<()> {
        sqlx::query(
            "UPDATE \"Users\" SET \"resetToken\" = NULL, \"resetTokenExpiry\" = NULL \
             WHERE id = $1 AND \"resetToken\" = $2",
        )
        .bind(id32(id))
        .bind(token)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(())
    }

    async fn update_user(
        &self,
        id: i64,
        username: &str,
        email: Option<Option<&str>>,
        role: &str,
        now: &str,
    ) -> StoreResult<u64> {
        let rows = match email {
            Some(value) => sqlx::query(
                "UPDATE \"Users\" SET username = $2, email = $3, role = $4::\"enum_Users_role\", \
                 \"tokenVersion\" = \"tokenVersion\" + 1, \"resetToken\" = NULL, \
                 \"resetTokenExpiry\" = NULL, \"updatedAt\" = $5 WHERE id = $1",
            )
            .bind(id32(id))
            .bind(username)
            .bind(value)
            .bind(role)
            .bind(parse_ts(now)?)
            .execute(&self.pool)
            .await
            .map_err(StoreError::from)?,
            None => sqlx::query(
                "UPDATE \"Users\" SET username = $2, role = $3::\"enum_Users_role\", \
                 \"tokenVersion\" = \"tokenVersion\" + 1, \"resetToken\" = NULL, \
                 \"resetTokenExpiry\" = NULL, \"updatedAt\" = $4 WHERE id = $1",
            )
            .bind(id32(id))
            .bind(username)
            .bind(role)
            .bind(parse_ts(now)?)
            .execute(&self.pool)
            .await
            .map_err(StoreError::from)?,
        };
        Ok(rows.rows_affected())
    }

    async fn delete_user(&self, id: i64) -> StoreResult<u64> {
        let rows = sqlx::query("DELETE FROM \"Users\" WHERE id = $1")
            .bind(id32(id))
            .execute(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok(rows.rows_affected())
    }
}

/// Repositorio de visitantes sobre PostgreSQL.
#[derive(Clone)]
pub struct PgVisitorRepository {
    pool: PgPool,
}

impl PgVisitorRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl VisitorRepository for PgVisitorRepository {
    async fn find_by_cedula(&self, cedula_hash: &str) -> StoreResult<Visitor> {
        let sql = format!(
            "SELECT {VISITOR_COLUMNS} FROM \"Visitors\" \
             WHERE cedula = $1 AND \"anonymizedAt\" IS NULL"
        );
        sqlx::query(&sql)
            .bind(cedula_hash)
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| visitor_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| StoreError::not_found("VISITOR_NOT_FOUND", "visitante no encontrado"))
    }

    async fn find_by_id(&self, id: i64) -> StoreResult<Visitor> {
        let sql = format!("SELECT {VISITOR_COLUMNS} FROM \"Visitors\" WHERE id = $1");
        sqlx::query(&sql)
            .bind(id32(id))
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| visitor_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("VISITOR_NOT_FOUND", format!("visitante {id} no existe"))
            })
    }

    async fn insert(&self, visitor: &NewVisitor<'_>) -> StoreResult<i64> {
        let id = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"Visitors\"(cedula, encrypted_cedula, first_name, last_name, company, \
             job_title, email, phone, photo_data, id_photo_data, \"createdAt\", \"updatedAt\") \
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id",
        )
        .bind(visitor.cedula_hash)
        .bind(visitor.encrypted_cedula)
        .bind(visitor.first_name)
        .bind(visitor.last_name)
        .bind(visitor.company)
        .bind(visitor.job_title)
        .bind(visitor.email)
        .bind(visitor.phone)
        .bind(visitor.photo_data)
        .bind(visitor.id_photo_data)
        .bind(parse_ts(visitor.created_at)?)
        .bind(parse_ts(visitor.updated_at)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(id as i64)
    }

    async fn update(&self, visitor: &Visitor, now: &str) -> StoreResult<()> {
        sqlx::query(
            "UPDATE \"Visitors\" SET first_name = $2, last_name = $3, company = $4, \
             job_title = $5, photo_url = $6, id_photo_url = $7, email = $8, phone = $9, \
             photo_data = $10, id_photo_data = $11, \"isBlocked\" = $12, observations = $13, \
             \"updatedAt\" = $14 WHERE id = $1",
        )
        .bind(id32(visitor.id))
        .bind(&visitor.first_name)
        .bind(&visitor.last_name)
        .bind(&visitor.company)
        .bind(visitor.job_title.as_deref())
        .bind(visitor.photo_url.as_deref())
        .bind(visitor.id_photo_url.as_deref())
        .bind(visitor.email.as_deref())
        .bind(visitor.phone.as_deref())
        .bind(visitor.photo_data.as_deref())
        .bind(visitor.id_photo_data.as_deref())
        .bind(visitor.is_blocked.unwrap_or(false))
        .bind(visitor.observations.as_deref())
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(())
    }

    async fn set_blocked(&self, id: i64, blocked: bool, now: &str) -> StoreResult<()> {
        sqlx::query("UPDATE \"Visitors\" SET \"isBlocked\" = $2, \"updatedAt\" = $3 WHERE id = $1")
            .bind(id32(id))
            .bind(blocked)
            .bind(parse_ts(now)?)
            .execute(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok(())
    }

    async fn update_photos(
        &self,
        id: i64,
        photo_data: Option<&[u8]>,
        id_photo_data: Option<&[u8]>,
        now: &str,
    ) -> StoreResult<()> {
        sqlx::query(
            "UPDATE \"Visitors\" SET photo_data = $2, id_photo_data = $3, \"updatedAt\" = $4 \
             WHERE id = $1",
        )
        .bind(id32(id))
        .bind(photo_data)
        .bind(id_photo_data)
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(())
    }

    async fn list_companies(&self) -> StoreResult<Vec<String>> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT company FROM \"Visitors\" WHERE company IS NOT NULL ORDER BY company",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(rows)
    }

    async fn list_companies_filtered(&self, query: &str) -> StoreResult<Vec<String>> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT company FROM \"Visitors\" \
             WHERE \"anonymizedAt\" IS NULL AND company ILIKE '%' || $1 || '%' \
             ORDER BY company LIMIT 100",
        )
        .bind(query)
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(rows)
    }

    async fn list_filtered(&self, filter: &VisitorFilter) -> StoreResult<Vec<Visitor>> {
        // El `WHERE` es el de `listVisitors` de Go: `$1=''` desactiva
        // el filtro de empresa y `$2=''` el de búsqueda.
        let company = filter.company.clone().unwrap_or_default();
        let search = filter.search.clone().unwrap_or_default();
        let ids: Vec<i32> = filter
            .search_ids
            .clone()
            .unwrap_or_default()
            .iter()
            .map(|id| *id as i32)
            .collect();
        let sql = format!(
            "SELECT {VISITOR_COLUMNS} FROM \"Visitors\" \
             WHERE \"anonymizedAt\" IS NULL AND ($1 = '' OR company ILIKE '%' || $1 || '%') \
             AND ($2 = '' OR id = ANY($3) OR company ILIKE '%' || $2 || '%') \
             ORDER BY id LIMIT $4 OFFSET $5"
        );
        let rows = sqlx::query(&sql)
            .bind(company)
            .bind(search)
            .bind(ids)
            .bind(filter.limit)
            .bind(filter.offset)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| visitor_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn count_filtered(&self, filter: &VisitorFilter) -> StoreResult<i64> {
        let company = filter.company.clone().unwrap_or_default();
        let search = filter.search.clone().unwrap_or_default();
        let ids: Vec<i32> = filter
            .search_ids
            .clone()
            .unwrap_or_default()
            .iter()
            .map(|id| *id as i32)
            .collect();
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM \"Visitors\" \
             WHERE \"anonymizedAt\" IS NULL AND ($1 = '' OR company ILIKE '%' || $1 || '%') \
             AND ($2 = '' OR id = ANY($3) OR company ILIKE '%' || $2 || '%')",
        )
        .bind(company)
        .bind(search)
        .bind(ids)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(count)
    }

    async fn insert_edit_history(&self, change: &NewEditHistory<'_>) -> StoreResult<i64> {
        let id = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"VisitorEditHistories\"(\"visitId\", \"visitorId\", field, \"oldValue\", \
             \"newValue\", \"editedBy\", \"editedByUsername\", \"editedAt\", \"createdAt\") \
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        )
        .bind(change.visit_id.map(id32))
        .bind(id32(change.visitor_id))
        .bind(change.field)
        .bind(change.old_value)
        .bind(change.new_value)
        .bind(id32(change.edited_by))
        .bind(change.edited_by_username)
        .bind(parse_ts(change.edited_at)?)
        .bind(parse_ts(change.created_at)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(id as i64)
    }

    async fn list_edit_history_by_visitor(
        &self,
        visitor_id: i64,
    ) -> StoreResult<Vec<VisitorEditHistory>> {
        let rows = sqlx::query(
            "SELECT id, \"visitId\", \"visitorId\", field, \"oldValue\", \"newValue\", \"editedBy\", \
             \"editedByUsername\", \"editedAt\", \"createdAt\" FROM \"VisitorEditHistories\" \
             WHERE \"visitorId\" = $1 ORDER BY \"editedAt\" DESC, id DESC",
        )
        .bind(id32(visitor_id))
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| history_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn list_edit_history_by_visit(
        &self,
        visit_id: i64,
    ) -> StoreResult<Vec<VisitorEditHistory>> {
        let rows = sqlx::query(
            "SELECT id, \"visitId\", \"visitorId\", field, \"oldValue\", \"newValue\", \"editedBy\", \
             \"editedByUsername\", \"editedAt\", \"createdAt\" FROM \"VisitorEditHistories\" \
             WHERE \"visitId\" = $1 ORDER BY \"editedAt\" DESC, id DESC",
        )
        .bind(id32(visit_id))
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| history_from_row(row).map_err(StoreError::from))
            .collect()
    }
}

/// Repositorio de visitas sobre PostgreSQL.
#[derive(Clone)]
pub struct PgVisitRepository {
    pool: PgPool,
}

impl PgVisitRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl VisitRepository for PgVisitRepository {
    async fn find_by_id(&self, id: i64) -> StoreResult<Visit> {
        let sql = format!("SELECT {VISIT_COLUMNS} FROM \"Visits\" WHERE id = $1");
        sqlx::query(&sql)
            .bind(id32(id))
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| visit_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("VISIT_NOT_FOUND", format!("visita {id} no encontrada"))
            })
    }

    async fn insert_checkin(&self, visit: &NewVisit<'_>) -> StoreResult<i64> {
        let result = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"Visits\"(visitor_cedula, visitor_id, purpose, person_to_visit, status, \
             notes, companion_name, companion_cedula, vehicle_brand, vehicle_model, vehicle_plate, \
             area, action, department, target_department, host_person, arrival_time, entry_time, \
             check_in_time, consent_policy_version, consent_accepted_at, consent_recorded_by, \
             \"createdAt\", \"updatedAt\") \
             VALUES($1, $2, $3, $4, $5::\"enum_Visits_status\", $6, $7, $8, $9, $10, $11, $12, $13::\"enum_Visits_action\", $14, $15, $16, $17, \
             $18, $19, $20, $21, $22, $23, $24) RETURNING id",
        )
        .bind(visit.visitor_cedula)
        .bind(id32(visit.visitor_id))
        .bind(visit.purpose)
        .bind(visit.person_to_visit)
        .bind(visit.status)
        .bind(visit.notes)
        .bind(visit.companion_name)
        .bind(visit.companion_cedula)
        .bind(visit.vehicle_brand)
        .bind(visit.vehicle_model)
        .bind(visit.vehicle_plate)
        .bind(visit.area)
        .bind(visit.action)
        .bind(visit.department)
        .bind(visit.target_department)
        .bind(visit.host_person)
        .bind(parse_ts(visit.arrival_time)?)
        .bind(visit.entry_time.map(parse_ts).transpose()?)
        .bind(parse_ts(visit.check_in_time)?)
        .bind(visit.consent_policy_version)
        .bind(parse_ts(visit.consent_accepted_at)?)
        .bind(id32(visit.consent_recorded_by))
        .bind(parse_ts(visit.created_at)?)
        .bind(parse_ts(visit.updated_at)?)
        .fetch_one(&self.pool)
        .await;
        match result {
            Ok(id) => Ok(id as i64),
            Err(e) if is_pg_unique_violation(&e) => Err(StoreError::conflict(
                "OPEN_VISIT_EXISTS",
                "Ya existe una visita o salida temporal abierta",
            )),
            Err(e) => Err(e.into()),
        }
    }

    async fn list_by_status(
        &self,
        status: &str,
        limit: i64,
        offset: i64,
    ) -> StoreResult<Vec<Visit>> {
        let sql = format!(
            "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
             WHERE status = $1::\"enum_Visits_status\" AND check_out_time IS NULL \
             ORDER BY check_in_time, id LIMIT $2 OFFSET $3"
        );
        let rows = sqlx::query(&sql)
            .bind(status)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| visit_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn visit_logs(&self, visit_id: i64) -> StoreResult<Vec<IntermittentLog>> {
        let rows = sqlx::query(
            "SELECT id, visit_id, check_out, re_entry, notes, \"createdAt\", \"updatedAt\", \
             registered_by, reentered_by FROM \"IntermittentLogs\" \
             WHERE visit_id = $1 ORDER BY check_out",
        )
        .bind(id32(visit_id))
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| log_row_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn list_filtered(&self, filter: &VisitFilter) -> StoreResult<(Vec<Visit>, i64)> {
        let from = " FROM \"Visits\" v LEFT JOIN \"Visitors\" p \
             ON p.id = COALESCE(v.visitor_id, (SELECT legacy.id FROM \"Visitors\" legacy \
             WHERE legacy.cedula = v.visitor_cedula))";
        let mut qb = sqlx::QueryBuilder::new(format!("SELECT {VISIT_COLUMNS_V}{from}"));
        visit_filter_where(&mut qb, filter)?;
        qb.push(visit_sort(filter));
        qb.push(" LIMIT ");
        qb.push_bind(filter.limit);
        qb.push(" OFFSET ");
        qb.push_bind(filter.offset);
        let rows = qb
            .build()
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        let visits: Vec<Visit> = rows
            .iter()
            .map(|row| visit_from_row(row).map_err(StoreError::from))
            .collect::<StoreResult<_>>()?;
        let mut qb = sqlx::QueryBuilder::new(format!("SELECT count(*){from}"));
        visit_filter_where(&mut qb, filter)?;
        let total = qb
            .build_query_scalar::<i64>()
            .fetch_one(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok((visits, total))
    }

    async fn calendar_counts(
        &self,
        start: &str,
        end: &str,
        status: &str,
    ) -> StoreResult<Vec<(String, i64)>> {
        let sql = if status.is_empty() {
            "SELECT (check_in_time AT TIME ZONE 'America/Caracas')::date::text, count(*) \
             FROM \"Visits\" WHERE check_in_time >= $1 AND check_in_time < $2 \
             GROUP BY 1 ORDER BY 1"
        } else {
            "SELECT (check_in_time AT TIME ZONE 'America/Caracas')::date::text, count(*) \
             FROM \"Visits\" WHERE check_in_time >= $1 AND check_in_time < $2 \
             AND status = $3::\"enum_Visits_status\" GROUP BY 1 ORDER BY 1"
        };
        let mut query = sqlx::query(sql).bind(parse_ts(start)?).bind(parse_ts(end)?);
        if !status.is_empty() {
            query = query.bind(status);
        }
        let rows = query
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| {
                Ok((
                    row.try_get::<String, _>(0).map_err(StoreError::from)?,
                    row.try_get::<i64, _>(1).map_err(StoreError::from)?,
                ))
            })
            .collect()
    }

    async fn report_rows(&self, start: &str, end: &str) -> StoreResult<Vec<ReportRow>> {
        let rows = sqlx::query(
            "SELECT count(*)::int, COALESCE(sum(EXTRACT(epoch FROM (check_out_time - check_in_time)) / 60) \
             FILTER (WHERE status = 'completed'), 0)::float8, ''::text, purpose, min(check_in_time), \
             NULL::timestamptz, status::text FROM \"Visits\" \
             WHERE check_in_time >= $1 AND check_in_time < $2 \
             GROUP BY (check_in_time AT TIME ZONE 'America/Caracas')::date, purpose, status \
             ORDER BY min(check_in_time)",
        )
        .bind(parse_ts(start)?)
        .bind(parse_ts(end)?)
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| {
                Ok(ReportRow {
                    count: row.try_get::<i32, _>(0).map_err(StoreError::from)? as i64,
                    minutes: row.try_get(1).map_err(StoreError::from)?,
                    visitor_cedula: row.try_get(2).map_err(StoreError::from)?,
                    purpose: row.try_get(3).map_err(StoreError::from)?,
                    check_in_time: row
                        .try_get::<Option<DateTime<Utc>>, _>(4)
                        .map_err(StoreError::from)?
                        .map(fmt_ts),
                    check_out_time: None,
                    status: row.try_get(6).map_err(StoreError::from)?,
                })
            })
            .collect()
    }

    async fn count_active(&self) -> StoreResult<i64> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM \"Visits\" WHERE status = 'active' AND check_out_time IS NULL",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(count)
    }

    async fn count_distinct_visitors(&self, start: &str, end: &str) -> StoreResult<i64> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT count(DISTINCT visitor_cedula) FROM \"Visits\" \
             WHERE check_in_time >= $1 AND check_in_time < $2 AND status <> 'cancelled'",
        )
        .bind(parse_ts(start)?)
        .bind(parse_ts(end)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(count)
    }

    async fn list_long_active(&self, before: &str) -> StoreResult<Vec<Visit>> {
        let sql = format!(
            "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
             WHERE status = 'active' AND check_out_time IS NULL AND check_in_time < $1 \
             ORDER BY check_in_time"
        );
        let rows = sqlx::query(&sql)
            .bind(parse_ts(before)?)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| visit_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn history_by_visitor(
        &self,
        visitor_id: i64,
        cedula_hash: &str,
        limit: i64,
    ) -> StoreResult<Vec<Visit>> {
        let sql = format!(
            "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
             WHERE visitor_id = $1 OR visitor_cedula = $2 \
             ORDER BY check_in_time DESC LIMIT $3"
        );
        let rows = sqlx::query(&sql)
            .bind(id32(visitor_id))
            .bind(cedula_hash)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| visit_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn list_by_visitor_for_access(
        &self,
        visitor_id: i64,
        cedula_hash: &str,
        limit: i64,
    ) -> StoreResult<Vec<Visit>> {
        let sql = format!(
            "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
             WHERE visitor_id = $1 OR visitor_cedula = $2 \
             ORDER BY check_in_time DESC, id DESC LIMIT $3"
        );
        let rows = sqlx::query(&sql)
            .bind(id32(visitor_id))
            .bind(cedula_hash)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| visit_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn transition(
        &self,
        id: i64,
        operation: Transition,
        call: &TransitionCall<'_>,
    ) -> StoreResult<Visit> {
        let actor = call.actor;
        let notes = call.notes;
        let reason = call.reason;
        let now = call.now;
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let sql = format!("SELECT {VISIT_COLUMNS} FROM \"Visits\" WHERE id = $1 FOR UPDATE");
        let visit = sqlx::query(&sql)
            .bind(id32(id))
            .fetch_optional(&mut *tx)
            .await
            .map_err(StoreError::from)?
            .map(|row| visit_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("VISIT_NOT_FOUND", format!("visita {id} no encontrada"))
            })?;
        if visit.status.as_deref() != Some(operation.expected_state())
            || visit.check_out_time.is_some()
        {
            return Err(StoreError::conflict(
                "INVALID_VISIT_STATE",
                "La visita cambió o no permite esta operación",
            ));
        }

        if operation == Transition::Exit {
            sqlx::query(
                "INSERT INTO \"IntermittentLogs\"(visit_id, check_out, notes, registered_by, \
                 \"createdAt\", \"updatedAt\") VALUES($1, $2, $3, $4, $2, $2)",
            )
            .bind(id32(id))
            .bind(parse_ts(now)?)
            .bind(notes)
            .bind(&actor.username)
            .execute(&mut *tx)
            .await
            .map_err(StoreError::from)?;
        }
        if operation == Transition::Reentry {
            let rows = sqlx::query(
                "UPDATE \"IntermittentLogs\" SET re_entry = $2, reentered_by = $3, \
                 \"updatedAt\" = $2 WHERE visit_id = $1 AND re_entry IS NULL",
            )
            .bind(id32(id))
            .bind(parse_ts(now)?)
            .bind(&actor.username)
            .execute(&mut *tx)
            .await
            .map_err(StoreError::from)?;
            if rows.rows_affected() != 1 {
                return Err(StoreError::conflict(
                    "INVALID_VISIT_STATE",
                    "La visita no tiene una única salida temporal abierta",
                ));
            }
        }

        let now_ts = parse_ts(now)?;
        match operation {
            Transition::Admit => {
                sqlx::query(
                    "UPDATE \"Visits\" SET status = $2::\"enum_Visits_status\", entry_time = $3, check_in_time = $3, \
                     \"updatedAt\" = $3 WHERE id = $1",
                )
                .bind(id32(id))
                .bind(operation.target_state())
                .bind(now_ts)
                .execute(&mut *tx)
                .await
                .map_err(StoreError::from)?;
            }
            Transition::Checkout => {
                sqlx::query(
                    "UPDATE \"Visits\" SET status = $2::\"enum_Visits_status\", check_out_time = $3, exit_time = $3, \
                     notes = COALESCE($4, notes), \"updatedAt\" = $3 WHERE id = $1",
                )
                .bind(id32(id))
                .bind(operation.target_state())
                .bind(now_ts)
                .bind(notes)
                .execute(&mut *tx)
                .await
                .map_err(StoreError::from)?;
            }
            Transition::Cancel => {
                sqlx::query(
                    "UPDATE \"Visits\" SET status = $2::\"enum_Visits_status\", cancellation_reason = $3, \
                     \"updatedAt\" = $4 WHERE id = $1",
                )
                .bind(id32(id))
                .bind(operation.target_state())
                .bind(reason)
                .bind(now_ts)
                .execute(&mut *tx)
                .await
                .map_err(StoreError::from)?;
            }
            _ => {
                sqlx::query("UPDATE \"Visits\" SET status = $2::\"enum_Visits_status\", \"updatedAt\" = $3 WHERE id = $1")
                    .bind(id32(id))
                    .bind(operation.target_state())
                    .bind(now_ts)
                    .execute(&mut *tx)
                    .await
                    .map_err(StoreError::from)?;
            }
        }

        let meta = call.audit;
        insert_audit(
            &mut *tx,
            &AuditEntry {
                user_id: actor.id,
                username: &actor.username,
                action: operation.audit_action(),
                entity: "Visit",
                entity_id: &id.to_string(),
                details: None,
                ip_address: meta.and_then(|m| m.ip_address),
                user_agent: meta.and_then(|m| m.user_agent),
                created_at: now,
                role: meta.and_then(|m| m.role),
                method: meta.and_then(|m| m.method),
                path: meta.and_then(|m| m.path),
            },
        )
        .await?;

        let sql = format!("SELECT {VISIT_COLUMNS} FROM \"Visits\" WHERE id = $1");
        let visit = sqlx::query(&sql)
            .bind(id32(id))
            .fetch_one(&mut *tx)
            .await
            .map_err(StoreError::from)
            .and_then(|row| visit_from_row(&row).map_err(StoreError::from))?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(visit)
    }
}

/// Repositorio de auditoría sobre PostgreSQL.
#[derive(Clone)]
pub struct PgAuditRepository {
    pool: PgPool,
}

impl PgAuditRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl AuditRepository for PgAuditRepository {
    async fn write(&self, entry: &AuditEntry<'_>) -> StoreResult<i64> {
        insert_audit(&self.pool, entry).await
    }

    async fn list_recent(&self, limit: i64) -> StoreResult<Vec<ActivityLog>> {
        let sql = format!(
            "SELECT {LOG_COLUMNS} FROM \"ActivityLogs\" \
             ORDER BY \"createdAt\" DESC, id DESC LIMIT $1"
        );
        let rows = sqlx::query(&sql)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| log_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn count(&self) -> StoreResult<i64> {
        let count = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM \"ActivityLogs\"")
            .fetch_one(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok(count)
    }

    async fn list_filtered(
        &self,
        filter: &AuditFilter<'_>,
        limit: i64,
        offset: i64,
    ) -> StoreResult<Vec<ActivityLog>> {
        // Como `listActivityLogs` de Go: los filtros vacíos no
        // restringen y la búsqueda es ILIKE sobre cuatro columnas.
        let start = filter.start.map(parse_ts).transpose()?;
        let end = filter.end.map(parse_ts).transpose()?;
        let action = filter.action.unwrap_or("");
        let username = filter.username.unwrap_or("");
        let entity = filter.entity.unwrap_or("");
        let ip = filter.ip.unwrap_or("");
        let user_id: Option<i32> = filter.user_id.map(|id| id as i32);
        let search = filter
            .search
            .map(|v| format!("%{v}%"))
            .unwrap_or_else(|| "%".to_string());
        let sql = format!(
            "SELECT {LOG_COLUMNS} FROM \"ActivityLogs\" \
             WHERE ($1::timestamptz IS NULL OR \"createdAt\" >= $1) \
             AND ($2::timestamptz IS NULL OR \"createdAt\" < $2) \
             AND ($3 = '' OR action = $3) AND ($4 = '' OR username = $4) \
             AND ($5 = '' OR entity = $5) AND ($6 = '' OR \"ipAddress\" = $6) \
             AND ($7::int IS NULL OR \"userId\" = $7) \
             AND (username ILIKE $8 OR action ILIKE $8 OR details ILIKE $8 \
             OR \"entityId\" ILIKE $8) \
             ORDER BY \"createdAt\" DESC, id DESC LIMIT $9 OFFSET $10"
        );
        let rows = sqlx::query(&sql)
            .bind(start)
            .bind(end)
            .bind(action)
            .bind(username)
            .bind(entity)
            .bind(ip)
            .bind(user_id)
            .bind(search)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| log_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn count_filtered(&self, filter: &AuditFilter<'_>) -> StoreResult<i64> {
        let start = filter.start.map(parse_ts).transpose()?;
        let end = filter.end.map(parse_ts).transpose()?;
        let action = filter.action.unwrap_or("");
        let username = filter.username.unwrap_or("");
        let entity = filter.entity.unwrap_or("");
        let ip = filter.ip.unwrap_or("");
        let user_id: Option<i32> = filter.user_id.map(|id| id as i32);
        let search = filter
            .search
            .map(|v| format!("%{v}%"))
            .unwrap_or_else(|| "%".to_string());
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM \"ActivityLogs\" \
             WHERE ($1::timestamptz IS NULL OR \"createdAt\" >= $1) \
             AND ($2::timestamptz IS NULL OR \"createdAt\" < $2) \
             AND ($3 = '' OR action = $3) AND ($4 = '' OR username = $4) \
             AND ($5 = '' OR entity = $5) AND ($6 = '' OR \"ipAddress\" = $6) \
             AND ($7::int IS NULL OR \"userId\" = $7) \
             AND (username ILIKE $8 OR action ILIKE $8 OR details ILIKE $8 \
             OR \"entityId\" ILIKE $8)",
        )
        .bind(start)
        .bind(end)
        .bind(action)
        .bind(username)
        .bind(entity)
        .bind(ip)
        .bind(user_id)
        .bind(search)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(count)
    }

    async fn today_counts(&self, start: &str, end: &str) -> StoreResult<(i64, i64, i64, i64)> {
        let row = sqlx::query(
            "SELECT count(*) FILTER (WHERE action = 'LOGIN'), count(*), \
             count(DISTINCT \"userId\"), count(DISTINCT \"ipAddress\") \
             FROM \"ActivityLogs\" WHERE \"createdAt\" >= $1 AND \"createdAt\" < $2",
        )
        .bind(parse_ts(start)?)
        .bind(parse_ts(end)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok((
            row.try_get(0).map_err(StoreError::from)?,
            row.try_get(1).map_err(StoreError::from)?,
            row.try_get(2).map_err(StoreError::from)?,
            row.try_get(3).map_err(StoreError::from)?,
        ))
    }

    async fn group_counts(&self, since: &str, group: &str) -> StoreResult<Vec<(String, i64)>> {
        let sql = match group {
            "username" => {
                "SELECT username, count(*) FROM \"ActivityLogs\" \
                 WHERE \"createdAt\" >= $1 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5"
            }
            "date" => {
                "SELECT (\"createdAt\" AT TIME ZONE 'America/Caracas')::date::text, count(*) \
                 FROM \"ActivityLogs\" WHERE \"createdAt\" >= $1 \
                 GROUP BY 1 ORDER BY 2 DESC, 1"
            }
            _ => {
                "SELECT action, count(*) FROM \"ActivityLogs\" \
                 WHERE \"createdAt\" >= $1 GROUP BY 1 ORDER BY 2 DESC, 1"
            }
        };
        let rows = sqlx::query(sql)
            .bind(parse_ts(since)?)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| {
                Ok((
                    row.try_get::<String, _>(0).map_err(StoreError::from)?,
                    row.try_get::<i64, _>(1).map_err(StoreError::from)?,
                ))
            })
            .collect()
    }

    async fn distinct(&self, column: &str) -> StoreResult<Vec<String>> {
        let column = match column {
            "action" => "action",
            "username" => "username",
            _ => return Err(StoreError::Validation("columna no válida".to_string())),
        };
        let sql = format!("SELECT DISTINCT {column} FROM \"ActivityLogs\" ORDER BY 1");
        let rows = sqlx::query_scalar::<_, String>(&sql)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok(rows)
    }
}

/// Repositorio ARCO sobre PostgreSQL.
#[derive(Clone)]
pub struct PgArcoRepository {
    pool: PgPool,
}

impl PgArcoRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ArcoRepository for PgArcoRepository {
    async fn insert_request(&self, request: &NewArcoRequest<'_>) -> StoreResult<i64> {
        let id = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"ArcoRequests\"(\"requestType\", \"subjectCedulaHash\", \
             \"subjectCedulaEncrypted\", \"requestedByName\", \"requestedByUserId\", \
             \"contactEmail\", reason, \"requestPayload\", status, \"createdAt\", \"updatedAt\") \
             VALUES($1::\"enum_ArcoRequests_requestType\", $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10) RETURNING id",
        )
        .bind(request.request_type)
        .bind(request.subject_cedula_hash)
        .bind(request.subject_cedula_encrypted)
        .bind(request.requested_by_name)
        .bind(request.requested_by_user_id.map(id32))
        .bind(request.contact_email)
        .bind(request.reason)
        .bind(request.request_payload)
        .bind(parse_ts(request.created_at)?)
        .bind(parse_ts(request.updated_at)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(id as i64)
    }

    async fn find_request_by_id(&self, id: i64) -> StoreResult<ArcoRequest> {
        let sql = format!("SELECT {REQUEST_COLUMNS} FROM \"ArcoRequests\" WHERE id = $1");
        sqlx::query(&sql)
            .bind(id32(id))
            .fetch_optional(&self.pool)
            .await
            .map_err(StoreError::from)?
            .map(|row| request_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found(
                    "ARCO_REQUEST_NOT_FOUND",
                    format!("solicitud {id} no encontrada"),
                )
            })
    }

    async fn list_requests(&self, limit: i64, offset: i64) -> StoreResult<Vec<ArcoRequest>> {
        let sql = format!(
            "SELECT {REQUEST_COLUMNS} FROM \"ArcoRequests\" \
             ORDER BY \"createdAt\" DESC, id DESC LIMIT $1 OFFSET $2"
        );
        let rows = sqlx::query(&sql)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| request_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn list_filtered(&self, filter: &ArcoFilter) -> StoreResult<(Vec<ArcoRequest>, i64)> {
        // El `WHERE` es el de `arcoList` de Go: el enum se compara
        // como texto (`status::text = $1`) para que el filtro vacío
        // no tenga que castearse a enum.
        let status = filter.status.clone().unwrap_or_default();
        let kind = filter.request_type.clone().unwrap_or_default();
        let search = filter.search.clone().unwrap_or_default();
        let hash = filter.cedula_hash.clone().unwrap_or_default();
        let cond = " WHERE ($1 = '' OR status::text = $1) \
             AND ($2 = '' OR \"requestType\"::text = $2) \
             AND ($3 = '' OR \"requestedByName\" ILIKE '%' || $3 || '%' \
             OR \"contactEmail\" ILIKE '%' || $3 || '%' OR reason ILIKE '%' || $3 || '%' \
             OR \"subjectCedulaHash\" = $4)";
        let total =
            sqlx::query_scalar::<_, i64>(&format!("SELECT count(*) FROM \"ArcoRequests\"{cond}"))
                .bind(&status)
                .bind(&kind)
                .bind(&search)
                .bind(&hash)
                .fetch_one(&self.pool)
                .await
                .map_err(StoreError::from)?;
        let sql = format!(
            "SELECT {REQUEST_COLUMNS} FROM \"ArcoRequests\"{cond} \
             ORDER BY \"createdAt\" DESC, id DESC LIMIT $5 OFFSET $6"
        );
        let rows = sqlx::query(&sql)
            .bind(&status)
            .bind(&kind)
            .bind(&search)
            .bind(&hash)
            .bind(filter.limit)
            .bind(filter.offset)
            .fetch_all(&self.pool)
            .await
            .map_err(StoreError::from)?;
        let requests = rows
            .iter()
            .map(|row| request_from_row(row).map_err(StoreError::from))
            .collect::<StoreResult<_>>()?;
        Ok((requests, total))
    }

    async fn update_request_status(
        &self,
        id: i64,
        status: &str,
        resolution_notes: Option<&str>,
        resolved_at: Option<&str>,
        now: &str,
    ) -> StoreResult<u64> {
        let resolved_at = resolved_at.map(parse_ts).transpose()?;
        let rows = sqlx::query(
            "UPDATE \"ArcoRequests\" SET status = $2::\"enum_ArcoRequests_status\", \"resolutionNotes\" = $3, \
             \"resolvedAt\" = $4, \"updatedAt\" = $5 WHERE id = $1",
        )
        .bind(id32(id))
        .bind(status)
        .bind(resolution_notes)
        .bind(resolved_at)
        .bind(parse_ts(now)?)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(rows.rows_affected())
    }

    async fn cancel_subject(
        &self,
        visitor_id: i64,
        cedula_plain: &str,
        cedula_hash: &str,
        reference: &str,
        actor: &Actor,
        verification_method: &str,
        now: &str,
        audit_meta: Option<&CancelAudit<'_>>,
    ) -> StoreResult<()> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        // 1. Visitas del titular: ninguna puede estar abierta.
        let rows = sqlx::query(
            "SELECT id, status::text AS status FROM \"Visits\" \
             WHERE visitor_id = $1 OR visitor_cedula = $2 FOR UPDATE",
        )
        .bind(id32(visitor_id))
        .bind(cedula_hash)
        .fetch_all(&mut *tx)
        .await
        .map_err(StoreError::from)?;
        let mut ids: Vec<i32> = Vec::new();
        let mut entity_ids: Vec<String> = Vec::new();
        for row in &rows {
            let status: Option<String> = row.try_get(1).map_err(StoreError::from)?;
            if !matches!(status.as_deref(), Some("completed") | Some("cancelled")) {
                return Err(StoreError::conflict(
                    "OPEN_VISIT_EXISTS",
                    "Cierre las visitas abiertas antes de cancelar los datos",
                ));
            }
            let id: i32 = row.try_get(0).map_err(StoreError::from)?;
            entity_ids.push(id.to_string());
            ids.push(id);
        }
        let now_ts = parse_ts(now)?;

        // 2. Historial de ediciones: se vacían los valores.
        sqlx::query(
            "UPDATE \"VisitorEditHistories\" SET \"oldValue\" = NULL, \"newValue\" = NULL \
             WHERE \"visitorId\" = $1 OR \"visitId\" = ANY($2)",
        )
        .bind(id32(visitor_id))
        .bind(&ids)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;

        // 3. Intervalos: se vacían las notas.
        sqlx::query(
            "UPDATE \"IntermittentLogs\" SET notes = NULL, \"updatedAt\" = $1 \
             WHERE visit_id = ANY($2)",
        )
        .bind(now_ts)
        .bind(&ids)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;

        // 4. Bitácora: se anonimiza lo que menciona al titular.
        let visitor_refs = vec![
            cedula_plain.to_string(),
            cedula_hash.to_string(),
            visitor_id.to_string(),
        ];
        sqlx::query(
            "UPDATE \"ActivityLogs\" SET \"entityId\" = $1, details = 'Datos anonimizados', \
             path = NULL, \"ipAddress\" = NULL, \"userAgent\" = NULL \
             WHERE (entity = 'Visitor' AND \"entityId\" = ANY($2)) \
             OR (entity = 'Visit' AND \"entityId\" = ANY($3)) \
             OR (entity = 'ArcoRequest' AND \"entityId\" IN \
                 (SELECT CAST(id AS TEXT) FROM \"ArcoRequests\" WHERE \"subjectCedulaHash\" = $4)) \
             OR path LIKE '%' || $5 || '%' OR details LIKE '%' || $5 || '%'",
        )
        .bind(reference)
        .bind(&visitor_refs)
        .bind(&entity_ids)
        .bind(cedula_hash)
        .bind(cedula_plain)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;

        // 5. Visitas: referencias anónimas y textos genéricos.
        sqlx::query(
            "UPDATE \"Visits\" SET visitor_id = $1, visitor_cedula = $2, purpose = 'Anonimizado', \
             person_to_visit = 'Anonimizado', notes = NULL, cancellation_reason = NULL, \
             companion_name = NULL, companion_cedula = NULL, vehicle_brand = NULL, \
             vehicle_model = NULL, vehicle_plate = NULL, host_person = NULL, \
             target_department = NULL, department = NULL, area = NULL, \"updatedAt\" = $4 \
             WHERE visitor_id = $1 OR visitor_cedula = $3",
        )
        .bind(id32(visitor_id))
        .bind(reference)
        .bind(cedula_hash)
        .bind(now_ts)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;

        // 6. Solicitudes ARCO del titular.
        sqlx::query(
            "UPDATE \"ArcoRequests\" SET \"subjectCedulaHash\" = $2, \
             \"subjectCedulaEncrypted\" = NULL, \"requestedByName\" = 'Anonimizado', \
             \"contactEmail\" = NULL, reason = NULL, \"requestPayload\" = NULL, \
             \"resolutionNotes\" = NULL, \"updatedAt\" = $3 WHERE \"subjectCedulaHash\" = $1",
        )
        .bind(cedula_hash)
        .bind(reference)
        .bind(now_ts)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;

        // 7. Perfil: anonimizado, sin fotos ni contacto.
        sqlx::query(
            "UPDATE \"Visitors\" SET cedula = $2, encrypted_cedula = NULL, \
             \"anonymizedAt\" = $3, first_name = 'Anonimizado', last_name = '', \
             company = 'Anonimizado', job_title = NULL, email = NULL, phone = NULL, \
             photo_data = NULL, id_photo_data = NULL, photo_url = NULL, id_photo_url = NULL, \
             observations = NULL, \"isBlocked\" = false, \"updatedAt\" = $3 WHERE id = $1",
        )
        .bind(id32(visitor_id))
        .bind(reference)
        .bind(now_ts)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;

        // 8. Solicitud de cancelación resuelta, como constancia.
        sqlx::query(
            "INSERT INTO \"ArcoRequests\"(\"requestType\", \"subjectCedulaHash\", \
             \"requestedByName\", \"requestedByUserId\", status, \"resolvedAt\", \"createdAt\", \
             \"updatedAt\") VALUES('cancellation', $1, 'Anonimizado', $2, 'completed', $3, $3, $3)",
        )
        .bind(reference)
        .bind(id32(actor.id))
        .bind(now_ts)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;

        // 9. Tokens de búsqueda del perfil.
        sqlx::query("DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = $1")
            .bind(id32(visitor_id))
            .execute(&mut *tx)
            .await
            .map_err(StoreError::from)?;

        // 10. Auditoría de la cancelación, en la misma transacción.
        insert_audit(
            &mut *tx,
            &AuditEntry {
                user_id: actor.id,
                username: &actor.username,
                action: "ARCO_CANCELLATION_EXECUTED",
                entity: "Visitor",
                entity_id: reference,
                details: Some(&format!("Verificación de identidad: {verification_method}")),
                ip_address: audit_meta.and_then(|m| m.ip_address),
                user_agent: audit_meta.and_then(|m| m.user_agent),
                created_at: now,
                role: audit_meta.and_then(|m| m.role),
                method: audit_meta.and_then(|m| m.method),
                path: audit_meta.and_then(|m| m.path),
            },
        )
        .await?;

        tx.commit().await.map_err(StoreError::from)?;
        Ok(())
    }
}

/// Repositorio de catálogos sobre PostgreSQL.
#[derive(Clone)]
pub struct PgCatalogRepository {
    pool: PgPool,
}

impl PgCatalogRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl CatalogRepository for PgCatalogRepository {
    async fn list_departments(&self) -> StoreResult<Vec<Department>> {
        let rows = sqlx::query(
            "SELECT id, name, code, \"isActive\", \"createdAt\" FROM \"Departments\" ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| department_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn insert_department(
        &self,
        name: &str,
        code: Option<&str>,
        now: &str,
    ) -> StoreResult<i64> {
        let id = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"Departments\"(name, code, \"isActive\", \"createdAt\") \
             VALUES($1, $2, true, $3) RETURNING id",
        )
        .bind(name)
        .bind(code)
        .bind(parse_naive(now)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(id as i64)
    }

    async fn set_department_active(&self, id: i64, active: bool) -> StoreResult<()> {
        sqlx::query("UPDATE \"Departments\" SET \"isActive\" = $2 WHERE id = $1")
            .bind(id32(id))
            .bind(active)
            .execute(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok(())
    }

    async fn list_purposes(&self) -> StoreResult<Vec<VisitPurpose>> {
        let rows = sqlx::query(
            "SELECT id, name, \"isActive\", \"createdAt\" FROM \"VisitPurposes\" ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        rows.iter()
            .map(|row| purpose_from_row(row).map_err(StoreError::from))
            .collect()
    }

    async fn insert_purpose(&self, name: &str, now: &str) -> StoreResult<i64> {
        let id = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"VisitPurposes\"(name, \"isActive\", \"createdAt\") \
             VALUES($1, true, $2) RETURNING id",
        )
        .bind(name)
        .bind(parse_naive(now)?)
        .fetch_one(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(id as i64)
    }

    async fn set_purpose_active(&self, id: i64, active: bool) -> StoreResult<()> {
        sqlx::query("UPDATE \"VisitPurposes\" SET \"isActive\" = $2 WHERE id = $1")
            .bind(id32(id))
            .bind(active)
            .execute(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok(())
    }
}

/// Repositorio de búsqueda sobre PostgreSQL.
#[derive(Clone)]
pub struct PgSearchTokenRepository {
    pool: PgPool,
}

impl PgSearchTokenRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl SearchTokenRepository for PgSearchTokenRepository {
    async fn replace_tokens(&self, visitor_id: i64, tokens: &[Vec<u8>]) -> StoreResult<()> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        sqlx::query("DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = $1")
            .bind(id32(visitor_id))
            .execute(&mut *tx)
            .await
            .map_err(StoreError::from)?;
        for token in tokens {
            sqlx::query(
                "INSERT INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES($1, $2) \
                 ON CONFLICT DO NOTHING",
            )
            .bind(id32(visitor_id))
            .bind(token.as_slice())
            .execute(&mut *tx)
            .await
            .map_err(StoreError::from)?;
        }
        tx.commit().await.map_err(StoreError::from)?;
        Ok(())
    }

    async fn delete_tokens(&self, visitor_id: i64) -> StoreResult<()> {
        sqlx::query("DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = $1")
            .bind(id32(visitor_id))
            .execute(&self.pool)
            .await
            .map_err(StoreError::from)?;
        Ok(())
    }

    async fn tokens_for_visitor(&self, visitor_id: i64) -> StoreResult<Vec<VisitorSearchToken>> {
        let rows = sqlx::query(
            "SELECT visitor_id, token FROM \"VisitorSearchTokens\" WHERE visitor_id = $1",
        )
        .bind(id32(visitor_id))
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        let mut tokens = Vec::with_capacity(rows.len());
        for row in &rows {
            tokens.push(VisitorSearchToken {
                visitor_id: row.try_get::<i32, _>(0).map_err(StoreError::from)? as i64,
                token: row.try_get(1).map_err(StoreError::from)?,
            });
        }
        Ok(tokens)
    }

    async fn find_visitors_by_token(&self, token: &[u8]) -> StoreResult<Vec<i64>> {
        let rows = sqlx::query_scalar::<_, i32>(
            "SELECT visitor_id FROM \"VisitorSearchTokens\" WHERE token = $1 ORDER BY visitor_id",
        )
        .bind(token)
        .fetch_all(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(rows.into_iter().map(i64::from).collect())
    }

    async fn get_search_state(&self) -> StoreResult<SearchIndexState> {
        let row = sqlx::query(
            "SELECT 1 AS id, fingerprint, cursor, ready FROM \"SearchIndexState\" WHERE id = true",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(StoreError::from)?
        .ok_or_else(|| {
            StoreError::not_found("INDEX_STATE_NOT_FOUND", "falta la fila de SearchIndexState")
        })?;
        Ok(SearchIndexState {
            id: row.try_get::<i32, _>(0).map_err(StoreError::from)? as i64,
            fingerprint: row.try_get(1).map_err(StoreError::from)?,
            cursor: row.try_get::<i32, _>(2).map_err(StoreError::from)? as i64,
            ready: row.try_get(3).map_err(StoreError::from)?,
        })
    }

    async fn set_search_state(
        &self,
        fingerprint: &str,
        cursor: i64,
        ready: bool,
    ) -> StoreResult<()> {
        sqlx::query(
            "UPDATE \"SearchIndexState\" SET fingerprint = $1, cursor = $2, ready = $3 \
             WHERE id = true",
        )
        .bind(fingerprint)
        .bind(cursor as i32)
        .bind(ready)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(())
    }

    async fn get_identity_state(&self) -> StoreResult<IdentityIndexState> {
        let row = sqlx::query(
            "SELECT 1 AS id, fingerprint, ready FROM \"IdentityIndexState\" WHERE id = true",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(StoreError::from)?
        .ok_or_else(|| {
            StoreError::not_found(
                "INDEX_STATE_NOT_FOUND",
                "falta la fila de IdentityIndexState",
            )
        })?;
        Ok(IdentityIndexState {
            id: row.try_get::<i32, _>(0).map_err(StoreError::from)? as i64,
            fingerprint: row.try_get(1).map_err(StoreError::from)?,
            ready: row.try_get(2).map_err(StoreError::from)?,
        })
    }

    async fn set_identity_state(&self, fingerprint: &str, ready: bool) -> StoreResult<()> {
        sqlx::query(
            "UPDATE \"IdentityIndexState\" SET fingerprint = $1, ready = $2 WHERE id = true",
        )
        .bind(fingerprint)
        .bind(ready)
        .execute(&self.pool)
        .await
        .map_err(StoreError::from)?;
        Ok(())
    }
}

/// Operaciones compuestas sobre PostgreSQL: cada método abre una
/// transacción (`pool.begin()`) y ejecuta el mismo SQL que los
/// `Pg*Repository` correspondientes, así que la atomicidad es la
/// misma que en SQLite y en Go.
#[derive(Clone)]
pub struct PgUnitOfWork {
    pool: PgPool,
}

impl PgUnitOfWork {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn insert_tokens_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        visitor_id: i64,
        tokens: &[Vec<u8>],
    ) -> StoreResult<()> {
        sqlx::query("DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = $1")
            .bind(id32(visitor_id))
            .execute(&mut **tx)
            .await
            .map_err(StoreError::from)?;
        for token in tokens {
            sqlx::query(
                "INSERT INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES($1, $2) \
                 ON CONFLICT DO NOTHING",
            )
            .bind(id32(visitor_id))
            .bind(token.as_slice())
            .execute(&mut **tx)
            .await
            .map_err(StoreError::from)?;
        }
        Ok(())
    }
}

#[async_trait]
impl UnitOfWork for PgUnitOfWork {
    async fn login_success(&self, id: i64, now: &str, audit: &AuditEntry<'_>) -> StoreResult<()> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        sqlx::query(
            "UPDATE \"Users\" SET \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \"updatedAt\" = $2 \
             WHERE id = $1",
        )
        .bind(id32(id))
        .bind(parse_ts(now)?)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;
        insert_audit(&mut *tx, audit).await?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(())
    }

    async fn logout(
        &self,
        id: i64,
        token_version: i64,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<u64> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let rows = sqlx::query(
            "UPDATE \"Users\" SET \"tokenVersion\" = \"tokenVersion\" + 1, \"updatedAt\" = $3 \
             WHERE id = $1 AND \"tokenVersion\" = $2 AND \"tokenVersion\" < 2147483647",
        )
        .bind(id32(id))
        .bind(id32(token_version))
        .bind(parse_ts(now)?)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;
        let rows = rows.rows_affected();
        if rows == 1 {
            insert_audit(&mut *tx, audit).await?;
        }
        tx.commit().await.map_err(StoreError::from)?;
        Ok(rows)
    }

    async fn change_password(
        &self,
        id: i64,
        hash: &str,
        must_change: bool,
        token_version: i64,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<u64> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let rows = sqlx::query(
            "UPDATE \"Users\" SET password = $2, \"mustChangePassword\" = $3, \
             \"passwordChangedAt\" = $5, \"tokenVersion\" = \"tokenVersion\" + 1, \
             \"resetToken\" = NULL, \"resetTokenExpiry\" = NULL, \
             \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \"updatedAt\" = $5 \
             WHERE id = $1 AND \"tokenVersion\" = $4",
        )
        .bind(id32(id))
        .bind(hash)
        .bind(must_change)
        .bind(id32(token_version))
        .bind(parse_ts(now)?)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;
        let rows = rows.rows_affected();
        if rows == 1 {
            insert_audit(&mut *tx, audit).await?;
        }
        tx.commit().await.map_err(StoreError::from)?;
        Ok(rows)
    }

    async fn consume_reset(
        &self,
        token: &str,
        hash: &str,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<User> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let sql = format!(
            "UPDATE \"Users\" SET password = $2, \"resetToken\" = NULL, \
             \"resetTokenExpiry\" = NULL, \"mustChangePassword\" = false, \
             \"passwordChangedAt\" = $3, \"tokenVersion\" = \"tokenVersion\" + 1, \
             \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \"updatedAt\" = $3 \
             WHERE \"resetToken\" = $1 AND \"resetTokenExpiry\" > $3 \
             RETURNING {USER_COLUMNS}"
        );
        let user = sqlx::query(&sql)
            .bind(token)
            .bind(hash)
            .bind(parse_ts(now)?)
            .fetch_optional(&mut *tx)
            .await
            .map_err(StoreError::from)?
            .map(|row| user_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| {
                StoreError::not_found("USER_NOT_FOUND", "token de recuperación inválido o vencido")
            })?;
        insert_audit(&mut *tx, audit).await?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(user)
    }

    async fn checkin(&self, input: &CheckinInput<'_>) -> StoreResult<CheckinOutcome> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        // Bloqueo asesor de Go (`pg_advisory_xact_lock`): la
        // identidad no puede registrar dos visitas a la vez.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(input.cedula_hash)
            .execute(&mut *tx)
            .await
            .map_err(StoreError::from)?;
        let visitor_id = match input.new_visitor {
            Some(visitor) => {
                let id = sqlx::query_scalar::<_, i32>(
                    "INSERT INTO \"Visitors\"(cedula, encrypted_cedula, first_name, last_name, company, \
                     job_title, email, phone, photo_data, id_photo_data, \"createdAt\", \"updatedAt\") \
                     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id",
                )
                .bind(visitor.cedula_hash)
                .bind(visitor.encrypted_cedula)
                .bind(visitor.first_name)
                .bind(visitor.last_name)
                .bind(visitor.company)
                .bind(visitor.job_title)
                .bind(visitor.email)
                .bind(visitor.phone)
                .bind(visitor.photo_data)
                .bind(visitor.id_photo_data)
                .bind(parse_ts(visitor.created_at)?)
                .bind(parse_ts(visitor.updated_at)?)
                .fetch_one(&mut *tx)
                .await
                .map_err(StoreError::from)?;
                id as i64
            }
            None => {
                let sql = format!(
                    "SELECT {VISITOR_COLUMNS} FROM \"Visitors\" \
                     WHERE cedula = $1 AND \"anonymizedAt\" IS NULL"
                );
                let visitor = sqlx::query(&sql)
                    .bind(input.cedula_hash)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(StoreError::from)?
                    .map(|row| visitor_from_row(&row).map_err(StoreError::from))
                    .transpose()?
                    .ok_or_else(|| {
                        StoreError::not_found("VISITOR_NOT_FOUND", "visitante no encontrado")
                    })?;
                visitor.id
            }
        };
        Self::insert_tokens_tx(&mut tx, visitor_id, input.search_tokens).await?;
        let visit = input.visit;
        let result = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"Visits\"(visitor_cedula, visitor_id, purpose, person_to_visit, status, \
             notes, companion_name, companion_cedula, vehicle_brand, vehicle_model, vehicle_plate, \
             area, action, department, target_department, host_person, arrival_time, entry_time, \
             check_in_time, consent_policy_version, consent_accepted_at, consent_recorded_by, \
             \"createdAt\", \"updatedAt\") \
             VALUES($1, $2, $3, $4, $5::\"enum_Visits_status\", $6, $7, $8, $9, $10, $11, $12, $13::\"enum_Visits_action\", $14, $15, $16, $17, \
             $18, $19, $20, $21, $22, $23, $24) RETURNING id",
        )
        .bind(visit.visitor_cedula)
        .bind(id32(visitor_id))
        .bind(visit.purpose)
        .bind(visit.person_to_visit)
        .bind(visit.status)
        .bind(visit.notes)
        .bind(visit.companion_name)
        .bind(visit.companion_cedula)
        .bind(visit.vehicle_brand)
        .bind(visit.vehicle_model)
        .bind(visit.vehicle_plate)
        .bind(visit.area)
        .bind(visit.action)
        .bind(visit.department)
        .bind(visit.target_department)
        .bind(visit.host_person)
        .bind(parse_ts(visit.arrival_time)?)
        .bind(visit.entry_time.map(parse_ts).transpose()?)
        .bind(parse_ts(visit.check_in_time)?)
        .bind(visit.consent_policy_version)
        .bind(parse_ts(visit.consent_accepted_at)?)
        .bind(id32(visit.consent_recorded_by))
        .bind(parse_ts(visit.created_at)?)
        .bind(parse_ts(visit.updated_at)?)
        .fetch_one(&mut *tx)
        .await;
        let visit_id = match result {
            Ok(id) => id as i64,
            Err(e) if is_pg_unique_violation(&e) => {
                return Err(StoreError::conflict(
                    "OPEN_VISIT_EXISTS",
                    "Ya existe una visita o salida temporal abierta",
                ));
            }
            Err(e) => return Err(e.into()),
        };
        insert_audit(&mut *tx, input.audit).await?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(CheckinOutcome {
            visitor_id,
            visit_id,
        })
    }

    async fn apply_profile_edit(&self, edit: &ProfileEdit<'_>) -> StoreResult<Visitor> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let visitor = edit.visitor;
        sqlx::query(
            "UPDATE \"Visitors\" SET first_name = $2, last_name = $3, company = $4, \
             job_title = $5, photo_url = $6, id_photo_url = $7, email = $8, phone = $9, \
             photo_data = $10, id_photo_data = $11, \"isBlocked\" = $12, observations = $13, \
             \"updatedAt\" = $14 WHERE id = $1",
        )
        .bind(id32(visitor.id))
        .bind(&visitor.first_name)
        .bind(&visitor.last_name)
        .bind(&visitor.company)
        .bind(visitor.job_title.as_deref())
        .bind(visitor.photo_url.as_deref())
        .bind(visitor.id_photo_url.as_deref())
        .bind(visitor.email.as_deref())
        .bind(visitor.phone.as_deref())
        .bind(visitor.photo_data.as_deref())
        .bind(visitor.id_photo_data.as_deref())
        .bind(visitor.is_blocked.unwrap_or(false))
        .bind(visitor.observations.as_deref())
        .bind(parse_ts(edit.now)?)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;
        for change in edit.history {
            sqlx::query_scalar::<_, i32>(
                "INSERT INTO \"VisitorEditHistories\"(\"visitId\", \"visitorId\", field, \"oldValue\", \
                 \"newValue\", \"editedBy\", \"editedByUsername\", \"editedAt\", \"createdAt\") \
                 VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
            )
            .bind(change.visit_id.map(id32))
            .bind(id32(change.visitor_id))
            .bind(change.field)
            .bind(change.old_value)
            .bind(change.new_value)
            .bind(id32(change.edited_by))
            .bind(change.edited_by_username)
            .bind(parse_ts(change.edited_at)?)
            .bind(parse_ts(change.created_at)?)
            .fetch_one(&mut *tx)
            .await
            .map_err(StoreError::from)?;
        }
        Self::insert_tokens_tx(&mut tx, visitor.id, edit.search_tokens).await?;
        insert_audit(&mut *tx, edit.audit).await?;
        let sql = format!("SELECT {VISITOR_COLUMNS} FROM \"Visitors\" WHERE id = $1");
        let updated = sqlx::query(&sql)
            .bind(id32(visitor.id))
            .fetch_one(&mut *tx)
            .await
            .map_err(StoreError::from)
            .and_then(|row| visitor_from_row(&row).map_err(StoreError::from))?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(updated)
    }

    async fn create_arco(
        &self,
        request: &NewArcoRequest<'_>,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<i64> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let id = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"ArcoRequests\"(\"requestType\", \"subjectCedulaHash\", \
             \"subjectCedulaEncrypted\", \"requestedByName\", \"requestedByUserId\", \
             \"contactEmail\", reason, \"requestPayload\", status, \"createdAt\", \"updatedAt\") \
             VALUES($1::\"enum_ArcoRequests_requestType\", $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10) RETURNING id",
        )
        .bind(request.request_type)
        .bind(request.subject_cedula_hash)
        .bind(request.subject_cedula_encrypted)
        .bind(request.requested_by_name)
        .bind(request.requested_by_user_id.map(id32))
        .bind(request.contact_email)
        .bind(request.reason)
        .bind(request.request_payload)
        .bind(parse_ts(request.created_at)?)
        .bind(parse_ts(request.updated_at)?)
        .fetch_one(&mut *tx)
        .await
        .map_err(StoreError::from)?;
        insert_audit(&mut *tx, audit).await?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(id as i64)
    }

    async fn update_arco_status(
        &self,
        id: i64,
        status: &str,
        notes: Option<&str>,
        resolved_at: Option<&str>,
        now: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<ArcoRequest> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let resolved_at = resolved_at.map(parse_ts).transpose()?;
        let rows = sqlx::query(
            "UPDATE \"ArcoRequests\" SET status = $2::\"enum_ArcoRequests_status\", \"resolutionNotes\" = $3, \
             \"resolvedAt\" = $4, \"updatedAt\" = $5 WHERE id = $1",
        )
        .bind(id32(id))
        .bind(status)
        .bind(notes)
        .bind(resolved_at)
        .bind(parse_ts(now)?)
        .execute(&mut *tx)
        .await
        .map_err(StoreError::from)?;
        if rows.rows_affected() == 0 {
            return Err(StoreError::not_found(
                "NOT_FOUND",
                format!("solicitud {id} no encontrada"),
            ));
        }
        insert_audit(&mut *tx, audit).await?;
        let sql = format!("SELECT {REQUEST_COLUMNS} FROM \"ArcoRequests\" WHERE id = $1");
        let request = sqlx::query(&sql)
            .bind(id32(id))
            .fetch_one(&mut *tx)
            .await
            .map_err(StoreError::from)
            .and_then(|row| request_from_row(&row).map_err(StoreError::from))?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(request)
    }

    async fn subject_access(
        &self,
        cedula_hash: &str,
        limit: i64,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<(Visitor, Vec<Visit>)> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let sql = format!(
            "SELECT {VISITOR_COLUMNS} FROM \"Visitors\" \
             WHERE cedula = $1 AND \"anonymizedAt\" IS NULL"
        );
        let visitor = sqlx::query(&sql)
            .bind(cedula_hash)
            .fetch_optional(&mut *tx)
            .await
            .map_err(StoreError::from)?
            .map(|row| visitor_from_row(&row).map_err(StoreError::from))
            .transpose()?
            .ok_or_else(|| StoreError::not_found("VISITOR_NOT_FOUND", "visitante no encontrado"))?;
        let sql = format!(
            "SELECT {VISIT_COLUMNS} FROM \"Visits\" \
             WHERE visitor_id = $1 OR visitor_cedula = $2 \
             ORDER BY check_in_time DESC, id DESC LIMIT $3"
        );
        let rows = sqlx::query(&sql)
            .bind(id32(visitor.id))
            .bind(cedula_hash)
            .bind(limit)
            .fetch_all(&mut *tx)
            .await
            .map_err(StoreError::from)?;
        let visits = rows
            .iter()
            .map(|row| visit_from_row(row).map_err(StoreError::from))
            .collect::<StoreResult<_>>()?;
        insert_audit(&mut *tx, audit).await?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok((visitor, visits))
    }

    async fn create_user(&self, user: &NewUser<'_>, audit: &AuditEntry<'_>) -> StoreResult<i64> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let result = sqlx::query_scalar::<_, i32>(
            "INSERT INTO \"Users\"(username, email, password, role, \"mustChangePassword\", \
             \"createdAt\", \"updatedAt\") VALUES($1, $2, $3, $4::\"enum_Users_role\", $5, $6, $7) RETURNING id",
        )
        .bind(user.username)
        .bind(user.email)
        .bind(user.password_hash)
        .bind(user.role)
        .bind(user.must_change_password)
        .bind(parse_ts(user.created_at)?)
        .bind(parse_ts(user.updated_at)?)
        .fetch_one(&mut *tx)
        .await;
        let id = match result {
            Ok(id) => id as i64,
            Err(e) if is_pg_unique_violation(&e) => {
                return Err(StoreError::conflict(
                    "USERNAME_EXISTS",
                    format!("el nombre de usuario {} ya existe", user.username),
                ));
            }
            Err(e) => return Err(e.into()),
        };
        insert_audit(&mut *tx, audit).await?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(id)
    }

    async fn update_user(
        &self,
        id: i64,
        username: &str,
        email: Option<Option<&str>>,
        role: &str,
        audit: &AuditEntry<'_>,
    ) -> StoreResult<User> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let sql = format!("SELECT {USER_COLUMNS} FROM \"Users\" WHERE id = $1");
        sqlx::query(&sql)
            .bind(id32(id))
            .fetch_optional(&mut *tx)
            .await
            .map_err(StoreError::from)?
            .ok_or_else(|| {
                StoreError::not_found("USER_NOT_FOUND", format!("usuario {id} no existe"))
            })?;
        let result = match email {
            Some(value) => sqlx::query(
                "UPDATE \"Users\" SET username = $2, email = $3, role = $4::\"enum_Users_role\", \
                 \"tokenVersion\" = \"tokenVersion\" + 1, \"resetToken\" = NULL, \
                 \"resetTokenExpiry\" = NULL, \"updatedAt\" = $5 WHERE id = $1",
            )
            .bind(id32(id))
            .bind(username)
            .bind(value)
            .bind(role)
            .bind(parse_ts(audit.created_at)?)
            .execute(&mut *tx)
            .await,
            None => {
                sqlx::query(
                    "UPDATE \"Users\" SET username = $2, role = $3::\"enum_Users_role\", \
                 \"tokenVersion\" = \"tokenVersion\" + 1, \"resetToken\" = NULL, \
                 \"resetTokenExpiry\" = NULL, \"updatedAt\" = $4 WHERE id = $1",
                )
                .bind(id32(id))
                .bind(username)
                .bind(role)
                .bind(parse_ts(audit.created_at)?)
                .execute(&mut *tx)
                .await
            }
        };
        let rows = match result {
            Ok(rows) => rows.rows_affected(),
            Err(e) if is_pg_unique_violation(&e) => {
                return Err(StoreError::conflict(
                    "USERNAME_EXISTS",
                    format!("el nombre de usuario {username} ya existe"),
                ));
            }
            Err(e) => return Err(e.into()),
        };
        if rows == 0 {
            return Err(StoreError::not_found(
                "USER_NOT_FOUND",
                format!("usuario {id} no existe"),
            ));
        }
        insert_audit(&mut *tx, audit).await?;
        let updated = sqlx::query(&sql)
            .bind(id32(id))
            .fetch_one(&mut *tx)
            .await
            .map_err(StoreError::from)
            .and_then(|row| user_from_row(&row).map_err(StoreError::from))?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(updated)
    }

    async fn delete_user(&self, id: i64, audit: &AuditEntry<'_>) -> StoreResult<()> {
        let mut tx = self.pool.begin().await.map_err(StoreError::from)?;
        let sql = format!("SELECT {USER_COLUMNS} FROM \"Users\" WHERE id = $1");
        sqlx::query(&sql)
            .bind(id32(id))
            .fetch_optional(&mut *tx)
            .await
            .map_err(StoreError::from)?
            .ok_or_else(|| {
                StoreError::not_found("USER_NOT_FOUND", format!("usuario {id} no existe"))
            })?;
        let rows = sqlx::query("DELETE FROM \"Users\" WHERE id = $1")
            .bind(id32(id))
            .execute(&mut *tx)
            .await
            .map_err(StoreError::from)?;
        if rows.rows_affected() == 0 {
            return Err(StoreError::not_found(
                "USER_NOT_FOUND",
                format!("usuario {id} no existe"),
            ));
        }
        insert_audit(&mut *tx, audit).await?;
        tx.commit().await.map_err(StoreError::from)?;
        Ok(())
    }
}
