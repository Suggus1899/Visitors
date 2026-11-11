//! Cuentas de usuario (`Users`).
//!
//! Reproduce `server-go/db/queries.sql`: `FindUser`, `FindUserByID`,
//! `LockUser`, `LoginSucceeded`, `LoginFailed`, `SaveResetToken`,
//! `ConsumeResetToken`, `ChangePassword`, `ListUsers`. El bloqueo de
//! fila (`FOR UPDATE`) de PostgreSQL lo sustituye la transacción
//! inmediata del llamador: con un solo escritor, la fila ya está
//! bloqueada mientras dura la transacción.

use rusqlite::{params, Connection, Transaction};

use crate::error::{StoreError, StoreResult};
use crate::models::User;

const USER_COLUMNS: &str = "id, username, email, \"tokenVersion\", password, role, \
    \"resetToken\", \"resetTokenExpiry\", \"createdAt\", \"updatedAt\", \
    \"mustChangePassword\", \"passwordChangedAt\", \"loginAttempts\", \"lockedUntil\"";

fn row_to_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<User> {
    User::try_from(row)
}

/// `FindUser`: por nombre de usuario. Sin fila → `USER_NOT_FOUND`.
pub fn find_by_username(conn: &Connection, username: &str) -> StoreResult<User> {
    let sql = format!("SELECT {USER_COLUMNS} FROM \"Users\" WHERE username = ?1");
    conn.query_row(&sql, params![username], row_to_user)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                StoreError::not_found("USER_NOT_FOUND", format!("usuario {username} no existe"))
            }
            other => other.into(),
        })
}

/// `FindUserByID`: por id. Sin fila → `USER_NOT_FOUND`.
pub fn find_by_id(conn: &Connection, id: i64) -> StoreResult<User> {
    let sql = format!("SELECT {USER_COLUMNS} FROM \"Users\" WHERE id = ?1");
    conn.query_row(&sql, params![id], row_to_user)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                StoreError::not_found("USER_NOT_FOUND", format!("usuario {id} no existe"))
            }
            other => other.into(),
        })
}

/// `ListUsers`: todas las cuentas por id.
pub fn list_all(conn: &Connection) -> StoreResult<Vec<User>> {
    let sql = "SELECT id, username, email, role, \"mustChangePassword\", \"loginAttempts\", \"lockedUntil\" \
         FROM \"Users\" ORDER BY id";
    // La lista del panel root no necesita todos los campos: se
    // reutiliza `User` con los sensibles vacíos.
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(User {
            id: row.get(0)?,
            username: row.get(1)?,
            email: row.get(2)?,
            token_version: 0,
            password_hash: String::new(),
            role: row.get(3)?,
            reset_token: None,
            reset_token_expiry: None,
            created_at: String::new(),
            updated_at: String::new(),
            must_change_password: row.get::<_, Option<i64>>(4)?.map(|v| v != 0),
            password_changed_at: None,
            login_attempts: row.get(5)?,
            locked_until: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Datos para crear una cuenta (semilla y panel root, fase 4).
pub struct NewUser<'a> {
    pub username: &'a str,
    pub email: Option<&'a str>,
    pub password_hash: &'a str,
    pub role: &'a str,
    pub must_change_password: bool,
    pub created_at: &'a str,
    pub updated_at: &'a str,
}

/// Inserta una cuenta y devuelve su id.
pub fn insert(tx: &Transaction, user: &NewUser<'_>) -> StoreResult<i64> {
    tx.execute(
        "INSERT INTO \"Users\"(username, email, password, role, \"mustChangePassword\", \"createdAt\", \"updatedAt\") \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            user.username,
            user.email,
            user.password_hash,
            user.role,
            user.must_change_password as i64,
            user.created_at,
            user.updated_at,
        ],
    )?;
    Ok(tx.last_insert_rowid())
}

/// `LoginSucceeded`: limpia intentos y bloqueo.
pub fn login_succeeded(tx: &Transaction, id: i64, now: &str) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"Users\" SET \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \"updatedAt\" = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    Ok(())
}

/// `LoginFailed`: registra el intento y el bloqueo, si lo hay.
pub fn login_failed(
    tx: &Transaction,
    id: i64,
    attempts: i64,
    locked_until: Option<&str>,
    now: &str,
) -> StoreResult<()> {
    tx.execute(
        "UPDATE \"Users\" SET \"loginAttempts\" = ?2, \"lockedUntil\" = ?3, \"updatedAt\" = ?4 WHERE id = ?1",
        params![id, attempts, locked_until, now],
    )?;
    Ok(())
}

/// `SaveResetToken`: guarda el token solo si el correo y la versión de
/// sesión coinciden. Devuelve las filas afectadas (0 = no coincide).
pub fn save_reset_token(
    tx: &Transaction,
    id: i64,
    token: &str,
    expiry: &str,
    email: &str,
    token_version: i64,
    now: &str,
) -> StoreResult<u64> {
    let rows = tx.execute(
        "UPDATE \"Users\" SET \"resetToken\" = ?2, \"resetTokenExpiry\" = ?3, \"updatedAt\" = ?6 \
         WHERE id = ?1 AND email = ?4 AND \"tokenVersion\" = ?5",
        params![id, token, expiry, email, token_version, now],
    )?;
    Ok(rows as u64)
}

/// `ConsumeResetToken`: aplica la nueva contraseña y consume el token
/// de un solo uso. Sin fila válida → `USER_NOT_FOUND`.
pub fn consume_reset_token(
    tx: &Transaction,
    token: &str,
    new_password_hash: &str,
    now: &str,
) -> StoreResult<User> {
    let sql = format!(
        "UPDATE \"Users\" SET password = ?2, \"resetToken\" = NULL, \"resetTokenExpiry\" = NULL, \
         \"mustChangePassword\" = 0, \"passwordChangedAt\" = ?3, \"tokenVersion\" = \"tokenVersion\" + 1, \
         \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \"updatedAt\" = ?3 \
         WHERE \"resetToken\" = ?1 AND \"resetTokenExpiry\" > ?3 \
         RETURNING {USER_COLUMNS}"
    );
    tx.query_row(&sql, params![token, new_password_hash, now], row_to_user)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                StoreError::not_found("USER_NOT_FOUND", "token de recuperación inválido o vencido")
            }
            other => other.into(),
        })
}

/// `ChangePassword`: cambia la contraseña propia y revoca sesiones
/// (sube `tokenVersion`). Devuelve las filas afectadas (0 = la
/// versión de sesión cambió entre tanto).
pub fn change_password(
    tx: &Transaction,
    id: i64,
    new_password_hash: &str,
    must_change_password: bool,
    token_version: i64,
    now: &str,
) -> StoreResult<u64> {
    let rows = tx.execute(
        "UPDATE \"Users\" SET password = ?2, \"mustChangePassword\" = ?3, \"passwordChangedAt\" = ?5, \
         \"tokenVersion\" = \"tokenVersion\" + 1, \"resetToken\" = NULL, \"resetTokenExpiry\" = NULL, \
         \"loginAttempts\" = 0, \"lockedUntil\" = NULL, \"updatedAt\" = ?5 \
         WHERE id = ?1 AND \"tokenVersion\" = ?4",
        params![
            id,
            new_password_hash,
            must_change_password as i64,
            token_version,
            now,
        ],
    )?;
    Ok(rows as u64)
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

    fn seed_user(conn: &mut Connection) -> i64 {
        let tx = conn.transaction().unwrap();
        let id = insert(
            &tx,
            &NewUser {
                username: "root",
                email: Some("root@example.test"),
                password_hash: "$2a$12$hashficticio",
                role: "root",
                must_change_password: true,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        tx.commit().unwrap();
        id
    }

    #[test]
    fn insert_and_find_roundtrip() {
        let mut conn = migrated();
        let id = seed_user(&mut conn);
        let user = find_by_username(&conn, "root").unwrap();
        assert_eq!(user.id, id);
        assert_eq!(user.role.as_deref(), Some("root"));
        assert_eq!(user.must_change_password, Some(true));
        assert_eq!(find_by_id(&conn, id).unwrap().username, "root");
        assert!(matches!(
            find_by_username(&conn, "nadie"),
            Err(StoreError::NotFound {
                code: "USER_NOT_FOUND",
                ..
            })
        ));
    }

    #[test]
    fn reset_token_flow() {
        let mut conn = migrated();
        let id = seed_user(&mut conn);
        let tx = conn.transaction().unwrap();
        let rows = save_reset_token(
            &tx,
            id,
            "tok123",
            "2026-11-10T00:15:00.000000Z",
            "root@example.test",
            0,
            NOW,
        )
        .unwrap();
        assert_eq!(rows, 1);
        // Con correo distinto no se guarda.
        let rows = save_reset_token(
            &tx,
            id,
            "tok999",
            "2026-11-10T00:15:00.000000Z",
            "otro@example.test",
            0,
            NOW,
        )
        .unwrap();
        assert_eq!(rows, 0);
        tx.commit().unwrap();

        let tx = conn.transaction().unwrap();
        let user = consume_reset_token(&tx, "tok123", "$2a$12$nuevohash", NOW).unwrap();
        assert_eq!(user.id, id);
        assert_eq!(user.token_version, 1);
        assert_eq!(user.must_change_password, Some(false));
        tx.commit().unwrap();

        // El token ya está consumido.
        let tx = conn.transaction().unwrap();
        let err = consume_reset_token(&tx, "tok123", "$2a$12$otro", NOW).unwrap_err();
        assert!(matches!(
            err,
            StoreError::NotFound {
                code: "USER_NOT_FOUND",
                ..
            }
        ));
        tx.rollback().unwrap();
    }

    #[test]
    fn change_password_requires_current_token_version() {
        let mut conn = migrated();
        let id = seed_user(&mut conn);
        let tx = conn.transaction().unwrap();
        let rows = change_password(&tx, id, "$2a$12$nuevo", false, 0, NOW).unwrap();
        assert_eq!(rows, 1);
        // La versión ya subió a 1: con 0 no cambia nada.
        let rows = change_password(&tx, id, "$2a$12$otro", false, 0, NOW).unwrap();
        assert_eq!(rows, 0);
        tx.commit().unwrap();
    }

    #[test]
    fn login_attempts_roundtrip() {
        let mut conn = migrated();
        let id = seed_user(&mut conn);
        let tx = conn.transaction().unwrap();
        login_failed(&tx, id, 3, Some("2026-11-10T01:00:00.000000Z"), NOW).unwrap();
        tx.commit().unwrap();
        let user = find_by_id(&conn, id).unwrap();
        assert_eq!(user.login_attempts, Some(3));
        assert_eq!(
            user.locked_until.as_deref(),
            Some("2026-11-10T01:00:00.000000Z")
        );
        let tx = conn.transaction().unwrap();
        login_succeeded(&tx, id, NOW).unwrap();
        tx.commit().unwrap();
        let user = find_by_id(&conn, id).unwrap();
        assert_eq!(user.login_attempts, Some(0));
        assert_eq!(user.locked_until, None);
    }
}
