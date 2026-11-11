//! Familia `backups` (3 rutas).
//!
//! Traducción de `server-go/internal/httpapi/backups.go` y
//! `server-go/internal/backup/backup.go`. El listado lee el directorio
//! de respaldos (`backup.path` o `BACKUP_PATH`; lo crea con 0700 si
//! no existe, como Go) y devuelve solo los archivos cuyo nombre
//! coincide con `^backup-[A-Za-z0-9_-]+\.dump(\.enc)?$`, ordenados
//! por fecha de modificación descendente, con `name`, `date`
//! (RFC3339 UTC), `sizeBytes` y `path`.
//!
//! La creación y la restauración son reales desde la fase 6
//! (`crate::backup`, formato `logmaster-rust/1` con age): crear
//! devuelve `{filePath, restorePassword, message}` como Go (la
//! contraseña se muestra una sola vez) y audita `BACKUP_CREATED`;
//! restaurar en SQLite intercambia la base en vivo y audita
//! `BACKUP_RESTORE_COMPLETED` dentro de la copia; en PostgreSQL
//! devuelve 409 `RESTORE_TARGET_NOT_ALLOWED`, como Go fuera de
//! `logmaster_restore_test` (se restaura por CLI).

use axum::{
    extract::{Path, State},
    http::{HeaderMap, Method, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;

use crate::backup::BackupError;
use crate::common::{audit_entry, audit_meta, now_text, server_error, RemoteAddr, StrictJson};
use crate::error;
use crate::http::ApiState;
use crate::roles::{require_permission, Permission};
use crate::session::Session;

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    Router::new()
        .route("/backups", get(list_backups))
        .route("/backups", post(create_backup))
        .route("/backups/{filename}/restore", post(restore_backup))
        .layer(middleware::from_fn_with_state(
            Permission::ManageBackups,
            require_permission,
        ))
}

/// ¿El nombre es un respaldo válido?
/// `^backup-[A-Za-z0-9_-]+\.dump(\.enc)?$` (sin regex: la comprobación
/// manual rechaza además cualquier separador de ruta).
fn valid_backup_name(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("backup-") else {
        return false;
    };
    let stem = rest
        .strip_suffix(".dump.enc")
        .or_else(|| rest.strip_suffix(".dump"));
    let Some(stem) = stem else {
        return false;
    };
    !stem.is_empty()
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

async fn list_backups(State(state): State<ApiState>) -> Response {
    let Some(root) = state.backup_path.clone() else {
        return server_error("BACKUP_PATH required");
    };
    if let Err(e) = std::fs::create_dir_all(&root) {
        return server_error(&e.to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700));
    }
    let entries = match std::fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(e) => return server_error(&e.to_string()),
    };
    let mut files: Vec<(DateTime<Utc>, String, Value)> = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_backup_name(&name) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let date: DateTime<Utc> = modified.into();
        let path: PathBuf = root.join(&name);
        files.push((
            date,
            name.clone(),
            json!({
                "name": name,
                "date": date.to_rfc3339(),
                "sizeBytes": metadata.len(),
                "path": path.to_string_lossy(),
            }),
        ));
    }
    // Más reciente primero (como Go); desempate por nombre para que
    // el orden sea determinista cuando dos archivos comparten fecha.
    files.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let items: Vec<Value> = files.into_iter().map(|(_, _, item)| item).collect();
    error::ok(json!(items)).into_response()
}

/// Código y estado HTTP de un error de respaldo.
fn backup_fail(error: &BackupError) -> Response {
    match error {
        BackupError::NotFound(_) => {
            error::fail(StatusCode::NOT_FOUND, "NOT_FOUND", &error.to_string()).into_response()
        }
        BackupError::InvalidFilename(_) => error::fail(
            StatusCode::BAD_REQUEST,
            "INVALID_FILENAME",
            &error.to_string(),
        )
        .into_response(),
        BackupError::MissingPassword => error::fail(
            StatusCode::BAD_REQUEST,
            "MISSING_PASSWORD",
            "Contraseña de restauración requerida",
        )
        .into_response(),
        BackupError::InvalidPassword => error::fail(
            StatusCode::UNAUTHORIZED,
            "INVALID_PASSWORD",
            "Contraseña de restauración incorrecta",
        )
        .into_response(),
        BackupError::MissingMetadata(_) => {
            error::fail(StatusCode::CONFLICT, "MISSING_METADATA", &error.to_string())
                .into_response()
        }
        BackupError::InvalidManifest(_) | BackupError::VerificationFailed(_) => {
            error::fail(StatusCode::CONFLICT, "INVALID_BACKUP", &error.to_string()).into_response()
        }
        BackupError::BackupInProgress => error::fail(
            StatusCode::CONFLICT,
            "BACKUP_IN_PROGRESS",
            "Ya hay un respaldo en curso",
        )
        .into_response(),
        BackupError::WrongEngine(_) => error::fail(
            StatusCode::CONFLICT,
            "RESTORE_TARGET_NOT_ALLOWED",
            &error.to_string(),
        )
        .into_response(),
        BackupError::Other(_) => server_error(&error.to_string()),
    }
}

async fn create_backup(
    State(state): State<ApiState>,
    session: Session,
    headers: HeaderMap,
    remote: RemoteAddr,
) -> Response {
    let Some(backup) = state.backup.clone() else {
        return server_error("BACKUP_PATH required");
    };
    let created = match backup.create(&state.db, false).await {
        Ok(created) => created,
        Err(e) => return backup_fail(&e),
    };
    let now = now_text();
    let meta = audit_meta(
        &headers,
        remote.0,
        &state.trusted_proxies,
        &session,
        &Method::POST,
        "/api/v1/backups",
    );
    let entry = audit_entry(
        &meta,
        &session,
        "BACKUP_CREATED",
        "Backup",
        &created.name,
        None,
        &now,
    );
    if let Err(e) = state.repos.audit.write(&entry).await {
        return error::fail(
            StatusCode::INTERNAL_SERVER_ERROR,
            "SERVER_ERROR",
            &e.to_string(),
        )
        .into_response();
    }
    error::ok(json!({
        "filePath": backup.backup_path.join(&created.name).to_string_lossy(),
        "restorePassword": created.restore_password,
        "message": "Guarde la contraseña de restauración; se muestra una sola vez",
    }))
    .into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RestoreBody {
    #[serde(default)]
    restore_password: String,
}

async fn restore_backup(
    State(state): State<ApiState>,
    Path(raw): Path<String>,
    StrictJson(body): StrictJson<RestoreBody>,
) -> Response {
    if body.restore_password.is_empty() || body.restore_password.len() > 200 {
        return error::fail(
            StatusCode::BAD_REQUEST,
            "MISSING_PASSWORD",
            "Contraseña de restauración requerida",
        )
        .into_response();
    }
    if !valid_backup_name(&raw) {
        return error::fail(
            StatusCode::BAD_REQUEST,
            "INVALID_FILENAME",
            "Nombre de respaldo inválido",
        )
        .into_response();
    }
    let Some(backup) = state.backup.clone() else {
        return server_error("BACKUP_PATH required");
    };
    // PostgreSQL no se restaura por HTTP, como Go fuera de
    // `logmaster_restore_test`: se hace por CLI.
    if !matches!(state.db, logmaster_store::Database::Sqlite(_)) {
        return error::fail(
            StatusCode::CONFLICT,
            "RESTORE_TARGET_NOT_ALLOWED",
            "La restauración de PostgreSQL se hace por CLI con el servicio detenido",
        )
        .into_response();
    }
    let prepared = match backup.prepare(&raw, &body.restore_password) {
        Ok(prepared) => prepared,
        Err(e) => return backup_fail(&e),
    };
    // La finalización (bump de sesiones + BACKUP_RESTORE_COMPLETED)
    // ya quedó escrita dentro de la copia antes del intercambio.
    if let Err(e) = backup.restore_sqlite_live(&state.db, &prepared, &now_text()) {
        return backup_fail(&e);
    }
    error::ok(json!({
        "message": "Respaldo restaurado",
        "filename": raw,
    }))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request},
        Router,
    };
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use tower::ServiceExt;

    use crate::config::Config;
    use crate::http::{build_router_with_state, ApiState};
    use crate::session::{Session, SessionService};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config::fixture()
    }

    fn test_state(
        dir: &std::path::Path,
        backup_path: Option<PathBuf>,
    ) -> (ApiState, SessionService) {
        let store = logmaster_store::Store::open(&dir.join("live.db")).unwrap();
        store.migrate().unwrap();
        let mut config = test_config();
        config.backup_path = backup_path;
        let state = ApiState::new(logmaster_store::Database::Sqlite(store), &config);
        let service = state.session.clone();
        (state, service)
    }

    async fn seed_user(state: &ApiState, username: &str, role: &str) -> i64 {
        let hash = hash_password("Private!Safe12Á").unwrap();
        state
            .repos
            .users
            .insert(&NewUser {
                username,
                email: Some("u@example.test"),
                password_hash: &hash,
                role,
                must_change_password: false,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap()
    }

    async fn token_for(service: &SessionService, state: &ApiState, user_id: i64) -> String {
        let user = state.repos.users.find_by_id(user_id).await.unwrap();
        service
            .issue(&Session::from_user(&user))
            .unwrap()
            .access_token
    }

    async fn request(
        router: Router,
        method: Method,
        uri: &str,
        token: Option<&str>,
        body: Option<&str>,
    ) -> (StatusCode, serde_json::Value) {
        let mut builder = Request::builder().method(method.clone()).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        if !matches!(method, Method::GET | Method::HEAD) {
            builder = builder.header("origin", APP_ORIGIN);
        }
        if body.is_some() {
            builder = builder.header("content-type", "application/json");
        }
        let request = builder
            .body(Body::from(body.unwrap_or_default().to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, value)
    }

    #[tokio::test]
    async fn backups_list_create_restore() {
        // Directorio temporal propio (sin dependencia `tempfile`).
        let dir =
            std::env::temp_dir().join(format!("logmaster-backups-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let backups_dir = dir.join("backups");
        std::fs::create_dir_all(&backups_dir).unwrap();
        // Un respaldo válido, uno cifrado y basura que debe ignorarse.
        std::fs::write(backups_dir.join("backup-20261110-01.dump"), b"fake").unwrap();
        std::fs::write(backups_dir.join("backup-20261110-02.dump.enc"), b"fake-enc").unwrap();
        std::fs::write(backups_dir.join("notas.txt"), b"ignorar").unwrap();
        let (state, service) = test_state(&dir, Some(backups_dir.clone()));
        let admin_id = seed_user(&state, "admin-b", "admin").await;
        let root_id = seed_user(&state, "root-b", "root").await;
        let admin = token_for(&service, &state, admin_id).await;
        let root = token_for(&service, &state, root_id).await;
        let router = build_router_with_state(state.clone());

        // Sin sesión: 401.
        let (status, _) = request(router.clone(), Method::GET, "/api/v1/backups", None, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        // Listar: 2 archivos, el más reciente primero.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/backups",
            Some(&admin),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let items = body["data"].as_array().unwrap();
        assert_eq!(items.len(), 2);
        assert!(items.iter().all(|item| item["name"]
            .as_str()
            .is_some_and(|name| name.starts_with("backup-"))));
        assert!(items
            .iter()
            .all(|item| item["sizeBytes"].as_i64() == Some(4)
                || item["sizeBytes"].as_i64() == Some(8)));

        // Crear: 201 con la contraseña una sola vez (fase 6).
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/backups",
            Some(&root),
            Some("{}"),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let password = body["data"]["restorePassword"].as_str().unwrap();
        assert_eq!(password.len(), 64);
        let created_name = body["data"]["filePath"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .to_string();
        assert!(created_name.ends_with(".dump.enc"));
        assert_eq!(
            body["data"]["message"].as_str().unwrap(),
            "Guarde la contraseña de restauración; se muestra una sola vez"
        );
        // La auditoría BACKUP_CREATED quedó escrita.
        let created_audit = match &state.db {
            logmaster_store::Database::Sqlite(store) => store.read(|conn| {
                Ok(conn.query_row(
                    "SELECT COUNT(*) FROM \"ActivityLogs\" WHERE action = 'BACKUP_CREATED'",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            }),
            _ => unreachable!(),
        };
        assert_eq!(created_audit.unwrap(), 1);

        // Listar ahora trae 3 archivos.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/backups",
            Some(&admin),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"].as_array().unwrap().len(), 3);

        // Restaurar sin contraseña: 400 MISSING_PASSWORD.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/backups/{created_name}/restore"),
            Some(&root),
            Some("{}"),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "MISSING_PASSWORD");

        // Restaurar con nombre inválido: 400 INVALID_FILENAME.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/backups/notas.txt/restore",
            Some(&root),
            Some(r#"{"restorePassword":"secreta"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "INVALID_FILENAME");

        // Restaurar una copia inexistente: 404 NOT_FOUND.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/backups/backup-2026-01-01T00-00-00-abcdefabcdef.dump.enc/restore",
            Some(&root),
            Some(r#"{"restorePassword":"secreta"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "NOT_FOUND");

        // Restaurar un archivo sin manifiesto: 409 MISSING_METADATA.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            "/api/v1/backups/backup-20261110-02.dump.enc/restore",
            Some(&root),
            Some(r#"{"restorePassword":"secreta"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"]["code"], "MISSING_METADATA");

        // Restaurar con contraseña incorrecta: 401 INVALID_PASSWORD.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/backups/{created_name}/restore"),
            Some(&root),
            Some(r#"{"restorePassword":"contraseña-incorrecta"}"#),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"]["code"], "INVALID_PASSWORD");

        // Restaurar con la contraseña correcta: 200, y la base viva
        // queda con tokenVersion 1 y la auditoría de restauración.
        let (status, body) = request(
            router.clone(),
            Method::POST,
            &format!("/api/v1/backups/{created_name}/restore"),
            Some(&root),
            Some(&format!(r#"{{"restorePassword":"{password}"}}"#)),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["message"], "Respaldo restaurado");
        let token_version = match &state.db {
            logmaster_store::Database::Sqlite(store) => store.read(|conn| {
                Ok(conn.query_row(
                    "SELECT \"tokenVersion\" FROM \"Users\" WHERE username = 'root-b'",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            }),
            _ => unreachable!(),
        };
        assert_eq!(token_version.unwrap(), 1);
        let restored_audit = match &state.db {
            logmaster_store::Database::Sqlite(store) => store.read(|conn| {
                Ok(conn.query_row(
                    "SELECT COUNT(*) FROM \"ActivityLogs\" WHERE action = 'BACKUP_RESTORE_COMPLETED'",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            }),
            _ => unreachable!(),
        };
        assert_eq!(restored_audit.unwrap(), 1);

        // El operador no puede listar respaldos: 403.
        let operator_id = seed_user(&state, "operador-b", "operador").await;
        let operator = token_for(&service, &state, operator_id).await;
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/backups",
            Some(&operator),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn backups_without_path_is_server_error() {
        let dir =
            std::env::temp_dir().join(format!("logmaster-backups-test-np-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let (state, service) = test_state(&dir, None);
        let root_id = seed_user(&state, "root-c", "root").await;
        let root = token_for(&service, &state, root_id).await;
        let router = build_router_with_state(state.clone());
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/backups",
            Some(&root),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["error"]["code"], "SERVER_ERROR");
        let (status, body) = request(
            router,
            Method::POST,
            "/api/v1/backups",
            Some(&root),
            Some("{}"),
        )
        .await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["error"]["code"], "SERVER_ERROR");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
