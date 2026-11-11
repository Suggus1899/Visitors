//! Avisos de visitas en tiempo real (SSE).
//!
//! Traducción de `events.go` de Go: el aviso solo dice «algo cambió»
//! (tipo, instante y, cuando lo hay, id de visita) y el cliente vuelve
//! a consultar; sin payload de datos. El canal es un `broadcast` de
//! Tokio con 16 huecos, como el canal con buffer de Go, y hay como
//! mucho 256 suscriptores (503 `STREAM_CAPACITY` al llegar al tope).
//! La publicación ocurre después del commit, nunca dentro de la
//! transacción.

use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use tokio::sync::broadcast;

/// Capacidad del canal por suscriptor, como Go (`chan visitEvent, 16`).
pub const CHANNEL_CAPACITY: usize = 16;

/// Máximo de suscriptores simultáneos, como Go.
pub const MAX_SUBSCRIBERS: usize = 256;

/// Aviso SSE, con el mismo JSON que Go (`visitId` se omite en cero).
#[derive(Debug, Clone, Serialize)]
pub struct VisitEvent {
    #[serde(rename = "type")]
    pub kind: String,
    pub timestamp: String,
    #[serde(rename = "visitId", skip_serializing_if = "Option::is_none")]
    pub visit_id: Option<i64>,
}

/// Hub de eventos compartido por el router.
#[derive(Clone)]
pub struct Events {
    sender: broadcast::Sender<VisitEvent>,
    subscribers: Arc<AtomicUsize>,
}

impl Events {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self {
            sender,
            subscribers: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Publica un aviso después del commit. Los suscriptores lentos
    /// pierden el aviso (el canal descarta), como en Go.
    pub fn publish(&self, kind: &str, visit_id: i64) {
        let event = VisitEvent {
            kind: kind.to_string(),
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true),
            visit_id: if visit_id == 0 { None } else { Some(visit_id) },
        };
        let _ = self.sender.send(event);
    }

    /// Suscripción nueva. `None` si ya hay 256 suscriptores.
    pub fn subscribe(&self) -> Option<Subscription> {
        let count = self.subscribers.fetch_add(1, Ordering::SeqCst) + 1;
        if count > MAX_SUBSCRIBERS {
            self.subscribers.fetch_sub(1, Ordering::SeqCst);
            return None;
        }
        Some(Subscription {
            receiver: self.sender.subscribe(),
            subscribers: self.subscribers.clone(),
        })
    }

    /// Suscriptores actuales.
    pub fn subscriber_count(&self) -> usize {
        self.subscribers.load(Ordering::SeqCst)
    }
}

/// Una suscripción SSE: al soltarse, libera su hueco.
pub struct Subscription {
    pub receiver: broadcast::Receiver<VisitEvent>,
    subscribers: Arc<AtomicUsize>,
}

impl Drop for Subscription {
    fn drop(&mut self) {
        self.subscribers.fetch_sub(1, Ordering::SeqCst);
    }
}
