//! Búsqueda protegida por trigramas (`VisitorSearchTokens`) y estados
//! de índice (`SearchIndexState`, `IdentityIndexState`).
//!
//! Los tokens son HMAC-SHA-256 de 32 bytes que `convert` copia tal
//! cual desde PostgreSQL: no hay que reindexar por el cambio de
//! lenguaje, solo si cambia la clave (documento, §11.1). La generación
//! de tokens nuevos (trigramas con el contexto `logmaster/name-search/v1`)
//! es de la fase 3, junto con el resto de la criptografía; aquí solo
//! se guardan, se borran y se consultan.
//!
//! Los estados son filas únicas (`id = 1`): guardan la huella de la
//! clave, el cursor de la reconstrucción por lotes y si el índice está
//! listo. La reconstrucción por lotes (`logmaster.exe ops reindex`)
//! llega con la fase 6.

use rusqlite::{params, Connection, Transaction};

use crate::error::{StoreError, StoreResult};
use crate::models::{IdentityIndexState, SearchIndexState, VisitorSearchToken};

/// Sustituye los tokens de un visitante por los dados. `INSERT OR
/// IGNORE` reproduce el `ON CONFLICT DO NOTHING` de Go.
pub fn replace_tokens(
    tx: &Transaction,
    visitor_id: i64,
    tokens: &[Vec<u8>],
) -> StoreResult<()> {
    tx.execute(
        "DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = ?1",
        params![visitor_id],
    )?;
    for token in tokens {
        tx.execute(
            "INSERT OR IGNORE INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES(?1, ?2)",
            params![visitor_id, token],
        )?;
    }
    Ok(())
}

/// Borra los tokens de un visitante (al anonimizarlo, por ejemplo).
pub fn delete_tokens(tx: &Transaction, visitor_id: i64) -> StoreResult<()> {
    tx.execute(
        "DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = ?1",
        params![visitor_id],
    )?;
    Ok(())
}

/// Tokens de un visitante.
pub fn tokens_for_visitor(
    conn: &Connection,
    visitor_id: i64,
) -> StoreResult<Vec<VisitorSearchToken>> {
    let mut stmt = conn.prepare(
        "SELECT visitor_id, token FROM \"VisitorSearchTokens\" WHERE visitor_id = ?1",
    )?;
    let rows = stmt.query_map(params![visitor_id], |row| VisitorSearchToken::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Visitantes que tienen un token dado (coincidencia por igualdad,
/// sin descifrar perfiles).
pub fn find_visitors_by_token(conn: &Connection, token: &[u8]) -> StoreResult<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT visitor_id FROM \"VisitorSearchTokens\" WHERE token = ?1 ORDER BY visitor_id",
    )?;
    let rows = stmt.query_map(params![token], |row| row.get::<_, i64>(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Estado del índice de búsqueda (fila única).
pub fn get_search_state(conn: &Connection) -> StoreResult<SearchIndexState> {
    conn.query_row(
        "SELECT id, fingerprint, cursor, ready FROM \"SearchIndexState\" WHERE id = 1",
        [],
        |row| SearchIndexState::try_from(row),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            StoreError::not_found("INDEX_STATE_NOT_FOUND", "falta la fila de SearchIndexState")
        }
        other => other.into(),
    })
}

/// Guarda el estado del índice de búsqueda.
pub fn set_search_state(
    tx: &Transaction,
    fingerprint: &str,
    cursor: i64,
    ready: bool,
) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"SearchIndexState\" SET fingerprint = ?1, cursor = ?2, ready = ?3 WHERE id = 1",
        params![fingerprint, cursor, ready as i64],
    )?;
    Ok(())
}

/// Estado del índice de identidad (fila única).
pub fn get_identity_state(conn: &Connection) -> StoreResult<IdentityIndexState> {
    conn.query_row(
        "SELECT id, fingerprint, ready FROM \"IdentityIndexState\" WHERE id = 1",
        [],
        |row| IdentityIndexState::try_from(row),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => StoreError::not_found(
            "INDEX_STATE_NOT_FOUND",
            "falta la fila de IdentityIndexState",
        ),
        other => other.into(),
    })
}

/// Guarda el estado del índice de identidad.
pub fn set_identity_state(
    tx: &Transaction,
    fingerprint: &str,
    ready: bool,
) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"IdentityIndexState\" SET fingerprint = ?1, ready = ?2 WHERE id = 1",
        params![fingerprint, ready as i64],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;
    use crate::repos::visitors::{self, NewVisitor};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";

    fn migrated() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::apply(&mut conn).unwrap();
        conn
    }

    #[test]
    fn tokens_replace_lookup_and_delete() {
        let mut conn = migrated();
        let tx = conn.transaction().unwrap();
        let visitor_id = visitors::insert(
            &tx,
            &NewVisitor {
                cedula_hash: "hash-a",
                encrypted_cedula: None,
                first_name: "Ana",
                last_name: "Pérez",
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
        .unwrap();
        let token_a = vec![1u8; 32];
        let token_b = vec![2u8; 32];
        replace_tokens(&tx, visitor_id, &[token_a.clone(), token_b.clone()]).unwrap();
        // Reemplazar con un solo token borra el otro.
        replace_tokens(&tx, visitor_id, &[token_a.clone()]).unwrap();
        tx.commit().unwrap();

        let tokens = tokens_for_visitor(&conn, visitor_id).unwrap();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].token, token_a);
        assert_eq!(find_visitors_by_token(&conn, &token_a).unwrap(), vec![visitor_id]);
        assert!(find_visitors_by_token(&conn, &token_b).unwrap().is_empty());

        let tx = conn.transaction().unwrap();
        delete_tokens(&tx, visitor_id).unwrap();
        tx.commit().unwrap();
        assert!(tokens_for_visitor(&conn, visitor_id).unwrap().is_empty());
    }

    #[test]
    fn index_states_roundtrip() {
        let mut conn = migrated();
        let state = get_search_state(&conn).unwrap();
        assert_eq!(state.fingerprint, "");
        assert!(!state.ready);
        let tx = conn.transaction().unwrap();
        set_search_state(&tx, "huella-abc", 42, true).unwrap();
        set_identity_state(&tx, "huella-def", true).unwrap();
        tx.commit().unwrap();
        let state = get_search_state(&conn).unwrap();
        assert_eq!(state.fingerprint, "huella-abc");
        assert_eq!(state.cursor, 42);
        assert!(state.ready);
        assert_eq!(get_identity_state(&conn).unwrap().fingerprint, "huella-def");
    }
}
