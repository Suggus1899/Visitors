//! Contrasenas: politica y bcrypt.
//!
//! Traduccion de `server-go/internal/security/password.go`
//! (`ValidatePassword`) y de `crypto.go` (`VerifyPassword`,
//! `PasswordHash`). La politica es: minimo 12 caracteres, maximo 72
//! bytes UTF-8 (el limite de bcrypt), con mayuscula, minuscula, numero
//! y simbolo, y no ser una contrasena comun de la lista
//! `rust/fixtures/common-passwords.json` (copia de
//! `server-go/contracts/common-passwords.json`).
//!
//! Los hashes se crean con coste 12. La verificacion acepta los
//! formatos historicos (`$2a$`, `$2b$`, ...) y las contrasenas largas
//! heredadas, igual que Go: la crate `bcrypt` trunca a 72 bytes como
//! hacia Node al crearlas, asi que un hash historico de una contrasena
//! de mas de 72 bytes sigue verificandose.

use std::collections::HashSet;
use std::fmt;
use std::sync::OnceLock;

/// Coste bcrypt de Go (`bcrypt.GenerateFromPassword(..., 12)`).
pub const BCRYPT_COST: u32 = 12;

/// Maximo de bcrypt: 72 bytes UTF-8.
pub const MAX_PASSWORD_BYTES: usize = 72;

/// Minimo de la politica: 12 caracteres.
pub const MIN_PASSWORD_CHARS: usize = 12;

/// Simbolos aceptados, los mismos de Go:
/// `!@#$%^&*()_+-=[]{};':"\|,.<>/?`.
pub const SPECIAL_CHARS: &str = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?";

/// Error de validacion o de hash, con el mensaje de Go.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasswordError(pub &'static str);

impl fmt::Display for PasswordError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl std::error::Error for PasswordError {}

fn common_passwords() -> &'static HashSet<String> {
    static COMMON: OnceLock<HashSet<String>> = OnceLock::new();
    COMMON.get_or_init(|| {
        let raw = include_str!("../../../fixtures/common-passwords.json");
        let list: Vec<String> = serde_json::from_str(raw)
            .expect("fixtures/common-passwords.json es una lista JSON valida");
        list.into_iter().collect()
    })
}

/// Valida una contrasena con la politica de Go. Devuelve el mismo
/// mensaje de error que `security.ValidatePassword`.
pub fn validate_password(password: &str) -> Result<(), PasswordError> {
    const MESSAGE: &str = "la contraseña requiere 12 caracteres, mayúscula, minúscula, número y símbolo; máximo 72 bytes UTF-8";
    let (mut lower, mut upper, mut digit, mut special) = (false, false, false, false);
    for ch in password.chars() {
        lower = lower || ch.is_ascii_lowercase();
        upper = upper || ch.is_ascii_uppercase();
        digit = digit || ch.is_ascii_digit();
        special = special || SPECIAL_CHARS.contains(ch);
    }
    if password.chars().count() < MIN_PASSWORD_CHARS
        || password.len() > MAX_PASSWORD_BYTES
        || !lower
        || !upper
        || !digit
        || !special
        || common_passwords().contains(&password.to_lowercase())
    {
        return Err(PasswordError(MESSAGE));
    }
    Ok(())
}

/// Crea un hash bcrypt con coste 12. Falla si la contrasena supera los
/// 72 bytes, igual que Go (no se trunca en silencio al crear).
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    if password.len() > MAX_PASSWORD_BYTES {
        return Err(PasswordError("new password exceeds bcrypt's 72-byte limit"));
    }
    bcrypt::hash(password, BCRYPT_COST).map_err(|_| PasswordError("bcrypt failed to hash password"))
}

/// Verifica una contrasena contra un hash historico. Devuelve `false`
/// si no coincide o si el hash no tiene un formato bcrypt valido.
pub fn verify_password(password: &str, hash: &str) -> bool {
    bcrypt::verify(password, hash).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_rejects_weak_and_accepts_strong() {
        for weak in [
            "weak",
            "Withoutdigits!AAAA",
            "withoutupper!123",
            "WITHOUTLOWER!123",
            "WithoutSpecial123",
            &format!("{}a1!", "Á".repeat(36)),
            "password",
        ] {
            assert!(
                validate_password(weak).is_err(),
                "acepto una contrasena debil o comun: {weak:?}"
            );
        }
        assert!(validate_password("Private!Safe12Á").is_ok());
        assert!(validate_password("Ficticia!12Árbol").is_ok());
    }

    #[test]
    fn bcrypt_roundtrip_cost_12() {
        let hash = hash_password("Private!Safe12Á").unwrap();
        assert!(hash.starts_with("$2b$12$") || hash.starts_with("$2a$12$"));
        assert!(verify_password("Private!Safe12Á", &hash));
        assert!(!verify_password("Private!Safe12á", &hash));
        assert!(!verify_password("otra", &hash));
        assert!(hash_password(&"á".repeat(50)).is_err());
    }
}
