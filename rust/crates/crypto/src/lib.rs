//! Criptografia de LogMaster, byte a byte compatible con Go.
//!
//! Traduccion de `server-go/internal/security/crypto.go`,
//! `server-go/internal/security/password.go` y
//! `server-go/internal/search/tokens.go`. Nada aqui inventa un formato:
//! cada funcion reproduce el de Go para que lo cifrado por Go lo lea
//! Rust sin convertir datos, y viceversa.
//!
//! - [`aead`]: AES-256-GCM con el formato versionado
//!   `ENC:<hex(ciphertext)>:<hex(nonce 16 bytes)>:<hex(tag 16 bytes)>`
//!   y la tolerancia a valores historicos sin cifrar.
//! - [`hash`]: SHA-256, HMAC-SHA-256 de identidad (contexto
//!   `logmaster/visitor-identity/v1`) y trigramas de busqueda
//!   (contexto `logmaster/name-search/v1`).
//! - [`password`]: politica 12-72 bytes y bcrypt con coste 12; verifica
//!   los hashes historicos, incluidos los de contrasenas largas.
//! - [`token`]: token aleatorio de 32 bytes en hex y su hash SHA-256
//!   (recuperacion de contrasena).
//! - [`profile`]: alcance exacto de los campos cifrados del perfil y
//!   del historial (cedula, nombres, cargo, contacto, observaciones;
//!   empresa, imagenes y ciertos campos libres, sin cifrado individual).
//! - [`key`]: lectura de la clave de datos desde el entorno, igual que Go.

pub mod aead;
pub mod hash;
pub mod key;
pub mod password;
pub mod profile;
pub mod token;

pub use aead::{decrypt, encrypt, CryptoError};
pub use hash::{
    identity_fingerprint, identity_hash, identity_key, normalize_identity, normalize_search,
    search_fingerprint, search_key, search_tokens, sha256_hex,
};
pub use key::{load_key_from_env, parse_key_hex};
pub use password::{hash_password, validate_password, verify_password, PasswordError};
pub use token::{hash_token, random_token};

#[cfg(test)]
mod compat {
    //! Vectores de compatibilidad con Go (`rust/fixtures/crypto-node.json`,
    //! copia de `server-go/contracts/crypto-node.json`, generados por Node
    //! y comprobados por `TestNodeCompatibility` de Go): lo cifrado fuera
    //! de Rust se lee en Rust sin convertir.

    use super::*;

    fn fixture() -> serde_json::Value {
        let raw = include_str!("../../../fixtures/crypto-node.json");
        serde_json::from_str(raw).expect("fixtures/crypto-node.json valido")
    }

    fn s(f: &serde_json::Value, key: &str) -> String {
        f[key]
            .as_str()
            .expect("campo de texto en el fixture")
            .to_string()
    }

    #[test]
    fn go_encrypted_values_decrypt_in_rust() {
        let f = fixture();
        let key_bytes = hex::decode(s(&f, "key")).unwrap();
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);
        for field in ["encrypted", "legacyEncrypted"] {
            assert_eq!(
                decrypt(&key, &s(&f, field)).unwrap(),
                s(&f, "plaintext"),
                "{field} no descifra al texto original"
            );
        }
        // Manipular el tag se rechaza.
        let mut tampered = s(&f, "encrypted");
        let len = tampered.len();
        tampered.replace_range(len - 2.., "00");
        assert!(decrypt(&key, &tampered).is_err());
        assert!(decrypt(&key, "ENC:broken").is_err());
        // Y lo cifrado por Rust lo leeria Go con el mismo formato.
        let ours = encrypt(&key, &s(&f, "plaintext")).unwrap();
        assert!(ours.starts_with("ENC:"));
        assert_eq!(decrypt(&key, &ours).unwrap(), s(&f, "plaintext"));
    }

    #[test]
    fn go_sha256_and_bcrypt_hashes_verify_in_rust() {
        let f = fixture();
        assert_eq!(sha256_hex(&s(&f, "cedula")), s(&f, "cedulaHash"));
        assert!(verify_password(&s(&f, "password"), &s(&f, "passwordHash")));
        // Hash historico de una contrasena larga (100 bytes UTF-8):
        // Go y Node la truncan a 72 bytes; Rust hace lo mismo.
        assert!(verify_password(
            &s(&f, "longPassword"),
            &s(&f, "longPasswordHash")
        ));
        assert!(!verify_password("wrong", &s(&f, "passwordHash")));
        assert!(hash_password(&s(&f, "longPassword")).is_err());
    }
}
