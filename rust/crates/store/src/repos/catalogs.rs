//! Catálogos heredados (`Departments`, `VisitPurposes`).
//!
//! El contrato de visitas también usa campos textuales libres, así
//! que estos catálogos son de referencia y no una restricción.

use rusqlite::{params, Connection, Transaction};

use crate::error::StoreResult;
use crate::models::{Department, VisitPurpose};

/// Departamentos, por nombre.
pub fn list_departments(conn: &Connection) -> StoreResult<Vec<Department>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, code, \"isActive\", \"createdAt\" FROM \"Departments\" ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| Department::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Crea un departamento y devuelve su id.
pub fn insert_department(
    tx: &Transaction,
    name: &str,
    code: Option<&str>,
    now: &str,
) -> StoreResult<i64> {
    tx.execute(
        "INSERT INTO \"Departments\"(name, code, \"isActive\", \"createdAt\") VALUES(?1, ?2, 1, ?3)",
        params![name, code, now],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Activa o desactiva un departamento.
pub fn set_department_active(tx: &Transaction, id: i64, active: bool) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"Departments\" SET \"isActive\" = ?2 WHERE id = ?1",
        params![id, active as i64],
    )?;
    Ok(())
}

/// Propósitos de visita, por nombre.
pub fn list_purposes(conn: &Connection) -> StoreResult<Vec<VisitPurpose>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, \"isActive\", \"createdAt\" FROM \"VisitPurposes\" ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| VisitPurpose::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Crea un propósito y devuelve su id.
pub fn insert_purpose(tx: &Transaction, name: &str, now: &str) -> StoreResult<i64> {
    tx.execute(
        "INSERT INTO \"VisitPurposes\"(name, \"isActive\", \"createdAt\") VALUES(?1, 1, ?2)",
        params![name, now],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Activa o desactiva un propósito.
pub fn set_purpose_active(tx: &Transaction, id: i64, active: bool) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"VisitPurposes\" SET \"isActive\" = ?2 WHERE id = ?1",
        params![id, active as i64],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;

    const NOW: &str = "2026-11-10T00:00:00.000000Z";

    #[test]
    fn departments_and_purposes_roundtrip() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations::apply(&mut conn).unwrap();
        let tx = conn.transaction().unwrap();
        let dept = insert_department(&tx, "Recepción", Some("REC"), NOW).unwrap();
        let purpose = insert_purpose(&tx, "Reunión", NOW).unwrap();
        tx.commit().unwrap();
        assert_eq!(list_departments(&conn).unwrap().len(), 1);
        assert_eq!(list_purposes(&conn).unwrap().len(), 1);
        let tx = conn.transaction().unwrap();
        set_department_active(&tx, dept, false).unwrap();
        set_purpose_active(&tx, purpose, false).unwrap();
        tx.commit().unwrap();
        assert_eq!(list_departments(&conn).unwrap()[0].is_active, Some(false));
        assert_eq!(list_purposes(&conn).unwrap()[0].is_active, Some(false));
    }
}
