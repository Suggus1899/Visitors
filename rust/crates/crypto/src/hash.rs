//! SHA-256, HMAC-SHA-256 de identidad y trigramas de busqueda.
//!
//! Traduccion de `server-go/internal/security/crypto.go`
//! (`Hash`, `IdentityHash`, `IdentityFingerprint`,
//! `NormalizeIdentity`) y de `server-go/internal/search/tokens.go`
//! (`Key`, `Fingerprint`, `Normalize`, `Tokens`).
//!
//! Los dos contextos de clave son distintos a proposito: la identidad
//! usa `logmaster/visitor-identity/v1` y la busqueda
//! `logmaster/name-search/v1`. Los indices existentes siguen validos
//! porque los HMAC resultantes son identicos a los de Go.

use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

/// SHA-256 en hex, como `security.Hash` de Go.
pub fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

/// Clave derivada para la identidad: HMAC-SHA-256 de la clave de datos
/// con el contexto `logmaster/visitor-identity/v1`.
pub fn identity_key(key: &[u8]) -> Vec<u8> {
    let mut h = HmacSha256::new_from_slice(key).expect("HMAC admite cualquier longitud de clave");
    h.update(b"logmaster/visitor-identity/v1");
    h.finalize().into_bytes().to_vec()
}

/// HMAC-SHA-256 de la cedula normalizada con la clave de identidad, en
/// hex. Es el valor que guarda la columna `Visitors.cedula`.
pub fn identity_hash(key: &[u8], value: &str) -> String {
    let derived = identity_key(key);
    let mut h = HmacSha256::new_from_slice(&derived).expect("clave derivada valida");
    h.update(value.as_bytes());
    hex::encode(h.finalize().into_bytes())
}

/// Huella de la clave de identidad: el HMAC de `"index-key-check"`.
/// Es lo que guarda `IdentityIndexState.fingerprint`.
pub fn identity_fingerprint(key: &[u8]) -> String {
    identity_hash(key, "index-key-check")
}

/// Normalizacion de la cedula, igual que Go: mayusculas, sin espacios,
/// y un guion tras el primer caracter si el segundo no es ya un guion
/// (`v12345678` -> `V-12345678`).
pub fn normalize_identity(value: &str) -> String {
    let mut s: String = value.split_whitespace().collect();
    s = s.to_uppercase();
    let mut chars = s.chars();
    match (chars.next(), chars.next()) {
        (Some(first), Some(second)) if second != '-' => {
            let mut out = String::with_capacity(s.len() + 1);
            out.push(first);
            out.push('-');
            out.push(second);
            out.extend(chars);
            out
        }
        _ => s,
    }
}

/// Clave derivada para la busqueda: HMAC-SHA-256 de la clave de datos
/// con el contexto `logmaster/name-search/v1`.
pub fn search_key(key: &[u8]) -> Vec<u8> {
    let mut h = HmacSha256::new_from_slice(key).expect("HMAC admite cualquier longitud de clave");
    h.update(b"logmaster/name-search/v1");
    h.finalize().into_bytes().to_vec()
}

/// Huella de la clave de busqueda: el HMAC de `"index-key-check"` con
/// la clave derivada de busqueda. Es lo que guarda
/// `SearchIndexState.fingerprint`.
pub fn search_fingerprint(key: &[u8]) -> String {
    let derived = search_key(key);
    let mut h = HmacSha256::new_from_slice(&derived).expect("clave derivada valida");
    h.update(b"index-key-check");
    hex::encode(h.finalize().into_bytes())
}

/// Normalizacion de la busqueda, igual que Go: minusculas y sin
/// espacios en los extremos. Los acentos se conservan.
pub fn normalize_search(value: &str) -> String {
    value.trim().to_lowercase()
}

/// Trigramas HMAC de un valor normalizado: ventana deslizante de 3
/// runas, un HMAC-SHA-256 de 32 bytes por trigrama, sin duplicados y
/// en orden de aparicion. Los tokens ya guardados siguen sirviendo.
pub fn search_tokens(key: &[u8], value: &str) -> Vec<Vec<u8>> {
    let runes: Vec<char> = normalize_search(value).chars().collect();
    let derived = search_key(key);
    let mut tokens: Vec<Vec<u8>> = Vec::new();
    for window in runes.windows(3) {
        let trigram: String = window.iter().collect();
        let mut h = HmacSha256::new_from_slice(&derived).expect("clave derivada valida");
        h.update(trigram.as_bytes());
        let token = h.finalize().into_bytes().to_vec();
        if !tokens.contains(&token) {
            tokens.push(token);
        }
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_hash_is_keyed_and_domain_separated() {
        let key = b"fictional-encryption-key-material";
        let cedula = "V-12345678";
        let got = identity_hash(key, cedula);
        assert_eq!(got, identity_hash(key, cedula));
        assert_ne!(got, sha256_hex(cedula));
        assert_ne!(got, identity_hash(b"different-key", cedula));
        assert_ne!(
            identity_fingerprint(key),
            identity_fingerprint(b"different-key")
        );
        assert_ne!(identity_fingerprint(key), sha256_hex("index-key-check"));
        // La huella de identidad y la de busqueda no se mezclan.
        assert_ne!(identity_fingerprint(key), search_fingerprint(key));
    }

    #[test]
    fn normalize_identity_matches_go() {
        for (input, expected) in [
            ("v12345678", "V-12345678"),
            (" V-12345678 ", "V-12345678"),
            ("e-12345678", "E-12345678"),
        ] {
            assert_eq!(normalize_identity(input), expected);
        }
    }

    #[test]
    fn search_tokens_slide_and_deduplicate() {
        let key = b"fictional-encryption-key-material";
        // "ana" da un trigrama; "anana" da "ana" y "nan" (sin duplicar "ana").
        assert_eq!(search_tokens(key, "ana").len(), 1);
        assert_eq!(search_tokens(key, "anana").len(), 2);
        assert_eq!(search_tokens(key, "an").len(), 0);
        assert_eq!(search_tokens(key, "  Ana ").len(), 1);
        // Determinista y distinto por clave.
        assert_eq!(search_tokens(key, "ana"), search_tokens(key, "ana"));
        assert_ne!(
            search_tokens(key, "ana"),
            search_tokens(b"otra-clave", "ana")
        );
        // Cada token tiene 32 bytes.
        assert!(search_tokens(key, "ana").iter().all(|t| t.len() == 32));
        // La normalizacion conserva los acentos: distinto de sin acento.
        assert_ne!(search_tokens(key, "álvarez"), search_tokens(key, "alvarez"));
    }
}
