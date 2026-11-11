//! Utilidades compartidas por los handlers de la fase 4.
//!
//! Traducción de los ayudantes de Go (`decode`, `validText`,
//! `validEmail`, `normalizeCedula`, `pagination`, `dateRange`,
//! `photo`, `validateSearch`, `csvText`) en
//! `server-go/internal/httpapi/*.go`:
//!
//! - JSON estricto: campos desconocidos rechazados, cuerpos múltiples
//!   rechazados, máximo total de 5 MiB (413 `PAYLOAD_TOO_LARGE`).
//! - Fechas en America/Caracas: la zona no tiene horario de verano
//!   desde 2016, así que es un desplazamiento fijo de UTC-4 y no hace
//!   falta otra dependencia de zonas horarias.
//! - Fotos: data-URI con base64 estricto, formato PNG/JPEG/WebP,
//!   decodificación completa y tope de 16 millones de píxeles.

use std::collections::HashMap;
use std::net::SocketAddr;

use axum::{
    extract::{ConnectInfo, FromRequest, FromRequestParts, Request},
    http::{header::CONTENT_LENGTH, request::Parts, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Duration as ChronoDuration, NaiveDate, TimeZone, Utc};
use http_body_util::{BodyExt, Limited};
use logmaster_crypto::{decrypt, normalize_identity, search_tokens, CryptoError};
use logmaster_store::error::StoreError;
use logmaster_store::models::Visitor;
use logmaster_store::repos::{audit::AuditEntry, Actor};
use logmaster_store::Repositories;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use crate::client_ip::{client_ip, TrustedPrefix};
use crate::error;
use crate::session::Session;

/// Máximo total de un cuerpo, como Go (`http.MaxBytesReader`, 5 MiB).
pub const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;

/// Parámetros de consulta: clave → valores repetidos, en orden.
pub type Params = HashMap<String, Vec<String>>;

/// Parsea la query de una URI en `Params`, con decodificación
/// porcentual y `+` como espacio. (El extractor `Query` de Axum no
/// sirve aquí: `serde_urlencoded` no deserializa
/// `HashMap<String, Vec<String>>` con un solo valor por clave, y Go
/// rechaza explícitamente `sortField` repetido, así que hacen falta
/// los valores repetidos.)
pub fn parse_query(uri: &axum::http::Uri) -> Params {
    let mut params: Params = HashMap::new();
    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (raw_key, raw_value) = match pair.split_once('=') {
                Some((key, value)) => (key, value),
                None => (pair, ""),
            };
            params
                .entry(percent_decode(raw_key))
                .or_default()
                .push(percent_decode(raw_value));
        }
    }
    params
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Primer valor de un parámetro de consulta.
pub fn param<'a>(params: &'a Params, key: &str) -> Option<&'a str> {
    params
        .get(key)
        .and_then(|values| values.first())
        .map(String::as_str)
}

/// Todos los valores de un parámetro de consulta.
pub fn param_all<'a>(params: &'a Params, key: &str) -> &'a [String] {
    params.get(key).map(Vec::as_slice).unwrap_or(&[])
}

/// Instante actual en el formato canónico de la base
/// (`%Y-%m-%dT%H:%M:%S%.6fZ`).
pub fn now_text() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string()
}

/// Instante actual.
pub fn now_dt() -> DateTime<Utc> {
    Utc::now()
}

/// Parsea un instante RFC 3339 (con `Z` o desplazamiento) o el formato
/// canónico de la base. `None` si no es válido.
pub fn parse_instant(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|| {
            DateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.6fZ")
                .ok()
                .map(|dt| dt.with_timezone(&Utc))
        })
}

/// Formatea un instante en el formato canónico de la base.
pub fn format_instant(value: DateTime<Utc>) -> String {
    value.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string()
}

/// Desplazamiento fijo de America/Caracas respecto a UTC (-4 h, sin
/// horario de verano desde 2016).
pub const CARACAS_OFFSET_SECS: i64 = -4 * 3600;

/// Fecha local (YYYY-MM-DD) de un instante en America/Caracas.
pub fn caracas_date(value: DateTime<Utc>) -> String {
    (value + ChronoDuration::seconds(CARACAS_OFFSET_SECS))
        .format("%Y-%m-%d")
        .to_string()
}

/// Instante en hora local de Caracas, como `DateTime<Utc>` desplazado
/// (solo para presentar: no se guarda así).
pub fn caracas_local(value: DateTime<Utc>) -> DateTime<Utc> {
    value + ChronoDuration::seconds(CARACAS_OFFSET_SECS)
}

/// Comienzo del día local de Caracas que contiene `value`, en UTC.
pub fn caracas_day_start(value: DateTime<Utc>) -> DateTime<Utc> {
    let local = caracas_local(value);
    let day = local.date_naive();
    Utc.from_utc_datetime(
        &day.and_hms_opt(0, 0, 0)
            .expect("medianoche válida")
            .checked_sub_signed(ChronoDuration::seconds(CARACAS_OFFSET_SECS))
            .expect("resta válida"),
    )
}

/// `validText` de Go: como máximo `max` runas y, si es obligatorio,
/// algo distinto de espacios.
pub fn valid_text(value: &str, max: usize, required: bool) -> bool {
    value.chars().count() <= max && (!required || !value.trim().is_empty())
}

/// `validEmail` de Go: dirección sin cabecera ni saltos de línea, con
/// un solo `@`, parte local y dominio no vacíos y como mucho 254
/// caracteres. (Go usa `mail.ParseAddress` y exige que la dirección
/// parseada sea igual al texto, lo que descarta nombres de muestra.)
pub fn valid_email(value: &str) -> bool {
    if value.is_empty()
        || value.len() > 254
        || value.contains(['\r', '\n'])
        || value.chars().any(char::is_whitespace)
    {
        return false;
    }
    let mut parts = value.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && domain.contains('.')
        && !domain.starts_with(['.', '-'])
        && !domain.ends_with(['.', '-'])
}

/// Cédula normalizada (`normalizeCedula` de Go): mayúsculas, sin
/// espacios, guion tras la primera letra, patrón `^[VEJPG]-?\d{6,9}$`.
pub fn normalize_cedula(value: &str) -> Result<String, ()> {
    let normalized = normalize_identity(value);
    let mut chars = normalized.chars();
    let first = chars.next().ok_or(())?;
    if !"VEJPG".contains(first) {
        return Err(());
    }
    let rest: String = chars.collect();
    let digits = rest.strip_prefix('-').unwrap_or(&rest);
    if !(6..=9).contains(&digits.len()) || !digits.chars().all(|c| c.is_ascii_digit()) {
        return Err(());
    }
    Ok(normalized)
}

/// Fallo 400 `VALIDATION_ERROR`, como `failure` de Go.
pub fn validation_error(message: &str) -> Response {
    error::fail(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message).into_response()
}

/// Fallo 413 `PAYLOAD_TOO_LARGE`, como `decode` de Go.
pub fn payload_too_large() -> Response {
    error::fail(
        StatusCode::PAYLOAD_TOO_LARGE,
        "PAYLOAD_TOO_LARGE",
        "La solicitud supera 5 MB",
    )
    .into_response()
}

/// Fallo 500 `SERVER_ERROR`, como `serverError` de Go.
pub fn server_error(message: &str) -> Response {
    tracing::error!("operation failed: {message}");
    error::fail(
        StatusCode::INTERNAL_SERVER_ERROR,
        "SERVER_ERROR",
        "No se pudo completar la operación",
    )
    .into_response()
}

/// Traduce un error de la capa de datos a su respuesta HTTP, con los
/// códigos del contrato: 404 para lo inexistente, 409 para los
/// conflictos de estado o unicidad y 500 para el resto.
pub fn store_fail(err: &StoreError) -> Response {
    match err {
        StoreError::NotFound { code, message } => {
            error::fail(StatusCode::NOT_FOUND, code, message).into_response()
        }
        StoreError::Conflict { code, message } => {
            error::fail(StatusCode::CONFLICT, code, message).into_response()
        }
        StoreError::Validation(message) => validation_error(message),
        StoreError::Db(_) | StoreError::Pg(_) | StoreError::Other(_) => {
            server_error(&err.to_string())
        }
    }
}

/// Trigramas de un perfil (`indexVisitor` de Go, `search.go`): los
/// de su nombre, apellido y cédula en claro. Un perfil anonimizado
/// queda sin tokens. El llamador los pasa a la operación compuesta
/// (`UnitOfWork::checkin` / `apply_profile_edit`), que los guarda en
/// la misma transacción que el perfil.
pub fn visitor_tokens(key: &[u8; 32], visitor: &Visitor) -> Result<Vec<Vec<u8>>, CryptoError> {
    if visitor.anonymized_at.is_some() {
        return Ok(Vec::new());
    }
    let first = decrypt(key, &visitor.first_name)?;
    let last = decrypt(key, &visitor.last_name)?;
    let cedula = decrypt(key, visitor.encrypted_cedula.as_deref().unwrap_or(""))?;
    Ok(search_tokens(key, &format!("{first} {last} {cedula}")))
}

/// `matchingVisitors` de Go (`queries.go`): perfiles con TODOS los
/// tokens de la búsqueda, verificados tras descifrar (nombre +
/// apellido + cédula contienen la búsqueda normalizada). La búsqueda
/// corta es 400 `SEARCH_TOO_SHORT`.
pub async fn matching_visitor_ids(
    repos: &Repositories,
    key: &[u8; 32],
    search: &str,
) -> Result<Vec<i64>, Box<Response>> {
    validate_search(search)?;
    let tokens = search_tokens(key, search);
    if tokens.is_empty() {
        return Ok(Vec::new());
    }
    let mut ids: Option<Vec<i64>> = None;
    for token in &tokens {
        let found = repos
            .search
            .find_visitors_by_token(token)
            .await
            .map_err(|e| Box::new(store_fail(&e)))?;
        ids = Some(match ids {
            None => found,
            Some(current) => current
                .into_iter()
                .filter(|id| found.contains(id))
                .collect(),
        });
    }
    let needle = search.trim().to_lowercase();
    let mut matched = Vec::new();
    for id in ids.unwrap_or_default() {
        let visitor = repos
            .visitors
            .find_by_id(id)
            .await
            .map_err(|e| Box::new(store_fail(&e)))?;
        if visitor.anonymized_at.is_some() {
            continue;
        }
        let plain = |value: Option<&str>| -> Result<String, Box<Response>> {
            decrypt(key, value.unwrap_or("")).map_err(|e| Box::new(server_error(&e.to_string())))
        };
        let first = plain(Some(&visitor.first_name))?;
        let last = plain(Some(&visitor.last_name))?;
        let cedula = plain(visitor.encrypted_cedula.as_deref())?;
        if format!("{first} {last} {cedula}")
            .to_lowercase()
            .contains(&needle)
        {
            matched.push(id);
        }
    }
    Ok(matched)
}

/// Parsea un cuerpo JSON ya leído: rechaza lo que supere 5 MiB y
/// cualquier JSON con basura después del valor (cuerpos múltiples).
/// Los DTO llevan `#[serde(deny_unknown_fields)]`, como el
/// `DisallowUnknownFields` de Go.
pub fn parse_json<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, Box<Response>> {
    if bytes.len() > MAX_BODY_BYTES {
        return Err(Box::new(payload_too_large()));
    }
    serde_json::from_slice(bytes)
        .map_err(|_| Box::new(validation_error("Datos de solicitud inválidos")))
}

/// Parsea un cuerpo JSON opcional: un cuerpo vacío equivale al valor
/// por defecto (las transiciones de visita de Go solo decodifican
/// cuando `ContentLength != 0`).
pub fn parse_json_or_default<T: DeserializeOwned + Default>(
    bytes: &[u8],
) -> Result<T, Box<Response>> {
    if bytes.iter().all(|b| b.is_ascii_whitespace()) {
        return Ok(T::default());
    }
    parse_json(bytes)
}

/// Extractor de JSON estricto para los handlers.
pub struct StrictJson<T>(pub T);

impl<T, S> FromRequest<S> for StrictJson<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request(req: Request, _state: &S) -> Result<Self, Self::Rejection> {
        let (parts, body) = req.into_parts();
        if let Some(len) = parts
            .headers
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
        {
            if len > MAX_BODY_BYTES {
                return Err(payload_too_large());
            }
        }
        let bytes = Limited::new(body, MAX_BODY_BYTES + 1)
            .collect()
            .await
            .map_err(|_| payload_too_large())?
            .to_bytes();
        parse_json(&bytes).map(StrictJson).map_err(|e| *e)
    }
}

/// Extractor de JSON opcional (cuerpo vacío = valor por defecto).
pub struct MaybeJson<T>(pub T);

impl<T, S> FromRequest<S> for MaybeJson<T>
where
    T: DeserializeOwned + Default,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request(req: Request, _state: &S) -> Result<Self, Self::Rejection> {
        let (parts, body) = req.into_parts();
        if let Some(len) = parts
            .headers
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
        {
            if len > MAX_BODY_BYTES {
                return Err(payload_too_large());
            }
        }
        let bytes = Limited::new(body, MAX_BODY_BYTES + 1)
            .collect()
            .await
            .map_err(|_| payload_too_large())?
            .to_bytes();
        parse_json_or_default(&bytes).map(MaybeJson).map_err(|e| *e)
    }
}

/// Paginación de Go (`pagination` en `visitors.go`): `page` 1..=1000000
/// y `limit` 1..=100, con 1 y 50 por defecto. `default_limit` sustituye
/// el 50 en las rutas que lo cambian (visitas filtradas: 10; ARCO: 20).
pub fn pagination(params: &Params, default_limit: i64) -> Result<(i64, i64), Box<Response>> {
    let mut page = 1i64;
    let mut limit = default_limit;
    if let Some(raw) = param(params, "page") {
        page = raw
            .parse()
            .map_err(|_| Box::new(validation_error("Página inválida")))?;
        if !(1..=1_000_000).contains(&page) {
            return Err(Box::new(validation_error("Página inválida")));
        }
    }
    if let Some(raw) = param(params, "limit") {
        limit = raw
            .parse()
            .map_err(|_| Box::new(validation_error("Límite inválido")))?;
        if !(1..=100).contains(&limit) {
            return Err(Box::new(validation_error("Límite inválido")));
        }
    }
    Ok((page, limit))
}

/// Rango de fechas (inicio, fin), ambos opcionales.
pub type DateRange = (Option<DateTime<Utc>>, Option<DateTime<Utc>>);

/// Rango de fechas de Go (`dateRange` en `audit.go`): fechas sueltas
/// `YYYY-MM-DD` en America/Caracas (la de fin suma un día) o instantes
/// RFC 3339 (el de fin suma un nanosegundo). Medio abierto, y el
/// inicio debe ser anterior al fin.
pub fn date_range(params: &Params) -> Result<DateRange, Box<Response>> {
    let mut start = None;
    let mut end = None;
    for (key, target, is_end) in [
        ("startDate", &mut start, false),
        ("endDate", &mut end, true),
    ] {
        let Some(raw) = param(params, key) else {
            continue;
        };
        let value = parse_date_or_instant(raw, is_end)
            .ok_or_else(|| Box::new(validation_error(&format!("fecha inválida: {key}"))))?;
        *target = Some(value);
    }
    if let (Some(start), Some(end)) = (start, end) {
        if start >= end {
            return Err(Box::new(validation_error("rango de fechas inválido")));
        }
    }
    Ok((start, end))
}

fn parse_date_or_instant(raw: &str, is_end: bool) -> Option<DateTime<Utc>> {
    if let Ok(date) = NaiveDate::parse_from_str(raw, "%Y-%m-%d") {
        let day_start = Utc
            .from_utc_datetime(&date.and_hms_opt(0, 0, 0)?)
            .checked_sub_signed(ChronoDuration::seconds(CARACAS_OFFSET_SECS))?;
        return Some(if is_end {
            day_start + ChronoDuration::days(1)
        } else {
            day_start
        });
    }
    let value = parse_instant(raw)?;
    Some(if is_end {
        value + ChronoDuration::nanoseconds(1)
    } else {
        value
    })
}

/// La búsqueda general exige al menos tres caracteres normalizados
/// (`validateSearch` en `search.go`).
pub fn validate_search(value: &str) -> Result<(), Box<Response>> {
    if !value.trim().is_empty() && value.trim().chars().count() < 3 {
        return Err(Box::new(
            error::fail(
                StatusCode::BAD_REQUEST,
                "SEARCH_TOO_SHORT",
                "Escribe al menos tres caracteres",
            )
            .into_response(),
        ));
    }
    Ok(())
}

/// Foto de Go (`photo` en `visitors.go`): data-URI `image/png`,
/// `image/jpeg` o `image/webp` con base64 estricto (re-codificar debe
/// dar lo mismo), binario de como mucho 5 MiB, decodificación completa
/// y como mucho 16 millones de píxeles.
pub fn decode_photo(value: &str) -> Result<Vec<u8>, ()> {
    let (head, data) = value.split_once(',').ok_or(())?;
    let mime = head
        .strip_prefix("data:")
        .and_then(|rest| rest.strip_suffix(";base64"))
        .ok_or(())?;
    if head != format!("data:{mime};base64")
        || !matches!(mime, "image/png" | "image/jpeg" | "image/webp")
    {
        return Err(());
    }
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD.decode(data).map_err(|_| ())?;
    if bytes.len() > MAX_BODY_BYTES || STANDARD.encode(&bytes) != data || bytes.is_empty() {
        return Err(());
    }
    let format = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| ())?
        .format()
        .ok_or(())?;
    let expected = match mime {
        "image/png" => image::ImageFormat::Png,
        "image/jpeg" => image::ImageFormat::Jpeg,
        "image/webp" => image::ImageFormat::WebP,
        _ => return Err(()),
    };
    if format != expected {
        return Err(());
    }
    let decoded = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| ())?
        .decode()
        .map_err(|_| ())?;
    let (width, height) = (u64::from(decoded.width()), u64::from(decoded.height()));
    if width < 1 || height < 1 || width * height > 16_000_000 {
        return Err(());
    }
    Ok(bytes)
}

/// Dirección remota de la petición, si el servicio se construyó con
/// `into_make_service_with_connect_info` (en producción sí; en las
/// pruebas con `oneshot`, no). Nunca rechaza: sin ella, `None`.
pub struct RemoteAddr(pub Option<SocketAddr>);

impl<S> FromRequestParts<S> for RemoteAddr
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(RemoteAddr(
            parts
                .extensions
                .get::<ConnectInfo<SocketAddr>>()
                .map(|info| info.0),
        ))
    }
}

/// IP del cliente para la auditoría, con los proxies de confianza.
pub fn client_ip_of(
    headers: &HeaderMap,
    remote: Option<SocketAddr>,
    trusted: &[TrustedPrefix],
) -> String {
    let remote = remote
        .map(|addr| addr.ip())
        .unwrap_or_else(|| "127.0.0.1".parse().expect("IP válida"));
    let forwarded = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok());
    client_ip(remote, forwarded, trusted).to_string()
}

/// Metadatos de auditoría de una petición, como `audit` de Go
/// (IP, agente de usuario truncado a 500 runas, rol, método y ruta).
pub struct AuditMeta {
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub role: Option<String>,
    pub method: Option<String>,
    pub path: Option<String>,
}

/// Ruta completa de la API para la auditoría.
///
/// Go registra `r.URL.Path` tal cual (`/api/v1/visits/1/checkout`),
/// pero la `Uri` de Axum dentro de `.nest("/api/v1", …)` llega sin el
/// prefijo del nido (`/visits/1/checkout`); auth ya pasa el literal
/// completo. Sin esto, la bitácora mezclaba rutas con y sin prefijo.
/// Las rutas que ya lo traen quedan intactas.
pub fn full_api_path(path: &str) -> String {
    if path.starts_with("/api/v1") {
        path.to_string()
    } else {
        format!("/api/v1{path}")
    }
}

pub fn audit_meta(
    headers: &HeaderMap,
    remote: Option<SocketAddr>,
    trusted: &[TrustedPrefix],
    session: &Session,
    method: &Method,
    path: &str,
) -> AuditMeta {
    let agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let agent: String = agent.chars().take(500).collect();
    AuditMeta {
        ip: Some(client_ip_of(headers, remote, trusted)),
        user_agent: if agent.is_empty() { None } else { Some(agent) },
        role: Some(session.role.clone()),
        method: Some(method.to_string()),
        path: Some(full_api_path(path)),
    }
}

/// Entrada de auditoría con los metadatos de la petición.
pub fn audit_entry<'a>(
    meta: &'a AuditMeta,
    session: &'a Session,
    action: &'a str,
    entity: &'a str,
    entity_id: &'a str,
    details: Option<&'a str>,
    created_at: &'a str,
) -> AuditEntry<'a> {
    AuditEntry {
        user_id: session.id,
        username: &session.username,
        action,
        entity,
        entity_id,
        details,
        ip_address: meta.ip.as_deref(),
        user_agent: meta.user_agent.as_deref(),
        created_at,
        role: meta.role.as_deref(),
        method: meta.method.as_deref(),
        path: meta.path.as_deref(),
    }
}

/// Actor de repositorio a partir de la sesión.
pub fn actor(session: &Session) -> Actor {
    Actor {
        id: session.id,
        username: session.username.clone(),
    }
}

/// `csvText` de Go: prefija con `'` los valores que, tras quitar
/// espacios, controles y BOM, empiezan por `=`, `+`, `-` o `@`
/// (inyección de fórmulas).
pub fn csv_text(value: &str) -> String {
    let leading: String = value
        .chars()
        .skip_while(|c| c.is_whitespace() || c.is_control() || *c == '\u{feff}')
        .collect();
    if let Some(first) = leading.chars().next() {
        if "=+-@".contains(first) {
            return format!("'{value}");
        }
    }
    value.to_string()
}

/// Una fila CSV con el entrecomillado de `encoding/csv` de Go.
pub fn csv_row(fields: &[String]) -> String {
    let mut out = String::new();
    for (i, field) in fields.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        if field.contains(['"', ',', '\n', '\r']) {
            out.push('"');
            out.push_str(&field.replace('"', "\"\""));
            out.push('"');
        } else {
            out.push_str(field);
        }
    }
    out.push('\n');
    out
}

/// Respuesta JSON con el sobre de éxito y campos extra al mismo nivel
/// que `data` (las visitas filtradas de Go añaden `meta`).
pub fn ok_with_extra(data: Value, extra: Value) -> Json<Value> {
    let mut map = serde_json::Map::new();
    map.insert("success".to_string(), json!(true));
    map.insert("data".to_string(), data);
    if let Value::Object(extra) = extra {
        for (key, value) in extra {
            map.insert(key, value);
        }
    }
    Json(Value::Object(map))
}

/// Identificador entero de ruta, como `idParam` de Go.
pub fn parse_id(raw: &str) -> Result<i64, Box<Response>> {
    let id: i64 = raw
        .parse()
        .map_err(|_| Box::new(validation_error("Identificador inválido")))?;
    if id < 1 {
        return Err(Box::new(validation_error("Identificador inválido")));
    }
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cedula_normalization_matches_go() {
        assert_eq!(normalize_cedula("v12345678").unwrap(), "V-12345678");
        assert_eq!(normalize_cedula("V-12345678").unwrap(), "V-12345678");
        assert_eq!(normalize_cedula("E123456789").unwrap(), "E-123456789");
        assert!(normalize_cedula("X-12345678").is_err());
        assert!(normalize_cedula("V-12345").is_err());
        assert!(normalize_cedula("V-1234567890").is_err());
        assert!(normalize_cedula("V-12345a78").is_err());
    }

    #[test]
    fn email_validation_matches_go_shape() {
        assert!(valid_email("ana@example.test"));
        assert!(!valid_email("ana@example"));
        assert!(!valid_email("ana example@test"));
        assert!(!valid_email("ana@@example.test"));
        assert!(!valid_email("@example.test"));
        assert!(!valid_email("ana@"));
        assert!(!valid_email("Nombre <ana@example.test>"));
    }

    #[test]
    fn audit_path_keeps_full_api_prefix() {
        // Fase 7: la Uri dentro del nido llega sin /api/v1; la
        // auditoría debe guardar la ruta completa, como Go.
        assert_eq!(
            full_api_path("/visits/1/checkout"),
            "/api/v1/visits/1/checkout"
        );
        assert_eq!(
            full_api_path("/privacy/arco-requests/1/status"),
            "/api/v1/privacy/arco-requests/1/status"
        );
        assert_eq!(full_api_path("/api/v1/auth/login"), "/api/v1/auth/login");
    }

    #[test]
    fn caracas_dates_are_utc_minus_four() {
        // Medianoche en Caracas es las 04:00 UTC.
        let utc = parse_instant("2026-11-10T04:00:00Z").unwrap();
        assert_eq!(caracas_date(utc), "2026-11-10");
        assert_eq!(caracas_date(utc - ChronoDuration::seconds(1)), "2026-11-09");
        // Rango por fechas sueltas: [10, 11) en Caracas.
        let params: Params = [
            ("startDate".to_string(), vec!["2026-11-10".to_string()]),
            ("endDate".to_string(), vec!["2026-11-10".to_string()]),
        ]
        .into_iter()
        .collect();
        let (start, end) = date_range(&params).unwrap();
        assert_eq!(
            start.map(format_instant).as_deref(),
            Some("2026-11-10T04:00:00.000000Z")
        );
        assert_eq!(
            end.map(format_instant).as_deref(),
            Some("2026-11-11T04:00:00.000000Z")
        );
    }

    #[test]
    fn pagination_bounds_match_go() {
        let params: Params = HashMap::new();
        assert_eq!(pagination(&params, 50).unwrap(), (1, 50));
        let params: Params = [("page".to_string(), vec!["0".to_string()])]
            .into_iter()
            .collect();
        assert!(pagination(&params, 50).is_err());
        let params: Params = [("limit".to_string(), vec!["101".to_string()])]
            .into_iter()
            .collect();
        assert!(pagination(&params, 50).is_err());
    }

    #[test]
    fn photo_validation_rejects_bad_inputs() {
        // PNG 1x1 válido.
        let png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        assert!(decode_photo(png).is_ok());
        // MIME que no coincide con el contenido.
        let wrong = png.replace("image/png", "image/jpeg");
        assert!(decode_photo(&wrong).is_err());
        // Sin prefijo data:.
        assert!(decode_photo("iVBORw0KGgo=").is_err());
        // Base64 no canónico.
        assert!(decode_photo("data:image/png;base64,!!!!").is_err());
    }

    #[test]
    fn csv_text_guards_formula_injection() {
        assert_eq!(csv_text("=1+1"), "'=1+1");
        assert_eq!(csv_text("  @cmd"), "'  @cmd");
        assert_eq!(csv_text("normal"), "normal");
        assert_eq!(
            csv_row(&["a,b".to_string(), "di \"x\"".to_string()]),
            "\"a,b\",\"di \"\"x\"\"\"\n"
        );
    }
}
