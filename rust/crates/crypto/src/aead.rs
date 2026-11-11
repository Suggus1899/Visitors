//! AES-256-GCM con el formato versionado de Go
//! (`server-go/internal/security/crypto.go`, `Encrypt`/`Decrypt`).
//!
//! Formato: `ENC:<hex(ciphertext)>:<hex(nonce 16 bytes)>:<hex(tag 16
//! bytes)>`, con nonce aleatorio de 16 bytes (Go usa
//! `NewGCMWithNonceSize(block, 16)`). Los valores historicos sin el
//! prefijo `ENC:` y sin la forma de tres partes se devuelven tal cual
//! (texto sin cifrar heredado); los valores con la forma completa pero
//! sin prefijo tambien se descifran. Un valor vacio cifra y descifra
//! como vacio.

use std::fmt;

use aes::Aes256;
use aes_gcm::aead::{consts::U16, Aead, KeyInit, OsRng};
use aes_gcm::{AesGcm, Nonce};
use rand::RngCore;

/// AES-256-GCM con nonce de 16 bytes, como `NewGCMWithNonceSize(block, 16)` de Go.
pub type Aes256Gcm16 = AesGcm<Aes256, U16>;

/// Error de cifrado/descifrado, con los mismos mensajes de Go.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CryptoError(pub &'static str);

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl std::error::Error for CryptoError {}

/// Cifra un campo con el formato de Go. El texto vacio se guarda vacio.
pub fn encrypt(key: &[u8; 32], text: &str) -> Result<String, CryptoError> {
    if text.is_empty() {
        return Ok(String::new());
    }
    let cipher = Aes256Gcm16::new_from_slice(key).map_err(|_| CryptoError("invalid key length"))?;
    let mut iv = [0u8; 16];
    OsRng.fill_bytes(&mut iv);
    let sealed = cipher
        .encrypt(Nonce::from_slice(&iv), text.as_bytes())
        .map_err(|_| CryptoError("encryption failed"))?;
    let (data, tag) = sealed.split_at(sealed.len() - 16);
    Ok(format!(
        "ENC:{}:{}:{}",
        hex::encode(data),
        hex::encode(iv),
        hex::encode(tag)
    ))
}

/// Descifra un campo con el formato de Go. Los valores vacios se
/// devuelven vacios y los valores historicos sin cifrar se devuelven
/// tal cual.
pub fn decrypt(key: &[u8; 32], text: &str) -> Result<String, CryptoError> {
    if text.is_empty() {
        return Ok(String::new());
    }
    let prefixed = text.starts_with("ENC:");
    let body = text.strip_prefix("ENC:").unwrap_or(text);
    let parts: Vec<&str> = body.split(':').collect();
    if !prefixed && (parts.len() != 3 || parts[1].len() != 32 || parts[2].len() != 32) {
        // Valor historico sin cifrar: se devuelve tal cual.
        return Ok(text.to_string());
    }
    if parts.len() != 3 {
        return Err(CryptoError("invalid encrypted field"));
    }
    let data = hex::decode(parts[0]).map_err(|_| CryptoError("invalid encrypted field"))?;
    let iv = hex::decode(parts[1]).map_err(|_| CryptoError("invalid nonce"))?;
    if iv.len() != 16 {
        return Err(CryptoError("invalid nonce"));
    }
    let tag = hex::decode(parts[2]).map_err(|_| CryptoError("invalid authentication tag"))?;
    if tag.len() != 16 {
        return Err(CryptoError("invalid authentication tag"));
    }
    let cipher = Aes256Gcm16::new_from_slice(key).map_err(|_| CryptoError("invalid key length"))?;
    let mut ciphertext = data;
    ciphertext.extend_from_slice(&tag);
    let plain = cipher
        .decrypt(Nonce::from_slice(&iv), ciphertext.as_ref())
        .map_err(|_| CryptoError("encrypted field authentication failed"))?;
    String::from_utf8(plain).map_err(|_| CryptoError("decrypted value is not valid UTF-8"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_with_go_format() {
        let key = [7u8; 32];
        for plain in ["V-12345678", "Ana María Pérez", "", "texto con ñ y acentos"] {
            let cipher = encrypt(&key, plain).unwrap();
            if plain.is_empty() {
                assert_eq!(cipher, "");
            } else {
                assert!(cipher.starts_with("ENC:"));
            }
            assert_eq!(decrypt(&key, &cipher).unwrap(), plain);
        }
    }

    #[test]
    fn wrong_key_fails_authentication() {
        let key = [7u8; 32];
        let other = [9u8; 32];
        let cipher = encrypt(&key, "secreto").unwrap();
        let err = decrypt(&other, &cipher).unwrap_err();
        assert_eq!(err.0, "encrypted field authentication failed");
    }

    #[test]
    fn legacy_plaintext_passes_through() {
        let key = [7u8; 32];
        assert_eq!(decrypt(&key, "Juan Pérez").unwrap(), "Juan Pérez");
        assert_eq!(decrypt(&key, "").unwrap(), "");
        // Dos partes no es forma cifrada: pasa tal cual.
        assert_eq!(decrypt(&key, "abc:def").unwrap(), "abc:def");
    }

    #[test]
    fn malformed_enc_prefixed_is_rejected() {
        let key = [7u8; 32];
        assert_eq!(
            decrypt(&key, "ENC:solo-una-parte").unwrap_err().0,
            "invalid encrypted field"
        );
        assert_eq!(
            decrypt(&key, "ENC:zz:00:00").unwrap_err().0,
            "invalid encrypted field"
        );
    }
}
