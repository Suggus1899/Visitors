// API de la fase 3 para los handlers de la fase 4 (rutas /auth/* y de
// dominio): hasta que lleguen, el binario no consume estas piezas y
// rustc las marcaria como muertas. Se retira este allow al cablear
// cada pieza en la fase 4.
#![allow(dead_code)]

//! Limite de peticiones en memoria.
//!
//! Traduccion de `App.limit` y `App.allowRequest` de Go
//! (`server-go/internal/httpapi/app.go`):
//!
//! - General: `api:<ip>`, `RATE_LIMIT_MAX_REQUESTS` (100) por
//!   `RATE_LIMIT_WINDOW_MS` (60000 ms).
//! - Autenticacion: `auth:<ip>`, 500 por 15 minutos, para
//!   `/api/v1/auth/login`, `/auth/forgot-password` y
//!   `/auth/reset-password`.
//! - Por cuenta: `account:<ip>:<usuario>`, 20 por 15 minutos; Go lo
//!   comprueba dentro del handler de login (necesita el cuerpo), asi
//!   que aqui se expone `check_account` para ese handler (fase 4).
//!
//! La ventana empieza en la primera peticion y las entradas vencidas
//! se barren en cada comprobacion. Al exceder, 429 `RATE_LIMITED` con
//! `Retry-After: 60` (900 en el caso por cuenta, como Go). `/health`
//! y `/api/v1/health` no tienen limite. El tope de 10000 cubos de Go
//! se conserva: con el mapa lleno, un cubo nuevo no entra.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::client_ip::{client_ip, TrustedPrefix};
use crate::error;

/// Maximo de cubos simultaneos, como Go.
pub const MAX_BUCKETS: usize = 10_000;

/// Limite de autenticacion de Go: 500 peticiones por 15 minutos.
pub const AUTH_MAX_REQUESTS: u32 = 500;
pub const AUTH_WINDOW: Duration = Duration::from_secs(15 * 60);

/// Limite por cuenta de Go (login): 20 intentos por 15 minutos.
pub const ACCOUNT_MAX_REQUESTS: u32 = 20;
pub const ACCOUNT_WINDOW: Duration = Duration::from_secs(15 * 60);

/// `Retry-After` en segundos: 60 general/autenticacion, 900 por cuenta.
pub const RETRY_AFTER_GENERAL: &str = "60";
pub const RETRY_AFTER_ACCOUNT: &str = "900";

#[derive(Debug, Clone, Copy)]
struct Window {
    count: u32,
    until: Instant,
}

/// Limitador en memoria, compartido por todas las peticiones.
#[derive(Debug, Default)]
pub struct RateLimiter {
    limits: Mutex<HashMap<String, Window>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Comprueba un cubo con los umbrales dados, igual que
    /// `allowRequest` de Go. `now` se inyecta para poder probar.
    pub fn check(&self, key: &str, max: u32, ttl: Duration, now: Instant) -> bool {
        let mut limits = self.limits.lock().expect("lock del limitador");
        limits.retain(|_, window| now < window.until);
        let state = limits.get(key).copied().unwrap_or(Window {
            count: 0,
            until: now + ttl,
        });
        if state.count >= max || (limits.len() >= MAX_BUCKETS && state.count == 0) {
            return false;
        }
        limits.insert(
            key.to_string(),
            Window {
                count: state.count + 1,
                until: state.until,
            },
        );
        true
    }

    /// Cubo general de una IP.
    pub fn check_general(&self, ip: &str, max: u32, window: Duration) -> bool {
        self.check(&format!("api:{ip}"), max, window, Instant::now())
    }

    /// Cubo de autenticacion de una IP.
    pub fn check_auth(&self, ip: &str) -> bool {
        self.check(
            &format!("auth:{ip}"),
            AUTH_MAX_REQUESTS,
            AUTH_WINDOW,
            Instant::now(),
        )
    }

    /// Cubo por cuenta (`account:<ip>:<usuario>`), para el login.
    pub fn check_account(&self, ip: &str, username: &str) -> bool {
        self.check(
            &format!("account:{ip}:{username}"),
            ACCOUNT_MAX_REQUESTS,
            ACCOUNT_WINDOW,
            Instant::now(),
        )
    }
}

/// Configuracion del limitador para la capa de Axum.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    pub limiter: std::sync::Arc<RateLimiter>,
    pub max_requests: u32,
    pub window: Duration,
    pub trusted_proxies: Vec<TrustedPrefix>,
}

fn client_ip_string(request: &Request, trusted: &[TrustedPrefix]) -> String {
    let remote = request
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|info| info.0.ip());
    let forwarded = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok());
    match remote {
        Some(ip) => client_ip(ip, forwarded, trusted).to_string(),
        None => "unknown".to_string(),
    }
}

/// Capa de limite general y de autenticacion (`limit` de Go). Se
/// instala con `middleware::from_fn_with_state(config, rate_limit)`.
pub async fn rate_limit(
    State(config): State<RateLimitConfig>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    if path == "/api/v1/health" || path == "/health" {
        return next.run(request).await;
    }
    let ip = client_ip_string(&request, &config.trusted_proxies);
    let credential = path == "/api/v1/auth/login"
        || path == "/api/v1/auth/forgot-password"
        || path == "/api/v1/auth/reset-password";
    let allowed = if credential {
        config.limiter.check_auth(&ip)
    } else {
        config
            .limiter
            .check_general(&ip, config.max_requests, config.window)
    };
    if !allowed {
        let mut response = error::fail(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Demasiadas solicitudes",
        )
        .into_response();
        response.headers_mut().insert(
            axum::http::header::RETRY_AFTER,
            RETRY_AFTER_GENERAL.parse().unwrap(),
        );
        return response;
    }
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_window_counts_and_resets() {
        let limiter = RateLimiter::new();
        let now = Instant::now();
        let ttl = Duration::from_secs(60);
        assert!(limiter.check("api:1.2.3.4", 3, ttl, now));
        assert!(limiter.check("api:1.2.3.4", 3, ttl, now));
        assert!(limiter.check("api:1.2.3.4", 3, ttl, now));
        assert!(!limiter.check("api:1.2.3.4", 3, ttl, now));
        // Otra IP tiene su propio cubo.
        assert!(limiter.check("api:5.6.7.8", 3, ttl, now));
        // Ventana vencida: el conteo vuelve a cero.
        assert!(limiter.check("api:1.2.3.4", 3, ttl, now + ttl + Duration::from_secs(1)));
    }

    #[test]
    fn buckets_are_independent_by_kind() {
        let limiter = RateLimiter::new();
        // Los Retry-After del contrato: 60 general/autenticacion, 900
        // por cuenta (login).
        assert_eq!(RETRY_AFTER_GENERAL, "60");
        assert_eq!(RETRY_AFTER_ACCOUNT, "900");
        let ip = "203.0.113.7";
        for _ in 0..20 {
            assert!(limiter.check_account(ip, "operador"));
        }
        assert!(!limiter.check_account(ip, "operador"));
        // Otro usuario no esta limitado y el limite general tampoco.
        assert!(limiter.check_account(ip, "admin"));
        assert!(limiter.check_general(ip, 100, Duration::from_secs(60)));
    }
}
