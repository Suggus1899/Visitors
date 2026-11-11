//! Descifrado compatible con el formato de Go — pieza mínima para
//! `preflight`.
//!
//! Formato de `server-go/internal/security/crypto.go`:
//! `ENC:<hex(ciphertext)>:<hex(nonce 16 bytes)>:<hex(tag 16 bytes)>`,
//! AES-256-GCM con nonce de 16 bytes. Los valores históricos sin el
//! prefijo `ENC:` y sin la forma de tres partes se devuelven tal cual
//! (texto sin cifrar heredado); los valores con la forma completa pero
//! sin prefijo también se descifran.
//!
//! Esto es solo el descifrado que necesita `preflight` para comprobar
//! que los campos de identidad se leen con la clave configurada. El
//! cifrado, HMAC, bcrypt y JWT completos son de la fase 3; aquí no se
//! cifra nada nuevo.
//!
//! La clave se lee igual que en Go (`config.go`): variable
//! `ENCRYPTION_KEY` (o su alias `PII_ENCRYPTION_KEY`), 32 bytes en
//! hexadecimal.

use std::fmt;

use aes::Aes256;
use aes_gcm::aead::{consts::U16, Aead, KeyInit};
use aes_gcm::{AesGcm, Nonce};

/// AES-256-GCM con nonce de 16 bytes, como `NewGCMWithNonceSize(block, 16)` de Go.
type Aes256Gcm16 = AesGcm<Aes256, U16>;

/// Error de descifrado, con los mismos mensajes de Go.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CryptoError(pub &'static str);

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl std::error::Error for CryptoError {}

/// Descifra un campo con el formato de Go. Los valores vacíos se
/// devuelven vacíos y los valores históricos sin cifrar se devuelven
/// tal cual.
pub fn decrypt(key: &[u8; 32], text: &str) -> Result<String, CryptoError> {
    if text.is_empty() {
        return Ok(String::new());
    }
    let prefixed = text.starts_with("ENC:");
    let body = text.strip_prefix("ENC:").unwrap_or(text);
    let parts: Vec<&str> = body.split(':').collect();
    if !prefixed && (parts.len() != 3 || parts[1].len() != 32 || parts[2].len() != 32) {
        // Valor histórico sin cifrar: se devuelve tal cual.
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

/// Lee la clave de datos de 32 bytes desde el entorno, igual que Go:
/// `ENCRYPTION_KEY`, con alias `PII_ENCRYPTION_KEY`, en hexadecimal.
pub fn load_key_from_env() -> Result<[u8; 32], String> {
    let raw = std::env::var("ENCRYPTION_KEY")
        .or_else(|_| std::env::var("PII_ENCRYPTION_KEY"))
        .map_err(|_| "falta ENCRYPTION_KEY (o PII_ENCRYPTION_KEY)".to_string())?;
    let bytes = hex::decode(raw.trim())
        .map_err(|_| "ENCRYPTION_KEY must be a 32-byte hexadecimal key".to_string())?;
    if bytes.len() != 32 {
        return Err("ENCRYPTION_KEY must be a 32-byte hexadecimal key".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes_gcm::aead::rand_core::RngCore;
    use aes_gcm::aead::{Aead, OsRng};

    /// Cifrado espejo de `security.Encrypt` de Go, solo para pruebas:
    /// nonce aleatorio de 16 bytes, `Seal` y formato `ENC:hex:hex:hex`.
    fn encrypt_like_go(key: &[u8; 32], text: &str) -> String {
        let cipher = Aes256Gcm16::new_from_slice(key).unwrap();
        let mut iv = [0u8; 16];
        OsRng.fill_bytes(&mut iv);
        let sealed = cipher
            .encrypt(Nonce::from_slice(&iv), text.as_bytes())
            .unwrap();
        let (data, tag) = sealed.split_at(sealed.len() - 16);
        format!(
            "ENC:{}:{}:{}",
            hex::encode(data),
            hex::encode(iv),
            hex::encode(tag)
        )
    }

    #[test]
    fn roundtrip_with_go_format() {
        let key = [7u8; 32];
        for plain in ["V-12345678", "Ana María Pérez", "", "texto con ñ y acentos"] {
            let cipher = encrypt_like_go(&key, plain);
            assert!(cipher.starts_with("ENC:"));
            assert_eq!(decrypt(&key, &cipher).unwrap(), plain);
        }
    }

    #[test]
    fn wrong_key_fails_authentication() {
        let key = [7u8; 32];
        let other = [9u8; 32];
        let cipher = encrypt_like_go(&key, "secreto");
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

    #[test]
    fn load_key_from_env_reads_hex_32_bytes() {
        std::env::set_var("ENCRYPTION_KEY", "00".repeat(32));
        let key = load_key_from_env().unwrap();
        assert_eq!(key, [0u8; 32]);
        std::env::set_var("ENCRYPTION_KEY", "corta");
        assert!(load_key_from_env().is_err());
        std::env::remove_var("ENCRYPTION_KEY");
    }
}
