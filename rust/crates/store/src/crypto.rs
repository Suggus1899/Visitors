//! Descifrado compatible con el formato de Go — reexportacion de la
//! crate `logmaster-crypto` (fase 3).
//!
//! La implementacion vivia aqui como pieza minima para `preflight`
//! (fase 2). Desde la fase 3, el cifrado, HMAC, trigramas, bcrypt y
//! contrasenas viven en `crates/crypto/` (documento, seccion 5) y este
//! modulo solo reexporta lo que `preflight` y `convert` necesitan, para
//! no romper sus importaciones.
//!
//! Formato de `server-go/internal/security/crypto.go`:
//! `ENC:<hex(ciphertext)>:<hex(nonce 16 bytes)>:<hex(tag 16 bytes)>`,
//! AES-256-GCM con nonce de 16 bytes.

pub use logmaster_crypto::*;
