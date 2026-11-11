//! Perfiles de visitante (`Visitors`) e historial de cambios
//! (`VisitorEditHistories`).
//!
//! Reproduce `FindVisitor`, `LockVisitor`, `FindVisitorByID` y las
//! escrituras de `visits.go` y `visitors.go`. El bloqueo de fila
//! (`FOR UPDATE`) lo sustituye la transacción inmediata del llamador.
//!
//! La cédula que se busca es el HMAC hex de la cédula normalizada
//! (columna `cedula`); la cédula en claro nunca se guarda.

use rusqlite::{params, Connection, Transaction};

use crate::error::{StoreError, StoreResult};
use crate::models::{Visitor, VisitorEditHistory};

const VISITOR_COLUMNS: &str = "id, \"anonymizedAt\", cedula, encrypted_cedula, first_name, \
    last_name, company, job_title, photo_url, id_photo_url, email, phone, \"updatedAt\", \
    photo_data, id_photo_data, \"isBlocked\", observations, \"createdAt\"";

fn row_to_visitor(row: &rusqlite::Row<'_>) -> rusqlite::Result<Visitor> {
    Visitor::try_from(row)
}

/// `FindVisitor`: por hash de cédula, solo no anonimizados.
pub fn find_by_cedula(conn: &Connection, cedula_hash: &str) -> StoreResult<Visitor> {
    let sql = format!(
        "SELECT {VISITOR_COLUMNS} FROM \"Visitors\" \
         WHERE cedula = ?1 AND \"anonymizedAt\" IS NULL"
    );
    conn.query_row(&sql, params![cedula_hash], row_to_visitor)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                StoreError::not_found("VISITOR_NOT_FOUND", "visitante no encontrado")
            }
            other => other.into(),
        })
}

/// `FindVisitorByID`: por id, incluya anonimizados (para trazabilidad).
pub fn find_by_id(conn: &Connection, id: i64) -> StoreResult<Visitor> {
    let sql = format!("SELECT {VISITOR_COLUMNS} FROM \"Visitors\" WHERE id = ?1");
    conn.query_row(&sql, params![id], row_to_visitor)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                StoreError::not_found("VISITOR_NOT_FOUND", format!("visitante {id} no existe"))
            }
            other => other.into(),
        })
}

/// Datos para crear un perfil (los campos de texto llegan ya cifrados
/// con el formato de Go; `company` va en claro, como hoy).
pub struct NewVisitor<'a> {
    pub cedula_hash: &'a str,
    pub encrypted_cedula: Option<&'a str>,
    pub first_name: &'a str,
    pub last_name: &'a str,
    pub company: &'a str,
    pub job_title: Option<&'a str>,
    pub email: Option<&'a str>,
    pub phone: Option<&'a str>,
    pub photo_data: Option<&'a [u8]>,
    pub id_photo_data: Option<&'a [u8]>,
    pub created_at: &'a str,
    pub updated_at: &'a str,
}

/// Inserta un perfil y devuelve su id.
pub fn insert(tx: &Transaction, visitor: &NewVisitor<'_>) -> StoreResult<i64> {
    tx.execute(
        "INSERT INTO \"Visitors\"(cedula, encrypted_cedula, first_name, last_name, company, \
         job_title, email, phone, photo_data, id_photo_data, \"createdAt\", \"updatedAt\") \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            visitor.cedula_hash,
            visitor.encrypted_cedula,
            visitor.first_name,
            visitor.last_name,
            visitor.company,
            visitor.job_title,
            visitor.email,
            visitor.phone,
            visitor.photo_data,
            visitor.id_photo_data,
            visitor.created_at,
            visitor.updated_at,
        ],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Actualiza un perfil completo (la edición de la fase 4 carga,
/// modifica y guarda en la misma transacción que el historial).
pub fn update(tx: &Transaction, visitor: &Visitor, now: &str) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"Visitors\" SET first_name = ?2, last_name = ?3, company = ?4, job_title = ?5, \
         photo_url = ?6, id_photo_url = ?7, email = ?8, phone = ?9, photo_data = ?10, \
         id_photo_data = ?11, \"isBlocked\" = ?12, observations = ?13, \"updatedAt\" = ?14 \
         WHERE id = ?1",
        params![
            visitor.id,
            visitor.first_name,
            visitor.last_name,
            visitor.company,
            visitor.job_title,
            visitor.photo_url,
            visitor.id_photo_url,
            visitor.email,
            visitor.phone,
            visitor.photo_data,
            visitor.id_photo_data,
            visitor.is_blocked.unwrap_or(false) as i64,
            visitor.observations,
            now,
        ],
    )?;
    Ok(())
}

/// Bloquea o desbloquea un perfil (admin/root con contraseña
/// adicional, que comprueba el handler).
pub fn set_blocked(tx: &Transaction, id: i64, blocked: bool, now: &str) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"Visitors\" SET \"isBlocked\" = ?2, \"updatedAt\" = ?3 WHERE id = ?1",
        params![id, blocked as i64, now],
    )?;
    Ok(())
}

/// Actualiza solo las fotos de un perfil.
pub fn update_photos(
    tx: &Transaction,
    id: i64,
    photo_data: Option<&[u8]>,
    id_photo_data: Option<&[u8]>,
    now: &str,
) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"Visitors\" SET photo_data = ?2, id_photo_data = ?3, \"updatedAt\" = ?4 WHERE id = ?1",
        params![id, photo_data, id_photo_data, now],
    )?;
    Ok(())
}

/// Empresas distintas, para el filtro de visitantes.
pub fn list_companies(conn: &Connection) -> StoreResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT company FROM \"Visitors\" WHERE company IS NOT NULL ORDER BY company",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Un cambio de campo de un perfil (para el historial de edición).
pub struct NewEditHistory<'a> {
    pub visit_id: Option<i64>,
    pub visitor_id: i64,
    pub field: &'a str,
    pub old_value: Option<&'a str>,
    pub new_value: Option<&'a str>,
    pub edited_by: i64,
    pub edited_by_username: &'a str,
    pub edited_at: &'a str,
    pub created_at: &'a str,
}

/// Registra un cambio de perfil y devuelve su id.
pub fn insert_edit_history(tx: &Transaction, change: &NewEditHistory<'_>) -> StoreResult<i64> {
    tx.execute(
        "INSERT INTO \"VisitorEditHistories\"(\"visitId\", \"visitorId\", field, \"oldValue\", \"newValue\", \
         \"editedBy\", \"editedByUsername\", \"editedAt\", \"createdAt\") \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            change.visit_id,
            change.visitor_id,
            change.field,
            change.old_value,
            change.new_value,
            change.edited_by,
            change.edited_by_username,
            change.edited_at,
            change.created_at,
        ],
    )?;
    Ok(tx.last_insert_rowid())
}

const HISTORY_COLUMNS: &str = "id, \"visitId\", \"visitorId\", field, \"oldValue\", \"newValue\", \
    \"editedBy\", \"editedByUsername\", \"editedAt\", \"createdAt\"";

/// Historial de un perfil, el más reciente primero.
pub fn list_edit_history_by_visitor(
    conn: &Connection,
    visitor_id: i64,
) -> StoreResult<Vec<VisitorEditHistory>> {
    let sql = format!(
        "SELECT {HISTORY_COLUMNS} FROM \"VisitorEditHistories\" \
         WHERE \"visitorId\" = ?1 ORDER BY \"editedAt\" DESC, id DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![visitor_id], |row| VisitorEditHistory::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Historial de una visita, el más reciente primero.
pub fn list_edit_history_by_visit(
    conn: &Connection,
    visit_id: i64,
) -> StoreResult<Vec<VisitorEditHistory>> {
    let sql = format!(
        "SELECT {HISTORY_COLUMNS} FROM \"VisitorEditHistories\" \
         WHERE \"visitId\" = ?1 ORDER BY \"editedAt\" DESC, id DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![visit_id], |row| VisitorEditHistory::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;

    fn migrated() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::apply(&mut conn).unwrap();
        conn
    }

    const NOW: &str = "2026-11-10T00:00:00.000000Z";

    fn seed(conn: &mut Connection) -> i64 {
        let tx = conn.transaction().unwrap();
        let id = insert(
            &tx,
            &NewVisitor {
                cedula_hash: "aabbcc",
                encrypted_cedula: Some("ENC:aa:bb:cc"),
                first_name: "ENC:nombre",
                last_name: "ENC:apellido",
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
        tx.commit().unwrap();
        id
    }

    #[test]
    fn insert_and_find_by_cedula_and_id() {
        let mut conn = migrated();
        let id = seed(&mut conn);
        let by_cedula = find_by_cedula(&conn, "aabbcc").unwrap();
        assert_eq!(by_cedula.id, id);
        assert_eq!(by_cedula.company, "Trébol");
        assert_eq!(find_by_id(&conn, id).unwrap().cedula, "aabbcc");
        assert!(matches!(
            find_by_cedula(&conn, "sin-existir"),
            Err(StoreError::NotFound {
                code: "VISITOR_NOT_FOUND",
                ..
            })
        ));
    }

    #[test]
    fn duplicate_cedula_hash_is_rejected() {
        let mut conn = migrated();
        seed(&mut conn);
        let tx = conn.transaction().unwrap();
        let err = insert(
            &tx,
            &NewVisitor {
                cedula_hash: "aabbcc",
                encrypted_cedula: None,
                first_name: "X",
                last_name: "Y",
                company: "Otra",
                job_title: None,
                email: None,
                phone: None,
                photo_data: None,
                id_photo_data: None,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap_err();
        assert!(matches!(err, StoreError::Db(_)));
        tx.rollback().unwrap();
    }

    #[test]
    fn edit_history_roundtrip() {
        let mut conn = migrated();
        let id = seed(&mut conn);
        let tx = conn.transaction().unwrap();
        insert_edit_history(
            &tx,
            &NewEditHistory {
                visit_id: None,
                visitor_id: id,
                field: "company",
                old_value: Some("Trébol"),
                new_value: Some("Trébol 2"),
                edited_by: 1,
                edited_by_username: "root",
                edited_at: NOW,
                created_at: NOW,
            },
        )
        .unwrap();
        tx.commit().unwrap();
        let history = list_edit_history_by_visitor(&conn, id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].field, "company");
        assert_eq!(history[0].new_value.as_deref(), Some("Trébol 2"));
        assert!(list_edit_history_by_visit(&conn, 99).unwrap().is_empty());
    }

    #[test]
    fn companies_are_distinct_and_sorted() {
        let mut conn = migrated();
        seed(&mut conn);
        let tx = conn.transaction().unwrap();
        insert(
            &tx,
            &NewVisitor {
                cedula_hash: "ddeeff",
                encrypted_cedula: None,
                first_name: "B",
                last_name: "C",
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
        insert(
            &tx,
            &NewVisitor {
                cedula_hash: "112233",
                encrypted_cedula: None,
                first_name: "D",
                last_name: "E",
                company: "Otra",
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
        tx.commit().unwrap();
        assert_eq!(list_companies(&conn).unwrap(), vec!["Otra", "Trébol"]);
    }
}
