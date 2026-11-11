//! Archivo de secretos (fase 6; documento §14.3 y §15).
//!
//! Los secretos (`JWT_SECRET`, `JWT_REFRESH_SECRET`,
//! `ENCRYPTION_KEY`, `EDIT_PASSWORD`) **nunca** van en
//! `config.toml`: van por entorno o en este archivo,
//! `secrets.json` dentro de `secrets_dir` (por defecto
//! `C:\ProgramData\LogMaster\secrets\` en Windows).
//!
//! - **Windows**: cada valor se cifra con DPAPI
//!   (`CryptProtectData`, ámbito de la cuenta del servicio) antes
//!   de guardarse; solo esa cuenta puede descifrarlo, ni copiando
//!   el archivo a otra máquina.
//! - **Linux (desarrollo)**: no hay DPAPI; el archivo se guarda
//!   con permisos 0600 y los valores en claro, y cada lectura
//!   deja un aviso en el log. Es la misma limitación que el
//!   documento asume para el desarrollo en Linux: la protección
//!   real se verifica en Windows.
//!
//! Formato (`secrets.json`):
//! `{"version": 1, "dpapi": true|false, "entries": {"NOMBRE": "<base64>"}}`.
//! En Windows el base64 es el blob DPAPI; en Linux, el valor en
//! claro codificado en base64. Si el archivo dice `dpapi: true`
//! y se lee en Linux, la lectura falla (no se puede descifrar).

use std::collections::BTreeMap;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};

/// Nombres de secreto admitidos (los mismos que Go lee del
/// entorno). No se guarda ningún otro nombre.
pub const SECRET_NAMES: &[&str] = &[
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "ENCRYPTION_KEY",
    "EDIT_PASSWORD",
];

/// Cómo se protege el archivo en esta plataforma.
#[cfg(windows)]
pub const PROTECTION: &str = "DPAPI (cuenta del servicio)";
#[cfg(not(windows))]
pub const PROTECTION: &str = "0600 sin DPAPI (solo desarrollo en Linux)";

#[derive(Debug, Default, Serialize, Deserialize)]
struct SecretsFile {
    version: u32,
    dpapi: bool,
    #[serde(default)]
    entries: BTreeMap<String, String>,
}

/// Archivo de secretos en `dir/secrets.json`.
#[derive(Debug, Clone)]
pub struct SecretsStore {
    dir: PathBuf,
}

impl SecretsStore {
    /// Nueva tienda en `dir` (se crea al escribir, no al construir).
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// Ruta del archivo.
    pub fn path(&self) -> PathBuf {
        self.dir.join("secrets.json")
    }

    /// Nombres guardados (sin valores).
    pub fn names(&self) -> Vec<String> {
        self.read_file()
            .map(|file| file.entries.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// Lee un secreto, o `None` si no está guardado.
    pub fn get(&self, name: &str) -> Result<Option<String>> {
        Ok(self.get_all()?.remove(name))
    }

    /// Lee todos los secretos de una vez (una sola lectura del
    /// archivo, para no repetir el aviso de Linux por cada nombre).
    pub fn get_all(&self) -> Result<BTreeMap<String, String>> {
        let file = self.read_file()?;
        let mut out = BTreeMap::new();
        for (name, encoded) in &file.entries {
            out.insert(name.clone(), protect::unprotect(encoded)?);
        }
        Ok(out)
    }

    /// Guarda (o sustituye) un secreto. El archivo se escribe de
    /// forma atómica (temporal + renombrar) y con permisos 0600 en
    /// Unix.
    pub fn set(&self, name: &str, value: &str) -> Result<()> {
        if !SECRET_NAMES.contains(&name) {
            bail!("nombre de secreto no admitido: {name}");
        }
        if value.is_empty() {
            bail!("el secreto no puede estar vacío");
        }
        let mut file = self.read_file()?;
        file.version = 1;
        file.dpapi = cfg!(windows);
        file.entries
            .insert(name.to_string(), protect::protect(value)?);
        self.write_file(&file)
    }

    fn read_file(&self) -> Result<SecretsFile> {
        let path = self.path();
        if !path.exists() {
            return Ok(SecretsFile {
                version: 1,
                dpapi: cfg!(windows),
                entries: BTreeMap::new(),
            });
        }
        let text =
            std::fs::read_to_string(&path).with_context(|| format!("leer {}", path.display()))?;
        let file: SecretsFile = serde_json::from_str(&text)
            .with_context(|| format!("el archivo de secretos {} es inválido", path.display()))?;
        if file.dpapi && !cfg!(windows) {
            bail!(
                "el archivo de secretos {} está cifrado con DPAPI y no se puede leer en Linux",
                path.display()
            );
        }
        if !file.dpapi && !cfg!(windows) {
            tracing::warn!(
                path = %path.display(),
                "archivo de secretos sin DPAPI (solo desarrollo en Linux)"
            );
        }
        Ok(file)
    }

    fn write_file(&self, file: &SecretsFile) -> Result<()> {
        std::fs::create_dir_all(&self.dir)
            .with_context(|| format!("crear {}", self.dir.display()))?;
        let text = serde_json::to_string_pretty(file)?;
        let path = self.path();
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, text)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
        }
        std::fs::rename(&tmp, &path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }
}

/// Protección del valor: DPAPI en Windows, base64 en claro en Linux.
mod protect {
    use super::*;

    #[cfg(windows)]
    pub fn protect(value: &str) -> Result<String> {
        use windows_sys::Win32::Foundation::LocalFree;
        use windows_sys::Win32::Security::Cryptography::{
            CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, DATA_BLOB,
        };
        let input = DATA_BLOB {
            cbData: value.len() as u32,
            pbData: value.as_ptr() as *mut u8,
        };
        let mut output = DATA_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            bail!("DPAPI no pudo cifrar el secreto");
        }
        let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
        let encoded = BASE64.encode(bytes);
        unsafe {
            LocalFree(output.pbData as isize);
        }
        Ok(encoded)
    }

    #[cfg(windows)]
    pub fn unprotect(encoded: &str) -> Result<String> {
        use windows_sys::Win32::Foundation::LocalFree;
        use windows_sys::Win32::Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, DATA_BLOB,
        };
        let bytes = BASE64
            .decode(encoded)
            .context("secreto con base64 inválido")?;
        let input = DATA_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        };
        let mut output = DATA_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            bail!("DPAPI no pudo descifrar el secreto (otra cuenta o máquina)");
        }
        let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
        let value =
            String::from_utf8(bytes.to_vec()).context("secreto descifrado con UTF-8 inválido")?;
        unsafe {
            LocalFree(output.pbData as isize);
        }
        Ok(value)
    }

    #[cfg(not(windows))]
    pub fn protect(value: &str) -> Result<String> {
        Ok(BASE64.encode(value.as_bytes()))
    }

    #[cfg(not(windows))]
    pub fn unprotect(encoded: &str) -> Result<String> {
        let bytes = BASE64
            .decode(encoded)
            .context("secreto con base64 inválido")?;
        String::from_utf8(bytes).context("secreto con UTF-8 inválido")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("logmaster-secrets-test-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn round_trip_and_names() {
        let store = SecretsStore::new(dir("roundtrip"));
        assert!(!store.path().exists());
        assert_eq!(store.get("JWT_SECRET").unwrap(), None);
        store.set("JWT_SECRET", "secreto-largo-de-prueba").unwrap();
        assert!(store.path().exists());
        assert_eq!(
            store.get("JWT_SECRET").unwrap().as_deref(),
            Some("secreto-largo-de-prueba")
        );
        store
            .set(
                "ENCRYPTION_KEY",
                "1919191919191919191919191919191919191919191919191919191919191919",
            )
            .unwrap();
        assert_eq!(store.names(), vec!["ENCRYPTION_KEY", "JWT_SECRET"]);
        // Sustituir.
        store.set("JWT_SECRET", "otro").unwrap();
        assert_eq!(store.get("JWT_SECRET").unwrap().as_deref(), Some("otro"));
        // Nombre no admitido y vacío fallan.
        assert!(store.set("OTRO", "x").is_err());
        assert!(store.set("JWT_SECRET", "").is_err());
        let _ = std::fs::remove_dir_all(store.dir.clone());
    }

    #[test]
    fn dpapi_file_is_rejected_on_linux() {
        let store = SecretsStore::new(dir("dpapi"));
        std::fs::create_dir_all(&store.dir).unwrap();
        std::fs::write(
            store.path(),
            r#"{"version":1,"dpapi":true,"entries":{"JWT_SECRET":"AAAA"}}"#,
        )
        .unwrap();
        assert!(store.get("JWT_SECRET").is_err());
        let _ = std::fs::remove_dir_all(store.dir.clone());
    }

    #[test]
    fn invalid_file_is_an_error_not_a_default() {
        let store = SecretsStore::new(dir("invalid"));
        std::fs::create_dir_all(&store.dir).unwrap();
        std::fs::write(store.path(), "no-json").unwrap();
        assert!(store.get("JWT_SECRET").is_err());
        let _ = std::fs::remove_dir_all(store.dir.clone());
    }
}
