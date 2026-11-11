//! Alcance del cifrado de campos del perfil y del historial.
//!
//! Reglas tomadas de la linea base, seccion 7, y del codigo Go
//! (`server-go/internal/httpapi/visitors.go`, `visits.go`,
//! `privacy.go` y `server-go/db/history.go`):
//!
//! - Se cifran (AES-256-GCM, formato `ENC:...`): cedula, nombres,
//!   cargo, contacto (email y telefono) y observaciones del perfil, y
//!   los valores viejo/nuevo del historial de edicion.
//! - NO se cifran individualmente: empresa, imagenes (BLOB) ni ciertos
//!   campos libres de visitas y ARCO. Se compensa con NTFS y cifrado de
//!   disco, como advierte la linea base.
//! - En el historial, los campos de foto (`photo...`, `id_photo...`,
//!   `idPhoto...`) se vacian; un valor ya cifrado se valida
//!   descifrandolo y un valor en claro se cifra.

use crate::aead::{decrypt, encrypt, CryptoError};

/// Campos del perfil que se cifran (nombres de columna en SQLite).
pub const ENCRYPTED_PROFILE_FIELDS: &[&str] = &[
    "cedula",
    "first_name",
    "last_name",
    "job_title",
    "email",
    "phone",
    "observations",
];

/// Campos del perfil que NO se cifran individualmente (empresa e
/// imagenes, entre otros).
pub const PLAINTEXT_PROFILE_FIELDS: &[&str] = &["company", "photo_data", "id_photo_data"];

/// `true` si el campo del perfil se cifra con AES-256-GCM.
pub fn is_encrypted_profile_field(field: &str) -> bool {
    ENCRYPTED_PROFILE_FIELDS.contains(&field)
}

/// Cifra el valor de un campo del perfil si el campo es de los que se
/// cifran; los demas se devuelven tal cual.
pub fn encrypt_profile_field(
    key: &[u8; 32],
    field: &str,
    value: &str,
) -> Result<String, CryptoError> {
    if is_encrypted_profile_field(field) {
        encrypt(key, value)
    } else {
        Ok(value.to_string())
    }
}

/// Descifra el valor de un campo del perfil si el campo es de los que
/// se cifran; los demas se devuelven tal cual.
pub fn decrypt_profile_field(
    key: &[u8; 32],
    field: &str,
    value: &str,
) -> Result<String, CryptoError> {
    if is_encrypted_profile_field(field) {
        decrypt(key, value)
    } else {
        Ok(value.to_string())
    }
}

/// `true` si el campo del historial es una foto: esos valores se
/// vacian en el historial, no se cifran (`history.go` de Go).
pub fn is_photo_history_field(field: &str) -> bool {
    field.starts_with("photo") || field.starts_with("id_photo") || field.starts_with("idPhoto")
}

/// Normaliza un valor del historial para guardarlo: si ya viene
/// cifrado (`ENC:...`) se valida descifrandolo y se deja como esta;
/// si viene en claro, se cifra. Es la regla de `history.go` de Go
/// para los valores historicos pendientes.
pub fn normalize_history_value(key: &[u8; 32], value: &str) -> Result<String, CryptoError> {
    if value.starts_with("ENC:") {
        decrypt(key, value)?;
        Ok(value.to_string())
    } else {
        encrypt(key, value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_scope_matches_go() {
        let key = [3u8; 32];
        for field in [
            "cedula",
            "first_name",
            "last_name",
            "job_title",
            "email",
            "phone",
            "observations",
        ] {
            assert!(is_encrypted_profile_field(field), "{field} debe cifrarse");
            let cipher = encrypt_profile_field(&key, field, "secreto").unwrap();
            assert!(cipher.starts_with("ENC:"), "{field} no se cifro");
            assert_eq!(
                decrypt_profile_field(&key, field, &cipher).unwrap(),
                "secreto"
            );
        }
        for field in ["company", "photo_data", "id_photo_data"] {
            assert!(
                !is_encrypted_profile_field(field),
                "{field} no debe cifrarse"
            );
            assert_eq!(
                encrypt_profile_field(&key, field, "Trébol").unwrap(),
                "Trébol"
            );
        }
    }

    #[test]
    fn history_values_normalize_like_go() {
        let key = [3u8; 32];
        assert!(is_photo_history_field("photo_data"));
        assert!(is_photo_history_field("id_photo_data"));
        assert!(is_photo_history_field("idPhotoUrl"));
        assert!(!is_photo_history_field("first_name"));
        let cipher = normalize_history_value(&key, "Ana").unwrap();
        assert!(cipher.starts_with("ENC:"));
        // Ya cifrado y valido: se deja como esta.
        assert_eq!(normalize_history_value(&key, &cipher).unwrap(), cipher);
        // Ya cifrado pero corrupto: se rechaza.
        assert!(normalize_history_value(&key, "ENC:zz:00:00").is_err());
    }
}
