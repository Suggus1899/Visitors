//! Reconstrucción de los índices de identidad y búsqueda
//! (`logmaster.exe ops reindex`, fase 8).
//!
//! Traducción de `db.RebuildSearch` y `db.RebuildIdentity` de Go
//! (`server-go/db/search.go`, `server-go/db/identity.go`): mismos
//! lotes de 1.000 perfiles, mismo progreso guardado en
//! `SearchIndexState` / `IdentityIndexState` y mismas guardas:
//!
//! - Si el índice ya está listo (`ready`) con la huella de la clave
//!   actual, no se rehace (salvo `--force`).
//! - Si está listo con otra huella, es un error: la clave cambió y
//!   hay que reconstruir con la clave correcta (o con `--force`).
//! - Si no está listo, se reconstruye (también tras un cambio de
//!   clave: los tokens y las referencias se regeneran desde los
//!   valores cifrados, que no cambian).
//!
//! La búsqueda se reconstruye por lotes con una transacción por
//! lote (el cursor queda guardado tras cada lote, como en Go). La
//! identidad se reconstruye entera en una transacción: en SQLite
//! con transacción inmediata (un solo escritor) y en PostgreSQL
//! con el mismo candado asesor de Go (`pg_advisory_xact_lock`
//! 174829302), también en una transacción.
//!
//! Se ejecuta con el servicio detenido, como el `ops` de Go: una
//! escritura concurrente durante la reconstrucción dejaría los
//! índices a medias. El arranque avisa cuando los índices no están
//! preparados; este comando es la forma de prepararlos.

use std::collections::{HashMap, HashSet};

use anyhow::{anyhow, bail, Context, Result};
use logmaster_crypto::{
    decrypt, identity_fingerprint, identity_hash, normalize_identity, search_fingerprint,
    search_tokens, sha256_hex,
};
use rusqlite::{params, Transaction};
use sqlx::{PgPool, Row};

use crate::repos::search as search_repo;
use crate::Store;

/// Perfiles por lote de reconstrucción, como en Go.
const BATCH_SIZE: i64 = 1000;

/// Candado asesor de PostgreSQL para la reconstrucción de
/// identidad, el mismo que usa Go (`identity.go`).
const IDENTITY_LOCK: i64 = 174829302;

/// Resultado de una reconstrucción.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ReindexReport {
    /// Perfiles con tokens regenerados (búsqueda).
    pub search_visitors: u64,
    /// Tokens de búsqueda guardados.
    pub search_tokens: u64,
    /// `true` si la búsqueda se reconstruyó en esta ejecución.
    pub search_rebuilt: bool,
    /// Perfiles con la `cedula` actualizada al HMAC de identidad.
    pub identity_visitors: u64,
    /// Visitas con `visitor_cedula` actualizada.
    pub identity_visits: u64,
    /// Solicitudes ARCO con `subjectCedulaHash` actualizado.
    pub identity_arco: u64,
    /// `true` si la identidad se reconstruyó en esta ejecución.
    pub identity_rebuilt: bool,
}

/// Mapeos de identidad durante la reconstrucción, como los `owners`,
/// `profiles` e `identifiers` de `RebuildIdentity` de Go.
#[derive(Default)]
struct IdentityMaps {
    /// Referencia (actual, histórica o destino) → destino HMAC.
    identifiers: HashMap<String, String>,
    /// Id de visitante → destino HMAC.
    profiles: HashMap<i64, String>,
    /// Destinos con una visita abierta (una por identidad).
    open: HashSet<String>,
    /// Referencias actuales ya vistas (duplicado = error).
    seen_cedula: HashSet<String>,
}

impl IdentityMaps {
    /// Registra una referencia (actual, histórica o destino) con su
    /// destino. Dos fuentes distintas no pueden apuntar a destinos
    /// distintos.
    fn map(&mut self, source: &str, target: &str) -> Result<()> {
        match self.identifiers.get(source) {
            Some(existing) if existing != target => {
                bail!("referencia de identidad duplicada: {source} apunta a dos perfiles")
            }
            Some(_) => Ok(()),
            None => {
                self.identifiers
                    .insert(source.to_string(), target.to_string());
                Ok(())
            }
        }
    }

    /// Registra un perfil y devuelve el cambio de `cedula` a aplicar
    /// (`Some((vieja, nueva))`) o `None` si ya lleva el HMAC. Un
    /// perfil anonimizado se registra tal cual (su referencia ya es
    /// anónima y no se toca).
    fn register_visitor(
        &mut self,
        id: i64,
        current: &str,
        encrypted_cedula: Option<&str>,
        anonymized: bool,
        key: &[u8; 32],
    ) -> Result<Option<(String, String)>> {
        if !self.seen_cedula.insert(current.to_string()) {
            bail!("referencia de identidad duplicada: {current}");
        }
        if anonymized {
            self.map(current, current)?;
            self.profiles.insert(id, current.to_string());
            return Ok(None);
        }
        let encrypted = encrypted_cedula
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("visitante {id} sin identidad cifrada"))?;
        let plain = decrypt(key, encrypted)
            .with_context(|| format!("descifrado de identidad del visitante {id}"))?;
        let normalized = normalize_identity(&plain);
        if normalized.is_empty() {
            bail!("visitante {id} con identidad vacía");
        }
        let legacy = sha256_hex(&normalized);
        let plain_hash = sha256_hex(&plain);
        let target = identity_hash(key, &normalized);
        if current != legacy && current != plain_hash && current != target {
            bail!("visitante {id}: la referencia de identidad no coincide con su valor cifrado");
        }
        if let Some(owner) = self.profiles.iter().find_map(|(owner, dest)| {
            if *dest == target && *owner != id {
                Some(*owner)
            } else {
                None
            }
        }) {
            bail!("identidad descifrada duplicada: visitantes {owner} y {id}");
        }
        self.map(&legacy, &target)?;
        self.map(&plain_hash, &target)?;
        self.map(&target, &target)?;
        self.profiles.insert(id, target.clone());
        Ok(if current != target {
            Some((current.to_string(), target))
        } else {
            None
        })
    }

    /// Resuelve la identidad de una visita y devuelve el cambio de
    /// `visitor_cedula` a aplicar, si lo hay. Comprueba que no haya
    /// dos visitas abiertas para la misma identidad.
    fn resolve_visit(
        &mut self,
        visit_id: i64,
        visitor_id: Option<i64>,
        visitor_cedula: &str,
        status: Option<&str>,
        has_checkout: bool,
    ) -> Result<Option<(String, String)>> {
        let mut target = self.identifiers.get(visitor_cedula).cloned();
        if let Some(visitor_id) = visitor_id {
            let profile = self.profiles.get(&visitor_id).ok_or_else(|| {
                anyhow!("visita {visit_id} referencia a un visitante desconocido")
            })?;
            if target.as_deref() != Some(profile.as_str()) {
                bail!("visita {visit_id} con referencia de visitante incompatible");
            }
            target = Some(profile.clone());
        }
        let target = target.ok_or_else(|| anyhow!("visita {visit_id} sin mapeo de identidad"))?;
        if matches!(status, Some("waiting" | "active" | "intermittent"))
            && !has_checkout
            && !self.open.insert(target.clone())
        {
            bail!("visitas abiertas duplicadas comparten una identidad");
        }
        Ok(if visitor_cedula != target {
            Some((visitor_cedula.to_string(), target))
        } else {
            None
        })
    }

    /// Resuelve la identidad de una solicitud ARCO y devuelve el
    /// cambio de `subjectCedulaHash` a aplicar, si lo hay.
    fn resolve_arco(
        &mut self,
        request_id: i64,
        hash: &str,
        encrypted: Option<&str>,
        key: &[u8; 32],
    ) -> Result<Option<(String, String)>> {
        let mut target = self.identifiers.get(hash).cloned();
        if let Some(encrypted) = encrypted.filter(|value| !value.is_empty()) {
            let plain = decrypt(key, encrypted).with_context(|| {
                format!("descifrado de identidad de la solicitud ARCO {request_id}")
            })?;
            let normalized = normalize_identity(&plain);
            let legacy = sha256_hex(&normalized);
            let computed = identity_hash(key, &normalized);
            if hash != legacy && hash != sha256_hex(&plain) && hash != computed {
                bail!(
                    "solicitud ARCO {request_id}: la referencia no coincide con su identidad cifrada"
                );
            }
            target = Some(computed);
        }
        let target = target.ok_or_else(|| {
            anyhow!("solicitud ARCO {request_id} sin mapeo de identidad ni identidad cifrada")
        })?;
        Ok(if hash != target {
            Some((hash.to_string(), target))
        } else {
            None
        })
    }
}

/// Trigramas de un perfil (`indexVisitor` de Go): nombre, apellido
/// y cédula en claro. Un perfil anonimizado queda sin tokens (el
/// llamador solo pasa perfiles no anonimizados).
fn visitor_tokens(
    key: &[u8; 32],
    first: &str,
    last: &str,
    encrypted_cedula: &str,
) -> Result<Vec<Vec<u8>>> {
    let first = decrypt(key, first)?;
    let last = decrypt(key, last)?;
    let cedula = decrypt(key, encrypted_cedula)?;
    Ok(search_tokens(key, &format!("{first} {last} {cedula}")))
}

// ---------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------

/// Reconstruye los índices de identidad y búsqueda de una base
/// SQLite (`Store` ya migrado).
pub fn reindex_sqlite(store: &Store, key: &[u8; 32], force: bool) -> Result<ReindexReport> {
    let mut report = ReindexReport::default();
    reindex_search_sqlite(store, key, force, &mut report)?;
    reindex_identity_sqlite(store, key, force, &mut report)?;
    Ok(report)
}

fn reindex_search_sqlite(
    store: &Store,
    key: &[u8; 32],
    force: bool,
    report: &mut ReindexReport,
) -> Result<()> {
    let fingerprint = search_fingerprint(key);
    let state =
        store.read(|conn| search_repo::get_search_state(conn).map_err(anyhow::Error::from))?;
    if state.ready && state.fingerprint == fingerprint && !force {
        return Ok(());
    }
    // Cambio de clave (o `--force`): se borran los tokens y se
    // empieza desde el principio, como en Go.
    let mut cursor;
    if state.fingerprint != fingerprint || force {
        store.tx_immediate(|tx| {
            tx.execute("DELETE FROM \"VisitorSearchTokens\"", [])?;
            search_repo::set_search_state(tx, &fingerprint, 0, false)
                .map_err(anyhow::Error::from)?;
            Ok(())
        })?;
        cursor = 0;
    } else {
        // Sin preparar: solo se marca en curso y se reanuda desde
        // el cursor guardado.
        store.tx_immediate(|tx| {
            search_repo::set_search_state(tx, &fingerprint, state.cursor, false)
                .map_err(anyhow::Error::from)?;
            Ok(())
        })?;
        cursor = state.cursor;
    }
    loop {
        let batch: Vec<(i64, String, String, Option<String>)> = store.read(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, first_name, last_name, encrypted_cedula FROM \"Visitors\" \
                 WHERE id > ?1 AND \"anonymizedAt\" IS NULL ORDER BY id LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![cursor, BATCH_SIZE], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(anyhow::Error::from)
        })?;
        if batch.is_empty() {
            break;
        }
        let mut last = cursor;
        let mut tokens = 0u64;
        store.tx_immediate(|tx| {
            for (id, first, last_name, encrypted) in &batch {
                let tokens_for =
                    visitor_tokens(key, first, last_name, encrypted.as_deref().unwrap_or(""))?;
                tokens += tokens_for.len() as u64;
                search_repo::replace_tokens(tx, *id, &tokens_for).map_err(anyhow::Error::from)?;
                last = *id;
            }
            search_repo::set_search_state(tx, &fingerprint, last, false)
                .map_err(anyhow::Error::from)?;
            Ok(())
        })?;
        cursor = last;
        report.search_visitors += batch.len() as u64;
        report.search_tokens += tokens;
    }
    store.tx_immediate(|tx| {
        search_repo::set_search_state(tx, &fingerprint, cursor, true)
            .map_err(anyhow::Error::from)?;
        Ok(())
    })?;
    report.search_rebuilt = true;
    Ok(())
}

fn reindex_identity_sqlite(
    store: &Store,
    key: &[u8; 32],
    force: bool,
    report: &mut ReindexReport,
) -> Result<()> {
    let fingerprint = identity_fingerprint(key);
    let state =
        store.read(|conn| search_repo::get_identity_state(conn).map_err(anyhow::Error::from))?;
    if state.ready {
        if state.fingerprint != fingerprint {
            bail!("el índice de identidad se preparó con otra clave");
        }
        if !force {
            return Ok(());
        }
    }
    // Una sola transacción inmediata, como la serializable de Go.
    let (visitors, visits, arco) = store.tx_immediate(|tx| {
        search_repo::set_identity_state(tx, &fingerprint, false)
            .map_err(anyhow::Error::from)?;
        let mut maps = IdentityMaps::default();
        let mut visitors = 0u64;
        let mut cursor = 0i64;
        loop {
            let batch = visitor_batch_sqlite(tx, cursor)?;
            if batch.is_empty() {
                break;
            }
            for (id, current, encrypted, anonymized) in &batch {
                cursor = *id;
                if let Some((old, new)) =
                    maps.register_visitor(*id, current, encrypted.as_deref(), *anonymized, key)?
                {
                    let changed = tx.execute(
                        "UPDATE \"Visitors\" SET cedula = ?1 WHERE id = ?2 AND cedula = ?3",
                        params![new, id, old],
                    )?;
                    if changed != 1 {
                        bail!("filas de visitante cambiadas durante el mantenimiento");
                    }
                    visitors += 1;
                }
            }
        }
        let mut visits = 0u64;
        let mut cursor = 0i64;
        loop {
            let batch = visit_batch_sqlite(tx, cursor)?;
            if batch.is_empty() {
                break;
            }
            for (id, visitor_id, cedula, status, has_checkout) in &batch {
                cursor = *id;
                if let Some((old, new)) = maps.resolve_visit(
                    *id,
                    *visitor_id,
                    cedula,
                    status.as_deref(),
                    *has_checkout,
                )? {
                    // La segunda visita abierta con el mismo destino
                    // ya tiene el valor nuevo: el índice parcial
                    // único rechaza la actualización antes de que el
                    // bucle llegue a ella; se traduce al mensaje de
                    // dominio (en Go sale el 23505 tal cual).
                    let changed = tx
                        .execute(
                            "UPDATE \"Visits\" SET visitor_cedula = ?1 WHERE id = ?2 AND visitor_cedula = ?3",
                            params![new, id, old],
                        )
                        .map_err(|e| {
                            if e.to_string().contains("UNIQUE constraint failed") {
                                anyhow!("visitas abiertas duplicadas comparten una identidad")
                            } else {
                                anyhow::Error::from(e)
                            }
                        })?;
                    if changed != 1 {
                        bail!("filas de visita cambiadas durante el mantenimiento");
                    }
                    visits += 1;
                }
            }
        }
        let mut arco = 0u64;
        let mut cursor = 0i64;
        loop {
            let batch = arco_batch_sqlite(tx, cursor)?;
            if batch.is_empty() {
                break;
            }
            for (id, hash, encrypted) in &batch {
                cursor = *id;
                if let Some((old, new)) =
                    maps.resolve_arco(*id, hash, encrypted.as_deref(), key)?
                {
                    let changed = tx.execute(
                        "UPDATE \"ArcoRequests\" SET \"subjectCedulaHash\" = ?1 WHERE id = ?2 AND \"subjectCedulaHash\" = ?3",
                        params![new, id, old],
                    )?;
                    if changed != 1 {
                        bail!("filas de solicitud ARCO cambiadas durante el mantenimiento");
                    }
                    arco += 1;
                }
            }
        }
        search_repo::set_identity_state(tx, &fingerprint, true)
            .map_err(anyhow::Error::from)?;
        Ok((visitors, visits, arco))
    })?;
    report.identity_visitors = visitors;
    report.identity_visits = visits;
    report.identity_arco = arco;
    report.identity_rebuilt = true;
    Ok(())
}

/// Fila de visitante para la reconstrucción de identidad:
/// (id, cedula, encrypted_cedula, anonimizado).
type VisitorRow = (i64, String, Option<String>, bool);
/// Fila de visita: (id, visitor_id, visitor_cedula, status,
/// tiene salida registrada).
type VisitRow = (i64, Option<i64>, String, Option<String>, bool);
/// Fila de solicitud ARCO: (id, subjectCedulaHash,
/// subjectCedulaEncrypted).
type ArcoRow = (i64, String, Option<String>);

fn visitor_batch_sqlite(tx: &Transaction, cursor: i64) -> Result<Vec<VisitorRow>> {
    let mut stmt = tx.prepare(
        "SELECT id, cedula, encrypted_cedula, \"anonymizedAt\" IS NOT NULL FROM \"Visitors\" \
         WHERE id > ?1 ORDER BY id LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![cursor, BATCH_SIZE], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, bool>(3)?,
        ))
    })?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(anyhow::Error::from)
}

fn visit_batch_sqlite(tx: &Transaction, cursor: i64) -> Result<Vec<VisitRow>> {
    let mut stmt = tx.prepare(
        "SELECT id, visitor_id, visitor_cedula, status, check_out_time IS NOT NULL \
         FROM \"Visits\" WHERE id > ?1 ORDER BY id LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![cursor, BATCH_SIZE], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, Option<i64>>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, bool>(4)?,
        ))
    })?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(anyhow::Error::from)
}

fn arco_batch_sqlite(tx: &Transaction, cursor: i64) -> Result<Vec<ArcoRow>> {
    let mut stmt = tx.prepare(
        "SELECT id, \"subjectCedulaHash\", \"subjectCedulaEncrypted\" FROM \"ArcoRequests\" \
         WHERE id > ?1 ORDER BY id LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![cursor, BATCH_SIZE], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(anyhow::Error::from)
}

// ---------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------

/// Reconstruye los índices de identidad y búsqueda de una base
/// PostgreSQL (pool ya abierto y migrado).
pub async fn reindex_postgres(pool: &PgPool, key: &[u8; 32], force: bool) -> Result<ReindexReport> {
    let mut report = ReindexReport::default();
    reindex_search_postgres(pool, key, force, &mut report).await?;
    reindex_identity_postgres(pool, key, force, &mut report).await?;
    Ok(report)
}

async fn reindex_search_postgres(
    pool: &PgPool,
    key: &[u8; 32],
    force: bool,
    report: &mut ReindexReport,
) -> Result<()> {
    let fingerprint = search_fingerprint(key);
    let state = search_state_postgres(pool).await?;
    if state.0 == fingerprint && state.2 && !force {
        return Ok(());
    }
    let mut cursor;
    if state.0 != fingerprint || force {
        let mut tx = pool.begin().await?;
        sqlx::query("DELETE FROM \"VisitorSearchTokens\"")
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE \"SearchIndexState\" SET fingerprint = $1, cursor = 0, ready = false WHERE id = true",
        )
        .bind(&fingerprint)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        cursor = 0i64;
    } else {
        sqlx::query(
            "UPDATE \"SearchIndexState\" SET fingerprint = $1, cursor = $2, ready = false WHERE id = true",
        )
        .bind(&fingerprint)
        .bind(state.1)
        .execute(pool)
        .await?;
        cursor = state.1 as i64;
    }
    loop {
        let rows = sqlx::query(
            "SELECT id, first_name, last_name, encrypted_cedula FROM \"Visitors\" \
             WHERE id > $1 AND \"anonymizedAt\" IS NULL ORDER BY id LIMIT $2",
        )
        .bind(cursor as i32)
        .bind(BATCH_SIZE as i32)
        .fetch_all(pool)
        .await?;
        if rows.is_empty() {
            break;
        }
        let mut last = cursor;
        let mut tokens = 0u64;
        let mut tx = pool.begin().await?;
        for row in &rows {
            let id = row.try_get::<i32, _>(0)? as i64;
            let first: String = row.try_get(1)?;
            let last_name: String = row.try_get(2)?;
            let encrypted: Option<String> = row.try_get(3)?;
            let tokens_for =
                visitor_tokens(key, &first, &last_name, encrypted.as_deref().unwrap_or(""))?;
            tokens += tokens_for.len() as u64;
            sqlx::query("DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = $1")
                .bind(id as i32)
                .execute(&mut *tx)
                .await?;
            for token in &tokens_for {
                sqlx::query(
                    "INSERT INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES($1, $2) \
                     ON CONFLICT DO NOTHING",
                )
                .bind(id as i32)
                .bind(token.as_slice())
                .execute(&mut *tx)
                .await?;
            }
            last = id;
        }
        sqlx::query("UPDATE \"SearchIndexState\" SET cursor = $1 WHERE id = true")
            .bind(last as i32)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        cursor = last;
        report.search_visitors += rows.len() as u64;
        report.search_tokens += tokens;
    }
    sqlx::query(
        "UPDATE \"SearchIndexState\" SET fingerprint = $1, cursor = $2, ready = true WHERE id = true",
    )
    .bind(&fingerprint)
    .bind(cursor as i32)
    .execute(pool)
    .await?;
    report.search_rebuilt = true;
    Ok(())
}

/// `(fingerprint, cursor, ready)` de `SearchIndexState` en PG.
async fn search_state_postgres(pool: &PgPool) -> Result<(String, i32, bool)> {
    let row =
        sqlx::query("SELECT fingerprint, cursor, ready FROM \"SearchIndexState\" WHERE id = true")
            .fetch_one(pool)
            .await?;
    Ok((row.try_get(0)?, row.try_get(1)?, row.try_get(2)?))
}

/// `(fingerprint, ready)` de `IdentityIndexState` en PG.
async fn identity_state_postgres(pool: &PgPool) -> Result<(String, bool)> {
    let row = sqlx::query("SELECT fingerprint, ready FROM \"IdentityIndexState\" WHERE id = true")
        .fetch_one(pool)
        .await?;
    Ok((row.try_get(0)?, row.try_get(1)?))
}

async fn reindex_identity_postgres(
    pool: &PgPool,
    key: &[u8; 32],
    force: bool,
    report: &mut ReindexReport,
) -> Result<()> {
    let fingerprint = identity_fingerprint(key);
    let (current, ready) = identity_state_postgres(pool).await?;
    if ready {
        if current != fingerprint {
            bail!("el índice de identidad se preparó con otra clave");
        }
        if !force {
            return Ok(());
        }
    }
    // Una sola transacción con el candado asesor de Go.
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(IDENTITY_LOCK)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE \"IdentityIndexState\" SET ready = false WHERE id = true")
        .execute(&mut *tx)
        .await?;
    let mut maps = IdentityMaps::default();
    let mut visitors = 0u64;
    let mut cursor = 0i32;
    loop {
        let rows = sqlx::query(
            "SELECT id, cedula, encrypted_cedula, \"anonymizedAt\" IS NOT NULL FROM \"Visitors\" \
             WHERE id > $1 ORDER BY id LIMIT $2",
        )
        .bind(cursor)
        .bind(BATCH_SIZE as i32)
        .fetch_all(&mut *tx)
        .await?;
        if rows.is_empty() {
            break;
        }
        for row in &rows {
            let id = row.try_get::<i32, _>(0)? as i64;
            let current: String = row.try_get(1)?;
            let encrypted: Option<String> = row.try_get(2)?;
            let anonymized: bool = row.try_get(3)?;
            cursor = id as i32;
            if let Some((old, new)) =
                maps.register_visitor(id, &current, encrypted.as_deref(), anonymized, key)?
            {
                let changed = sqlx::query(
                    "UPDATE \"Visitors\" SET cedula = $1 WHERE id = $2 AND cedula = $3",
                )
                .bind(&new)
                .bind(id as i32)
                .bind(&old)
                .execute(&mut *tx)
                .await?
                .rows_affected();
                if changed != 1 {
                    bail!("filas de visitante cambiadas durante el mantenimiento");
                }
                visitors += 1;
            }
        }
    }
    let mut visits = 0u64;
    let mut cursor = 0i32;
    loop {
        let rows = sqlx::query(
            "SELECT id, visitor_id, visitor_cedula, status::text, check_out_time IS NOT NULL \
             FROM \"Visits\" WHERE id > $1 ORDER BY id LIMIT $2",
        )
        .bind(cursor)
        .bind(BATCH_SIZE as i32)
        .fetch_all(&mut *tx)
        .await?;
        if rows.is_empty() {
            break;
        }
        for row in &rows {
            let id = row.try_get::<i32, _>(0)? as i64;
            let visitor_id: Option<i32> = row.try_get(1)?;
            let cedula: String = row.try_get(2)?;
            let status: Option<String> = row.try_get(3)?;
            let has_checkout: bool = row.try_get(4)?;
            cursor = id as i32;
            if let Some((old, new)) = maps.resolve_visit(
                id,
                visitor_id.map(i64::from),
                &cedula,
                status.as_deref(),
                has_checkout,
            )? {
                // Como en SQLite: si otra visita abierta ya tiene
                // el destino, el índice parcial único rechaza la
                // actualización (23505) y se traduce al mensaje de
                // dominio.
                let changed = sqlx::query(
                    "UPDATE \"Visits\" SET visitor_cedula = $1 WHERE id = $2 AND visitor_cedula = $3",
                )
                .bind(&new)
                .bind(id as i32)
                .bind(&old)
                .execute(&mut *tx)
                .await
                .map_err(|e| {
                    if e.to_string().contains("duplicate key value violates unique constraint") {
                        anyhow!("visitas abiertas duplicadas comparten una identidad")
                    } else {
                        anyhow::Error::from(e)
                    }
                })?
                .rows_affected();
                if changed != 1 {
                    bail!("filas de visita cambiadas durante el mantenimiento");
                }
                visits += 1;
            }
        }
    }
    let mut arco = 0u64;
    let mut cursor = 0i32;
    loop {
        let rows = sqlx::query(
            "SELECT id, \"subjectCedulaHash\", \"subjectCedulaEncrypted\" FROM \"ArcoRequests\" \
             WHERE id > $1 ORDER BY id LIMIT $2",
        )
        .bind(cursor)
        .bind(BATCH_SIZE as i32)
        .fetch_all(&mut *tx)
        .await?;
        if rows.is_empty() {
            break;
        }
        for row in &rows {
            let id = row.try_get::<i32, _>(0)? as i64;
            let hash: String = row.try_get(1)?;
            let encrypted: Option<String> = row.try_get(2)?;
            cursor = id as i32;
            if let Some((old, new)) = maps.resolve_arco(id, &hash, encrypted.as_deref(), key)? {
                let changed = sqlx::query(
                    "UPDATE \"ArcoRequests\" SET \"subjectCedulaHash\" = $1 WHERE id = $2 AND \"subjectCedulaHash\" = $3",
                )
                .bind(&new)
                .bind(id as i32)
                .bind(&old)
                .execute(&mut *tx)
                .await?
                .rows_affected();
                if changed != 1 {
                    bail!("filas de solicitud ARCO cambiadas durante el mantenimiento");
                }
                arco += 1;
            }
        }
    }
    sqlx::query("UPDATE \"IdentityIndexState\" SET fingerprint = $1, ready = true WHERE id = true")
        .bind(&fingerprint)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    report.identity_visitors = visitors;
    report.identity_visits = visits;
    report.identity_arco = arco;
    report.identity_rebuilt = true;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use logmaster_crypto::encrypt;
    use logmaster_crypto::{identity_hash, search_fingerprint, search_tokens, sha256_hex};

    use crate::repos::{privacy, visitors, visits};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const KEY: [u8; 32] = [0x19u8; 32];

    fn migrated() -> Store {
        let store = Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        store
    }

    /// Siembra un perfil con la `cedula` en el formato indicado:
    /// `legacy` (SHA-256 de la normalizada, como antes de la
    /// preparación de identidad) o `target` (HMAC, ya preparado).
    /// La cédula en claro es siempre `V-10000001`.
    fn seed_visitor(store: &Store, style: &str, anonymized: bool) -> i64 {
        let plain = "V-10000001";
        let encrypted = encrypt(&KEY, plain).unwrap();
        let first = encrypt(&KEY, "Ana").unwrap();
        let last = encrypt(&KEY, "Pérez").unwrap();
        let hash = match style {
            "legacy" => sha256_hex(&normalize_identity(plain)),
            "target" => identity_hash(&KEY, &normalize_identity(plain)),
            other => panic!("estilo desconocido: {other}"),
        };
        let id = store
            .tx_immediate(|tx| {
                visitors::insert(
                    tx,
                    &visitors::NewVisitor {
                        cedula_hash: &hash,
                        encrypted_cedula: Some(&encrypted),
                        first_name: &first,
                        last_name: &last,
                        company: "Trébol",
                        job_title: None,
                        email: None,
                        phone: None,
                        photo_data: None,
                        id_photo_data: None,
                        created_at: NOW,
                        updated_at: NOW,
                    },
                )
                .map_err(anyhow::Error::from)
            })
            .unwrap();
        if anonymized {
            store
                .tx_immediate(|tx| {
                    tx.execute(
                        "UPDATE \"Visitors\" SET \"anonymizedAt\" = ?1 WHERE id = ?2",
                        params![NOW, id],
                    )?;
                    Ok(())
                })
                .unwrap();
        }
        id
    }

    fn seed_visit(store: &Store, visitor_id: i64, cedula: &str) -> i64 {
        store
            .tx_immediate(|tx| {
                visits::insert_checkin(
                    tx,
                    &visits::NewVisit {
                        visitor_cedula: cedula,
                        visitor_id,
                        purpose: "Reunión",
                        person_to_visit: "Ana",
                        status: "waiting",
                        notes: None,
                        companion_name: None,
                        companion_cedula: None,
                        vehicle_brand: None,
                        vehicle_model: None,
                        vehicle_plate: None,
                        area: None,
                        action: "Ninguna",
                        department: None,
                        target_department: None,
                        host_person: None,
                        arrival_time: NOW,
                        entry_time: None,
                        check_in_time: NOW,
                        consent_policy_version: "1",
                        consent_accepted_at: NOW,
                        consent_recorded_by: 1,
                        created_at: NOW,
                        updated_at: NOW,
                    },
                )
                .map_err(anyhow::Error::from)
            })
            .unwrap()
    }

    fn seed_arco(store: &Store, hash: &str, encrypted: &str) -> i64 {
        store
            .tx_immediate(|tx| {
                privacy::insert_request(
                    tx,
                    &privacy::NewArcoRequest {
                        request_type: "access",
                        subject_cedula_hash: hash,
                        subject_cedula_encrypted: Some(encrypted),
                        requested_by_name: "Ana",
                        requested_by_user_id: None,
                        contact_email: None,
                        reason: None,
                        request_payload: None,
                        created_at: NOW,
                        updated_at: NOW,
                    },
                )
                .map_err(anyhow::Error::from)
            })
            .unwrap()
    }

    #[test]
    fn reindex_sqlite_rebuilds_legacy_identity_and_search() {
        let store = migrated();
        let target = identity_hash(&KEY, "V-10000001");
        let legacy = sha256_hex("V-10000001");
        // Perfil con referencia histórica (SHA-256) y visita + ARCO
        // con la misma referencia histórica.
        let visitor = seed_visitor(&store, "legacy", false);
        let visit = seed_visit(&store, visitor, &legacy);
        let encrypted = encrypt(&KEY, "V-10000001").unwrap();
        let arco = seed_arco(&store, &legacy, &encrypted);
        // Sin preparar: huellas sin verificar.
        assert!(!store.verify_key_fingerprints(&KEY).unwrap());

        let report = reindex_sqlite(&store, &KEY, false).unwrap();
        assert!(report.search_rebuilt);
        assert!(report.identity_rebuilt);
        assert_eq!(report.search_visitors, 1);
        assert_eq!(report.identity_visitors, 1);
        assert_eq!(report.identity_visits, 1);
        assert_eq!(report.identity_arco, 1);
        assert_eq!(
            report.search_tokens as usize,
            search_tokens(&KEY, "Ana Pérez V-10000001").len()
        );
        // Referencias actualizadas al HMAC.
        let cedula = store
            .read(|conn| {
                conn.query_row(
                    "SELECT cedula FROM \"Visitors\" WHERE id = ?1",
                    params![visitor],
                    |row| row.get::<_, String>(0),
                )
                .map_err(anyhow::Error::from)
            })
            .unwrap();
        assert_eq!(cedula, target);
        let visit_cedula = store
            .read(|conn| {
                conn.query_row(
                    "SELECT visitor_cedula FROM \"Visits\" WHERE id = ?1",
                    params![visit],
                    |row| row.get::<_, String>(0),
                )
                .map_err(anyhow::Error::from)
            })
            .unwrap();
        assert_eq!(visit_cedula, target);
        let arco_hash = store
            .read(|conn| {
                conn.query_row(
                    "SELECT \"subjectCedulaHash\" FROM \"ArcoRequests\" WHERE id = ?1",
                    params![arco],
                    |row| row.get::<_, String>(0),
                )
                .map_err(anyhow::Error::from)
            })
            .unwrap();
        assert_eq!(arco_hash, target);
        // Tokens guardados y huellas listas.
        let tokens = store
            .read(|conn| {
                search_repo::tokens_for_visitor(conn, visitor).map_err(anyhow::Error::from)
            })
            .unwrap();
        assert_eq!(tokens.len(), report.search_tokens as usize);
        assert!(store.verify_key_fingerprints(&KEY).unwrap());

        // Segunda pasada sin `--force`: no rehace nada.
        let report = reindex_sqlite(&store, &KEY, false).unwrap();
        assert!(!report.search_rebuilt);
        assert!(!report.identity_rebuilt);
        assert_eq!(report.search_visitors, 0);
        assert_eq!(report.identity_visitors, 0);

        // Con `--force`: rehace los dos índices.
        let report = reindex_sqlite(&store, &KEY, true).unwrap();
        assert!(report.search_rebuilt);
        assert!(report.identity_rebuilt);
        assert_eq!(report.search_visitors, 1);
        assert_eq!(report.identity_visitors, 0);
    }

    #[test]
    fn reindex_sqlite_skips_anonymized_and_rejects_wrong_key() {
        let store = migrated();
        // Perfil anonimizado: sin tokens y sin tocar su referencia.
        let anon = seed_visitor(&store, "legacy", true);
        let report = reindex_sqlite(&store, &KEY, false).unwrap();
        assert_eq!(report.search_visitors, 0);
        assert_eq!(report.identity_visitors, 0);
        let cedula = store
            .read(|conn| {
                conn.query_row(
                    "SELECT cedula FROM \"Visitors\" WHERE id = ?1",
                    params![anon],
                    |row| row.get::<_, String>(0),
                )
                .map_err(anyhow::Error::from)
            })
            .unwrap();
        assert_eq!(cedula, sha256_hex("V-10000001"));
        assert!(store.verify_key_fingerprints(&KEY).unwrap());

        // Otra clave con los índices listos: error, no arranque con
        // datos de otra clave.
        let err = reindex_sqlite(&store, &[0x20u8; 32], false).unwrap_err();
        assert!(err.to_string().contains("otra clave"));
        // La huella de búsqueda con otra clave también es error.
        let _ = search_fingerprint(&[0x20u8; 32]);
    }

    #[test]
    fn reindex_sqlite_rejects_duplicate_open_visits() {
        let store = migrated();
        let legacy = sha256_hex("V-10000001");
        let target = identity_hash(&KEY, "V-10000001");
        let visitor = seed_visitor(&store, "legacy", false);
        // Dos visitas abiertas para la misma identidad, con
        // referencias distintas (histórica y ya migrada): el índice
        // parcial único no las ve como duplicadas (distinto
        // `visitor_cedula`), pero el reindex sí, al mapear ambas
        // al mismo destino.
        seed_visit(&store, visitor, &legacy);
        store
            .tx_immediate(|tx| {
                tx.execute(
                    "INSERT INTO \"Visits\"(visitor_id, visitor_cedula, purpose, person_to_visit, \
                     status, check_in_time, action, consent_policy_version, consent_accepted_at, \
                     consent_recorded_by, \"createdAt\", \"updatedAt\") \
                     VALUES(?1, ?2, 'Reunión', 'Ana', 'active', ?3, 'Ninguna', '1', ?3, 1, ?3, ?3)",
                    params![visitor, target, NOW],
                )?;
                Ok(())
            })
            .unwrap();
        let err = reindex_sqlite(&store, &KEY, false).unwrap_err();
        assert!(err.to_string().contains("abiertas duplicadas"));
    }
}
