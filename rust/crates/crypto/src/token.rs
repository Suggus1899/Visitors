//! Token aleatorio de recuperacion y su hash.
//!
//! Traduccion de `security.RandomToken` y `security.Hash` de Go: 32
//! bytes aleatorios en hex (64 caracteres) y SHA-256 en hex del token.
//! En la base solo se guarda el hash; el token en claro viaja unicamente
//! por el enlace de recuperacion y tiene un solo uso.

use rand::RngCore;

/// 32 bytes aleatorios en hexadecimal (64 caracteres).
pub fn random_token() -> Result<String, crate::aead::CryptoError> {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| crate::aead::CryptoError("random source failed"))?;
    Ok(hex::encode(bytes))
}

/// SHA-256 en hex de un token (lo que se guarda en `Users.resetToken`).
pub fn hash_token(token: &str) -> String {
    crate::hash::sha256_hex(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_token_is_64_hex_chars_and_unique() {
        let a = random_token().unwrap();
        let b = random_token().unwrap();
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
        assert_eq!(hash_token(&a).len(), 64);
        assert_eq!(hash_token(&a), hash_token(&a));
        assert_ne!(hash_token(&a), hash_token(&b));
    }
}
