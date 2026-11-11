//! Repositorios de acceso a datos.
//!
//! Cada función recibe `&Connection` (lecturas) o `&Transaction`
//! (escrituras), nunca abre su propia conexión: quien llama decide la
//! transacción. Las transiciones de visita y la cancelación ARCO se
//! ejecutan dentro de una transacción inmediata del llamador
//! (`Store::tx_immediate`), que agrupa la mutación y su auditoría
//! como hace Go, y solo después se publica el aviso SSE (fase 4).
//!
//! Las sentencias reproducen `server-go/db/queries.sql` y los SQL de
//! los handlers (`visits.go`, `privacy.go`), con `$n` de PostgreSQL
//! traducidos a `?n` de SQLite.

pub mod audit;
pub mod catalogs;
pub mod privacy;
pub mod search;
pub mod users;
pub mod visitors;
pub mod visits;

/// Actor de una operación (para auditoría y registros).
#[derive(Debug, Clone, PartialEq)]
pub struct Actor {
    pub id: i64,
    pub username: String,
}
