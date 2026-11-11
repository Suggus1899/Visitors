//! Familia `audit` (6 rutas + variante root de bitácora).
//!
//! Traducción de `server-go/internal/httpapi/audit.go`:
//!
//! - Bitácora con filtros (fechas de Caracas, acción, usuario,
//!   entidad, IP, búsqueda y `userId`), paginación con `meta` y
//!   variante root con `offset` y límite 100 por defecto.
//! - Estadísticas de hoy (Caracas) y de los últimos 7 días.
//! - Exportación CSV con BOM, cabecera fija y protección contra
//!   inyección de fórmulas (`csv_text`).
//! - Valores distintos de acción y usuario, y configuración de
//!   retención (la ejecución es el programador interno de fase 6 y
//!   el comando `retention`).
//! - Lectura de auditoría: admin, root o auditor (`ReadAudit`); la
//!   variante del panel root solo root (`ManageAccounts`).

use axum::{
    body::Body,
    extract::State,
    http::{header, Uri},
    middleware,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use chrono::Utc;
use logmaster_store::repos::audit::AuditFilter;
use serde_json::json;

use crate::common::{
    caracas_day_start, caracas_local, csv_row, csv_text, date_range, format_instant, pagination,
    param, parse_instant, parse_query, store_fail, validation_error, Params,
};
use crate::dto::activity_log_json;
use crate::error;
use crate::http::ApiState;
use crate::roles::{require_permission, Permission};

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    let audit = Router::new()
        .route("/audit/logs", get(audit_logs))
        .route("/audit/stats", get(audit_stats))
        .route("/audit/export", get(audit_csv))
        .route("/audit/actions", get(audit_actions))
        .route("/audit/users", get(audit_users))
        .route("/audit/config", get(audit_config))
        .layer(middleware::from_fn_with_state(
            Permission::ReadAudit,
            require_permission,
        ));
    let root = Router::new()
        .route("/superadmin/audit-logs", get(superadmin_audit_logs))
        .layer(middleware::from_fn_with_state(
            Permission::ManageAccounts,
            require_permission,
        ));
    Router::new().merge(audit).merge(root)
}

/// Filtro de auditoría de Go (`auditFilter` en `audit.go`): fechas
/// medio abiertas, campos con límite de 500 y `userId` >= 1. Los
/// valores son propios; el handler construye `AuditFilter` con ellos.
struct AuditQuery {
    start: Option<String>,
    end: Option<String>,
    action: Option<String>,
    username: Option<String>,
    entity: Option<String>,
    ip: Option<String>,
    search: Option<String>,
    user_id: Option<i64>,
}

impl AuditQuery {
    fn filter(&self) -> AuditFilter<'_> {
        AuditFilter {
            start: self.start.as_deref(),
            end: self.end.as_deref(),
            action: self.action.as_deref(),
            username: self.username.as_deref(),
            entity: self.entity.as_deref(),
            ip: self.ip.as_deref(),
            search: self.search.as_deref(),
            user_id: self.user_id,
        }
    }
}

fn audit_query(params: &Params) -> Result<AuditQuery, Box<Response>> {
    let (start, end) = date_range(params)?;
    for key in ["action", "username", "entity", "ip"] {
        if param(params, key).is_some_and(|value| value.len() > 500) {
            return Err(Box::new(validation_error("filtro demasiado largo")));
        }
    }
    if param(params, "search").is_some_and(|value| value.len() > 500) {
        return Err(Box::new(validation_error("búsqueda demasiado larga")));
    }
    let user_id = match param(params, "userId") {
        Some(raw) => {
            let id: i64 = match raw.parse() {
                Ok(id) if id >= 1 => id,
                _ => return Err(Box::new(validation_error("usuario inválido"))),
            };
            Some(id)
        }
        None => None,
    };
    Ok(AuditQuery {
        start: start.map(format_instant),
        end: end.map(format_instant),
        action: param(params, "action").map(str::to_string),
        username: param(params, "username").map(str::to_string),
        entity: param(params, "entity").map(str::to_string),
        ip: param(params, "ip").map(str::to_string),
        search: param(params, "search").map(str::to_string),
        user_id,
    })
}

/// Fecha de bitácora en RFC 3339 de Caracas, como Go
/// (`v.CreatedAt.Time.In(caracas).Format(time.RFC3339)`).
fn csv_date(raw: Option<&str>) -> String {
    let Some(raw) = raw else {
        return String::new();
    };
    match parse_instant(raw) {
        Some(instant) => caracas_local(instant)
            .format("%Y-%m-%dT%H:%M:%S-04:00")
            .to_string(),
        None => raw.to_string(),
    }
}

async fn logs_response(state: &ApiState, uri: &Uri, root: bool) -> Response {
    let params = parse_query(uri);
    let (page, mut limit) = match pagination(&params, 50) {
        Ok(values) => values,
        Err(response) => return *response,
    };
    let mut offset = (page - 1) * limit;
    if root {
        if param(&params, "limit").is_none() {
            limit = 100;
        }
        if let Some(raw) = param(&params, "offset") {
            match raw.parse::<i64>() {
                Ok(n) if (0..=100_000_000).contains(&n) => offset = n,
                _ => return validation_error("Desplazamiento inválido"),
            }
        }
    }
    let query = match audit_query(&params) {
        Ok(query) => query,
        Err(response) => return *response,
    };
    let filter = query.filter();
    let total = match state.repos.audit.count_filtered(&filter).await {
        Ok(total) => total,
        Err(e) => return store_fail(&e),
    };
    let logs = match state
        .repos
        .audit
        .list_filtered(&filter, limit, offset)
        .await
    {
        Ok(logs) => logs,
        Err(e) => return store_fail(&e),
    };
    let items: Vec<_> = logs.iter().map(activity_log_json).collect();
    if root {
        error::ok(json!({"logs": items, "total": total, "limit": limit, "offset": offset}))
            .into_response()
    } else {
        let pages = (total + limit - 1) / limit;
        error::ok(
            json!({"logs": items, "pagination": {"page": page, "limit": limit, "total": total, "pages": pages}}),
        )
        .into_response()
    }
}

async fn audit_logs(State(state): State<ApiState>, uri: Uri) -> Response {
    logs_response(&state, &uri, false).await
}

async fn superadmin_audit_logs(State(state): State<ApiState>, uri: Uri) -> Response {
    logs_response(&state, &uri, true).await
}

async fn audit_stats(State(state): State<ApiState>) -> Response {
    let now = Utc::now();
    let today = caracas_day_start(now);
    let week = today - chrono::Duration::days(7);
    let tomorrow = today + chrono::Duration::days(1);
    let (logins, actions, users, ips) = match state
        .repos
        .audit
        .today_counts(&format_instant(today), &format_instant(tomorrow))
        .await
    {
        Ok(counts) => counts,
        Err(e) => return store_fail(&e),
    };
    let week_text = format_instant(week);
    let mut last = serde_json::Map::new();
    for (key, label, group) in [
        ("actionsByType", "action", "action"),
        ("topUsers", "username", "username"),
        ("dailyActivity", "date", "date"),
    ] {
        let rows = match state.repos.audit.group_counts(&week_text, group).await {
            Ok(rows) => rows,
            Err(e) => return store_fail(&e),
        };
        let items: Vec<_> = rows
            .iter()
            .map(|(value, count)| json!({label: value, "count": count}))
            .collect();
        last.insert(key.to_string(), json!(items));
    }
    error::ok(json!({
        "today": {"logins": logins, "actions": actions, "uniqueUsers": users, "uniqueIPs": ips},
        "lastWeek": last,
    }))
    .into_response()
}

async fn audit_csv(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let query = match audit_query(&params) {
        Ok(query) => query,
        Err(response) => return *response,
    };
    let filter = query.filter();
    let logs = match state.repos.audit.list_filtered(&filter, i64::MAX, 0).await {
        Ok(logs) => logs,
        Err(e) => return store_fail(&e),
    };
    let mut body = vec![0xef, 0xbb, 0xbf];
    body.extend_from_slice(
        csv_row(
            &[
                "ID",
                "Fecha",
                "Usuario",
                "Acción",
                "Entidad",
                "ID Entidad",
                "Detalles",
                "IP",
                "User Agent",
            ]
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>(),
        )
        .as_bytes(),
    );
    for log in &logs {
        let record = [
            log.id.to_string(),
            csv_date(log.created_at.as_deref()),
            log.username.clone(),
            log.action.clone(),
            log.entity.clone(),
            log.entity_id.clone(),
            log.details.clone().unwrap_or_default(),
            log.ip_address.clone().unwrap_or_default(),
            log.user_agent.clone().unwrap_or_default(),
        ]
        .iter()
        .map(|value| csv_text(value))
        .collect::<Vec<_>>();
        body.extend_from_slice(csv_row(&record).as_bytes());
    }
    let mut response = Response::new(Body::from(body));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        "text/csv; charset=utf-8".parse().expect("tipo válido"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        "attachment; filename=\"auditoria.csv\""
            .parse()
            .expect("directiva válida"),
    );
    response
}

async fn audit_distinct(state: &ApiState, column: &str) -> Response {
    match state.repos.audit.distinct(column).await {
        Ok(values) => error::ok(json!(values)).into_response(),
        Err(e) => store_fail(&e),
    }
}

async fn audit_actions(State(state): State<ApiState>) -> Response {
    audit_distinct(&state, "action").await
}

async fn audit_users(State(state): State<ApiState>) -> Response {
    audit_distinct(&state, "username").await
}

async fn audit_config(State(state): State<ApiState>) -> Response {
    let days = state.audit_retention_days;
    error::ok(json!({
        "retentionDays": days,
        "enabled": state.retention_enabled,
        "policy": format!("Retención configurada: {days} días. La ejecución requiere habilitación explícita."),
    }))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
        Router,
    };
    use logmaster_crypto::hash_password;
    use logmaster_store::repos::users::NewUser;
    use tower::ServiceExt;

    use crate::config::Config;
    use crate::http::build_router_with_state;
    use crate::session::{Session, SessionService};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";

    fn test_config() -> Config {
        Config::fixture()
    }

    fn test_state() -> (ApiState, SessionService) {
        let store = logmaster_store::Store::open(":memory:".as_ref()).unwrap();
        store.migrate().unwrap();
        let state = ApiState::new(logmaster_store::Database::Sqlite(store), &test_config());
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
                email: Some("usuario@example.test"),
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
    ) -> (StatusCode, serde_json::Value, Vec<(String, String)>) {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        let request = builder.body(Body::empty()).unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let headers: Vec<(String, String)> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, value, headers)
    }

    #[tokio::test]
    async fn audit_logs_stats_config_and_csv() {
        let (state, service) = test_state();
        let root_id = seed_user(&state, "root-a", "root").await;
        let auditor_id = seed_user(&state, "auditor-a", "auditor").await;
        let operator_id = seed_user(&state, "operador-a", "operador").await;
        let root = token_for(&service, &state, root_id).await;
        let auditor = token_for(&service, &state, auditor_id).await;
        let operator = token_for(&service, &state, operator_id).await;
        let router = build_router_with_state(state.clone());

        // Operador no lee auditoría: 403.
        let (status, _, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/logs",
            Some(&operator),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        // Sin sesión: 401.
        let (status, _, _) = request(router.clone(), Method::GET, "/api/v1/audit/logs", None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        // El auditor ve la bitácora con paginación.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/logs",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(body["data"]["pagination"]["total"].as_i64().unwrap() >= 0);

        // Filtro por acción y rango con fecha inválida: 400.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/logs?action=LOGIN",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let (status, _, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/logs?startDate=no-fecha",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Estadísticas y configuración.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/stats",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(body["data"]["today"]["actions"].is_number());
        assert!(body["data"]["lastWeek"]["actionsByType"].is_array());
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/config",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["retentionDays"], 365);
        assert_eq!(body["data"]["enabled"], false);

        // Acciones distintas y CSV con BOM y cabecera.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/actions",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(body["data"].is_array());
        let (status, _, headers) = request(
            router.clone(),
            Method::GET,
            "/api/v1/audit/export",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let disposition = headers
            .iter()
            .find(|(k, _)| k == "content-disposition")
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        assert!(disposition.contains("auditoria.csv"), "{disposition}");

        // Variante root con offset y límite 100 por defecto.
        let (status, body, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/superadmin/audit-logs?offset=0",
            Some(&root),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["limit"], 100);
        assert_eq!(body["data"]["offset"], 0);
        let (status, _, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/superadmin/audit-logs",
            Some(&auditor),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
