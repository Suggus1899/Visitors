//! Familia `reports` (4 rutas).
//!
//! Traducción de `server-go/internal/httpapi/reports.go`, con la
//! agregación (`aggregateReport`) fiel a Go, incluidas sus
//! peculiaridades: las filas agregadas traen la cédula vacía (el
//! conteo de titulares distintos del mensual se sobrescribe con la
//! consulta real) y `check_out_time` nulo (los minutos de las
//! completadas ya vienen sumados en la fila). Solo exige sesión
//! vigente; sin restricción de rol, como en Go.

use std::collections::{BTreeMap, HashMap, HashSet};

use axum::{
    extract::State,
    http::Uri,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use chrono::{DateTime, Datelike, TimeZone, Utc};
use logmaster_store::models::ReportRow;
use serde_json::{json, Map, Value};

use crate::common::{
    caracas_date, caracas_local, date_range, format_instant, parse_instant, parse_query,
    store_fail, validation_error, Params, CARACAS_OFFSET_SECS,
};
use crate::dto::visit_dtos;
use crate::error;
use crate::http::ApiState;

/// Rutas de la familia.
pub fn routes() -> Router<ApiState> {
    Router::new()
        .route("/reports/stats", get(visit_stats))
        .route("/reports/stats/monthly", get(monthly_report))
        .route("/reports/comparison", get(comparison))
        .route("/reports/alerts", get(alerts))
}

const DAY_NAMES: [&str; 7] = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
];
const MONTH_NAMES: [&str; 12] = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
];

/// `time.RFC3339Nano` de Go: fracciones sin ceros finales.
fn rfc3339_nano(value: DateTime<Utc>) -> String {
    let nanos = value.timestamp_subsec_nanos();
    if nanos == 0 {
        value.format("%Y-%m-%dT%H:%M:%SZ").to_string()
    } else {
        let mut fraction = format!("{nanos:09}");
        while fraction.ends_with('0') {
            fraction.pop();
        }
        format!("{}.{}Z", value.format("%Y-%m-%dT%H:%M:%S"), fraction)
    }
}

/// Grupos por motivo de Go (`reasonGroups`): por cantidad
/// descendente y nombre ascendente, con porcentaje redondeado
/// cuando el total es mayor que cero; `limit` 0 es sin límite.
fn reason_groups(counts: &HashMap<String, i64>, total: i64, limit: usize) -> Vec<Value> {
    let mut keys: Vec<&String> = counts.keys().collect();
    keys.sort_by(|a, b| counts[*b].cmp(&counts[*a]).then_with(|| a.cmp(b)));
    if limit > 0 && keys.len() > limit {
        keys.truncate(limit);
    }
    keys.iter()
        .map(|reason| {
            let mut item = Map::new();
            item.insert("purpose".to_string(), json!(reason));
            item.insert("count".to_string(), json!(counts[*reason]));
            if total > 0 {
                item.insert(
                    "percentage".to_string(),
                    json!((counts[*reason] as f64 * 100.0 / total as f64).round() as i64),
                );
            }
            Value::Object(item)
        })
        .collect()
}

/// Total de visitas de las filas agregadas (`reportCount` de Go).
fn report_count(rows: &[ReportRow]) -> i64 {
    rows.iter()
        .map(|row| if row.count == 0 { 1 } else { row.count })
        .sum()
}

/// Agregación de Go (`aggregateReport`). `monthly` cambia el
/// formato del periodo y de las semanas y añade los campos del
/// informe mensual.
fn aggregate(rows: &[ReportRow], start: DateTime<Utc>, end: DateTime<Utc>, monthly: bool) -> Value {
    let mut completed = 0i64;
    let mut active = 0i64;
    let mut cancelled = 0i64;
    let mut minutes = 0f64;
    let mut unique: HashSet<&str> = HashSet::new();
    let mut reasons: HashMap<String, i64> = HashMap::new();
    let mut days: BTreeMap<String, i64> = BTreeMap::new();
    let mut day_counts = [0i64; 7];
    let mut day_reasons: [HashMap<String, i64>; 7] = Default::default();
    let mut weeks: BTreeMap<String, i64> = BTreeMap::new();
    let mut week_reasons: HashMap<String, HashMap<String, i64>> = HashMap::new();
    for row in rows {
        let count = if row.count == 0 { 1 } else { row.count };
        if row.status == "completed" {
            completed += count;
            // La fila ya trae los minutos sumados de las
            // completadas; `check_out_time` es nulo en la consulta,
            // así que Go nunca añade el segundo término.
            minutes += row.minutes;
        }
        if row.status == "active" {
            active += count;
        }
        if row.status == "cancelled" {
            cancelled += count;
        } else {
            unique.insert(row.visitor_cedula.as_str());
        }
        let purpose = if row.purpose.is_empty() {
            "Sin especificar".to_string()
        } else {
            row.purpose.clone()
        };
        *reasons.entry(purpose.clone()).or_default() += count;
        let Some(raw) = row.check_in_time.as_deref() else {
            continue;
        };
        let Some(instant) = parse_instant(raw) else {
            continue;
        };
        let local = caracas_local(instant);
        let weekday = local.weekday().num_days_from_sunday() as usize;
        day_counts[weekday] += count;
        *day_reasons[weekday].entry(purpose.clone()).or_default() += count;
        *days.entry(caracas_date(instant)).or_default() += count;
        let day = local.date_naive();
        let week_start = day - chrono::Duration::days(weekday as i64);
        let week = if monthly {
            week_start.format("%Y-%m-%d").to_string()
        } else {
            // Medianoche de Caracas en UTC, formato RFC 3339.
            let utc = Utc
                .from_utc_datetime(&week_start.and_hms_opt(0, 0, 0).expect("medianoche válida"))
                .checked_sub_signed(chrono::Duration::seconds(CARACAS_OFFSET_SECS))
                .expect("resta válida");
            utc.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        };
        *weeks.entry(week.clone()).or_default() += count;
        *week_reasons
            .entry(week)
            .or_default()
            .entry(purpose)
            .or_default() += count;
    }
    let n = report_count(rows);
    let divisor = (((end - start).num_seconds() as f64 / 86_400.0).ceil() as i64).max(1);
    let mut summary = Map::new();
    summary.insert("totalVisits".to_string(), json!(n));
    summary.insert("completedVisits".to_string(), json!(completed));
    summary.insert("activeVisits".to_string(), json!(active));
    summary.insert("cancelledVisits".to_string(), json!(cancelled));
    summary.insert(
        "avgVisitsPerDay".to_string(),
        json!((n as f64 / divisor as f64 * 10.0).round() / 10.0),
    );
    let mut result = Map::new();
    if monthly {
        result.insert(
            "period".to_string(),
            json!({
                "month": start.month() as i64 - 1,
                "monthName": MONTH_NAMES[(start.month() - 1) as usize],
                "year": start.year(),
            }),
        );
        let duration = if completed > 0 {
            (minutes / completed as f64).round() as i64
        } else {
            0
        };
        let admission = n - cancelled;
        let rate = if admission > 0 {
            (completed as f64 * 100.0 / admission as f64).round() as i64
        } else {
            0
        };
        summary.insert("uniqueVisitors".to_string(), json!(unique.len()));
        summary.insert("averageDuration".to_string(), json!(duration));
        summary.insert("completionRate".to_string(), json!(rate));
    } else {
        result.insert(
            "period".to_string(),
            json!({"start": rfc3339_nano(start), "end": rfc3339_nano(end)}),
        );
    }
    result.insert("summary".to_string(), Value::Object(summary));
    result.insert("byReason".to_string(), json!(reason_groups(&reasons, n, 0)));
    let weekdays: Vec<Value> = (0..7)
        .map(|i| {
            let mut item = Map::new();
            item.insert("dayName".to_string(), json!(DAY_NAMES[i]));
            item.insert("count".to_string(), json!(day_counts[i]));
            if monthly {
                item.insert("day".to_string(), json!(i));
                item.insert(
                    "topReasons".to_string(),
                    json!(reason_groups(&day_reasons[i], 0, 3)),
                );
            }
            Value::Object(item)
        })
        .collect();
    result.insert("byDayOfWeek".to_string(), json!(weekdays));
    let by_week: Vec<Value> = weeks
        .iter()
        .map(|(week, count)| {
            let mut item = Map::new();
            item.insert("weekStart".to_string(), json!(week));
            item.insert("count".to_string(), json!(count));
            if monthly {
                item.insert(
                    "topReasons".to_string(),
                    json!(reason_groups(
                        &week_reasons.get(week).cloned().unwrap_or_default(),
                        0,
                        3
                    )),
                );
            }
            Value::Object(item)
        })
        .collect();
    result.insert("byWeek".to_string(), json!(by_week));
    if !monthly {
        let daily: Vec<Value> = days
            .iter()
            .map(|(date, count)| json!({"date": date, "count": count}))
            .collect();
        result.insert("recentActivity".to_string(), json!(daily));
        result.insert(
            "byStatus".to_string(),
            json!({"active": active, "completed": completed, "cancelled": cancelled}),
        );
    }
    Value::Object(result)
}

/// Rango mensual de Go (`monthRange`): mes 0–11 y año 1900–9998;
/// por defecto, el mes actual de Caracas.
fn month_range(params: &Params) -> Result<(DateTime<Utc>, DateTime<Utc>), Box<Response>> {
    let now = caracas_local(Utc::now());
    let mut month = now.month() as i64 - 1;
    let mut year = now.year() as i64;
    if let Some(raw) = crate::common::param(params, "month") {
        match raw.parse::<i64>() {
            Ok(value) if (0..=11).contains(&value) => month = value,
            _ => return Err(Box::new(validation_error("mes inválido (0–11)"))),
        }
    }
    if let Some(raw) = crate::common::param(params, "year") {
        match raw.parse::<i64>() {
            Ok(value) if (1900..=9998).contains(&value) => year = value,
            _ => return Err(Box::new(validation_error("año inválido"))),
        }
    }
    let day = chrono::NaiveDate::from_ymd_opt(year as i32, (month + 1) as u32, 1)
        .ok_or_else(|| Box::new(validation_error("mes inválido (0–11)")))?;
    let start = Utc
        .from_utc_datetime(&day.and_hms_opt(0, 0, 0).expect("medianoche válida"))
        .checked_sub_signed(chrono::Duration::seconds(CARACAS_OFFSET_SECS))
        .expect("resta válida");
    let end = if month == 11 {
        chrono::NaiveDate::from_ymd_opt((year + 1) as i32, 1, 1).expect("enero válido")
    } else {
        chrono::NaiveDate::from_ymd_opt(year as i32, (month + 2) as u32, 1)
            .expect("mes siguiente válido")
    };
    let end = Utc
        .from_utc_datetime(&end.and_hms_opt(0, 0, 0).expect("medianoche válida"))
        .checked_sub_signed(chrono::Duration::seconds(CARACAS_OFFSET_SECS))
        .expect("resta válida");
    Ok((start, end))
}

async fn visit_stats(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let (start, end) = match date_range(&params) {
        Ok(range) => range,
        Err(response) => return *response,
    };
    let now = Utc::now();
    let end = end.unwrap_or(now);
    let start = start.unwrap_or_else(|| end - chrono::Duration::days(30));
    if start >= end {
        return validation_error("Rango inválido");
    }
    let rows = match state
        .repos
        .visits
        .report_rows(&format_instant(start), &format_instant(end))
        .await
    {
        Ok(rows) => rows,
        Err(e) => return store_fail(&e),
    };
    let mut result = aggregate(&rows, start, end, false);
    // Go sobrescribe las activas con el conteo en vivo.
    let active = match state.repos.visits.count_active().await {
        Ok(active) => active,
        Err(e) => return store_fail(&e),
    };
    if let Some(summary) = result.get_mut("summary").and_then(Value::as_object_mut) {
        summary.insert("activeVisits".to_string(), json!(active));
    }
    if let Some(status) = result.get_mut("byStatus").and_then(Value::as_object_mut) {
        status.insert("active".to_string(), json!(active));
    }
    error::ok(result).into_response()
}

async fn monthly_report(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let (start, end) = match month_range(&params) {
        Ok(range) => range,
        Err(response) => return *response,
    };
    let rows = match state
        .repos
        .visits
        .report_rows(&format_instant(start), &format_instant(end))
        .await
    {
        Ok(rows) => rows,
        Err(e) => return store_fail(&e),
    };
    let mut result = aggregate(&rows, start, end, true);
    // El conteo real de titulares distintos (la agregación trae la
    // cédula vacía, como en Go).
    let unique = match state
        .repos
        .visits
        .count_distinct_visitors(&format_instant(start), &format_instant(end))
        .await
    {
        Ok(unique) => unique,
        Err(e) => return store_fail(&e),
    };
    if let Some(summary) = result.get_mut("summary").and_then(Value::as_object_mut) {
        summary.insert("uniqueVisitors".to_string(), json!(unique));
    }
    error::ok(result).into_response()
}

async fn comparison(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let (start, end) = match month_range(&params) {
        Ok(range) => range,
        Err(response) => return *response,
    };
    let current = match state
        .repos
        .visits
        .report_rows(&format_instant(start), &format_instant(end))
        .await
    {
        Ok(rows) => rows,
        Err(e) => return store_fail(&e),
    };
    // Mes anterior: mismo día 1 del mes anterior en Caracas.
    let local = caracas_local(start);
    let (prev_year, prev_month) = if local.month() == 1 {
        (local.year() - 1, 12)
    } else {
        (local.year(), local.month() - 1)
    };
    let prev_day =
        chrono::NaiveDate::from_ymd_opt(prev_year, prev_month, 1).expect("mes anterior válido");
    let last_start = Utc
        .from_utc_datetime(&prev_day.and_hms_opt(0, 0, 0).expect("medianoche válida"))
        .checked_sub_signed(chrono::Duration::seconds(CARACAS_OFFSET_SECS))
        .expect("resta válida");
    let last = match state
        .repos
        .visits
        .report_rows(&format_instant(last_start), &format_instant(start))
        .await
    {
        Ok(rows) => rows,
        Err(e) => return store_fail(&e),
    };
    let current_count = report_count(&current);
    let last_count = report_count(&last);
    let growth = if last_count > 0 {
        (current_count - last_count) as f64 * 100.0 / last_count as f64
    } else if current_count > 0 {
        100.0
    } else {
        0.0
    };
    let mut reasons = Map::new();
    for (key, rows) in [("current", &current), ("last", &last)] {
        let mut counts: HashMap<String, i64> = HashMap::new();
        for row in rows.iter() {
            let count = if row.count == 0 { 1 } else { row.count };
            *counts.entry(row.purpose.clone()).or_default() += count;
        }
        reasons.insert(key.to_string(), json!(reason_groups(&counts, 0, 0)));
    }
    error::ok(json!({
        "summary": {"currentMonth": current_count, "lastMonth": last_count, "growth": growth},
        "reasons": reasons,
    }))
    .into_response()
}

async fn alerts(State(state): State<ApiState>, uri: Uri) -> Response {
    let params = parse_query(&uri);
    let mut threshold = 8i64;
    if let Some(raw) = crate::common::param(&params, "threshold") {
        match raw.parse::<i64>() {
            Ok(value) if (1..=87600).contains(&value) => threshold = value,
            _ => return validation_error("Umbral inválido"),
        }
    }
    let before = Utc::now() - chrono::Duration::hours(threshold);
    let visits = match state
        .repos
        .visits
        .list_long_active(&format_instant(before))
        .await
    {
        Ok(visits) => visits,
        Err(e) => return store_fail(&e),
    };
    let items = match visit_dtos(&state.repos, &state.encryption_key, &visits).await {
        Ok(items) => items,
        Err(e) => return crate::common::server_error(&e.to_string()),
    };
    let mut counts: BTreeMap<String, i64> = BTreeMap::new();
    for visit in &visits {
        let Some(raw) = visit.check_in_time.as_deref() else {
            continue;
        };
        let Some(instant) = parse_instant(raw) else {
            continue;
        };
        *counts.entry(caracas_date(instant)).or_default() += 1;
    }
    let by_date: Vec<Value> = counts
        .iter()
        .map(|(date, count)| json!({"date": date, "count": count}))
        .collect();
    error::ok(json!({"total": visits.len(), "byDate": by_date, "visits": items})).into_response()
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
    const APP_ORIGIN: &str = "https://localhost:8443";

    fn test_config() -> Config {
        Config {
            bind: "127.0.0.1".to_string(),
            port: 8443,
            db_path: "data/logmaster.db".into(),
            database_engine: logmaster_store::DatabaseEngine::Sqlite,
            database_url: None,
            test_connection_on_startup: true,
            install_folder: r"C:\LogMaster".to_string(),
            desktop_shortcut: true,
            config_path: None,
            jwt_secret: "fixture-only-not-a-real-secret-fixture-only-not-a-real-secret-"
                .to_string(),
            refresh_secret: "fixture-refresh-secret-fixture-refresh-secret-fixture--".to_string(),
            encryption_key: [0x19u8; 32],
            edit_password: "fixture-edit-password".to_string(),
            access_ttl: std::time::Duration::from_secs(15 * 60),
            refresh_ttl: std::time::Duration::from_secs(7 * 24 * 3600),
            absolute_session_ttl: std::time::Duration::from_secs(7 * 24 * 3600),
            max_login_attempts: 5,
            lockout_minutes: 15,
            audit_retention_days: 365,
            retention_enabled: false,
            backup_path: None,
            rate_window_ms: 60_000,
            rate_max_requests: 100,
            app_url: APP_ORIGIN.to_string(),
            cors_origins: vec![],
            trusted_proxies: vec![],
        }
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
    ) -> (StatusCode, serde_json::Value) {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        let request = builder.body(Body::empty()).unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
        (status, value)
    }

    async fn request_body(
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

    async fn checkin(router: &Router, token: &str, cedula: &str, status: &str) -> i64 {
        let body = format!(
            r#"{{"visitorCedula":"{cedula}","purpose":"Reunión","personToVisit":"Anfitrión","targetDepartment":"Producción","hostPerson":"Jefe","status":"{status}","visitorData":{{"firstName":"Ana","lastName":"Pérez","company":"Trébol"}},"consent":{{"accepted":true,"policyVersion":"v1","acceptedAt":"2026-11-10T00:00:00Z"}}}}"#
        );
        let (status_code, value) = request_body(
            router.clone(),
            Method::POST,
            "/api/v1/visits/checkin",
            Some(token),
            Some(&body),
        )
        .await;
        assert_eq!(status_code, StatusCode::CREATED, "{value}");
        value["data"]["id"].as_i64().unwrap()
    }

    #[tokio::test]
    async fn reports_stats_monthly_comparison_and_alerts() {
        let (state, service) = test_state();
        let user_id = seed_user(&state, "operador-r", "operador").await;
        let token = token_for(&service, &state, user_id).await;
        let router = build_router_with_state(state.clone());
        let visit_id = checkin(&router, &token, "V-12345678", "waiting").await;

        // Sin sesión: 401.
        let (status, _) = request(router.clone(), Method::GET, "/api/v1/reports/stats", None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        // Estadísticas del rango por defecto (30 días).
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/reports/stats",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["summary"]["totalVisits"], 1);
        assert_eq!(body["data"]["summary"]["activeVisits"], 0);
        assert_eq!(body["data"]["byStatus"]["active"], 0);
        assert_eq!(body["data"]["byReason"][0]["purpose"], "Reunión");

        // Mensual del mes en curso (noviembre 2026): 1 visita.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/reports/stats/monthly?month=10&year=2026",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["summary"]["totalVisits"], 1);
        assert_eq!(body["data"]["period"]["month"], 10);
        assert_eq!(body["data"]["period"]["monthName"], "Noviembre");
        assert_eq!(body["data"]["summary"]["uniqueVisitors"], 1);

        // Mes inválido: 400.
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/reports/stats/monthly?month=12",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Comparativo: mes actual 1, anterior 0, crecimiento 100.
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/reports/comparison?month=10&year=2026",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["summary"]["currentMonth"], 1);
        assert_eq!(body["data"]["summary"]["lastMonth"], 0);
        assert_eq!(body["data"]["summary"]["growth"], 100.0);

        // Alertas: la visita en espera no cuenta (solo activas).
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/reports/alerts",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["total"], 0);

        // Umbral inválido: 400.
        let (status, _) = request(
            router.clone(),
            Method::GET,
            "/api/v1/reports/alerts?threshold=0",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Admitir la visita: las activas suben a 1 y la alerta la
        // ve como visita larga (el umbral de 8 h no aplica porque la
        // visita se registró hoy; con threshold=0 no es válido, así
        // que se comprueba solo el conteo de activas).
        let (status, body) = request_body(
            router.clone(),
            Method::POST,
            &format!("/api/v1/visits/{visit_id}/admit"),
            Some(&token),
            Some(r#"{}"#),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let (status, body) = request(
            router.clone(),
            Method::GET,
            "/api/v1/reports/stats",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["summary"]["activeVisits"], 1);
        assert_eq!(body["data"]["byStatus"]["active"], 1);
    }
}
