//! Lectura de la clave de datos desde el entorno, igual que Go
//! (`server-go/internal/config/config.go`): variable `ENCRYPTION_KEY`
//! (o su alias `PII_ENCRYPTION_KEY`), 32 bytes en hexadecimal.

/// Lee la clave de datos de 32 bytes desde el entorno.
pub fn load_key_from_env() -> Result<[u8; 32], String> {
    let raw = std::env::var("ENCRYPTION_KEY")
        .or_else(|_| std::env::var("PII_ENCRYPTION_KEY"))
        .map_err(|_| "falta ENCRYPTION_KEY (o PII_ENCRYPTION_KEY)".to_string())?;
    parse_key_hex(&raw)
}

/// Parsea una clave de 32 bytes en hexadecimal (la misma regla que
/// `load_key_from_env`, pero desde un valor ya leído, como el del
/// archivo de secretos).
pub fn parse_key_hex(raw: &str) -> Result<[u8; 32], String> {
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

    #[test]
    fn load_key_from_env_reads_hex_32_bytes() {
        std::env::set_var("ENCRYPTION_KEY", "00".repeat(32));
        let key = load_key_from_env().unwrap();
        assert_eq!(key, [0u8; 32]);
        std::env::set_var("ENCRYPTION_KEY", "corta");
        assert!(load_key_from_env().is_err());
        std::env::remove_var("ENCRYPTION_KEY");
        std::env::set_var("PII_ENCRYPTION_KEY", "19".repeat(32));
        assert_eq!(load_key_from_env().unwrap(), [0x19u8; 32]);
        std::env::remove_var("PII_ENCRYPTION_KEY");
    }
}
