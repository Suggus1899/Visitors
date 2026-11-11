//! TLS con rustls (fase 6; documento §14.4, §15).
//!
//! `serve` escucha en HTTPS por defecto (`tls = true` en el
//! config, `https://localhost:8443`): certificado autofirmado para
//! `localhost` / `127.0.0.1`, generado con rcgen y guardado en
//! `tls_dir` (`cert.pem`/`key.pem`, clave 0600), reutilizado en
//! cada arranque. Con `tls_cert`/`tls_key` se usan los propios.
//! La huella SHA-256 del certificado queda en el log de arranque.
//! `tls = false` (`LOGMASTER_TLS`) mantiene HTTP plano para
//! desarrollo.

use std::fs;
use std::net::IpAddr;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use rcgen::{CertificateParams, SanType};
use sha2::{Digest, Sha256};

/// Certificado y clave listos para el servidor.
#[derive(Debug, Clone)]
pub struct TlsMaterial {
    pub cert_path: PathBuf,
    pub key_path: PathBuf,
    /// Huella SHA-256 del certificado (DER), para el log.
    pub fingerprint: String,
    /// `true` si se generó ahora; `false` si se reutilizó.
    pub generated: bool,
}

/// Estado TLS sin generar nada (para `check`): `None` si está
/// desactivado o si aún no hay certificado (se genera al arrancar).
pub fn status(config: &crate::config::Config) -> Result<Option<TlsMaterial>> {
    if !config.tls_enabled {
        return Ok(None);
    }
    let (cert_path, key_path) = match (&config.tls_cert, &config.tls_key) {
        (Some(cert), Some(key)) => (cert.clone(), key.clone()),
        _ => (
            config.tls_dir.join("cert.pem"),
            config.tls_dir.join("key.pem"),
        ),
    };
    if !cert_path.exists() || !key_path.exists() {
        return Ok(None);
    }
    Ok(Some(TlsMaterial {
        fingerprint: fingerprint_of(&cert_path)?,
        cert_path,
        key_path,
        generated: false,
    }))
}

/// Resuelve el material TLS: `None` si `tls_enabled` es falso.
pub fn load_or_generate(config: &crate::config::Config) -> Result<Option<TlsMaterial>> {
    if !config.tls_enabled {
        return Ok(None);
    }
    let (cert_path, key_path) = match (&config.tls_cert, &config.tls_key) {
        (Some(cert), Some(key)) => (cert.clone(), key.clone()),
        _ => (
            config.tls_dir.join("cert.pem"),
            config.tls_dir.join("key.pem"),
        ),
    };
    if cert_path.exists() && key_path.exists() {
        let fingerprint = fingerprint_of(&cert_path)?;
        return Ok(Some(TlsMaterial {
            cert_path,
            key_path,
            fingerprint,
            generated: false,
        }));
    }
    // Generar autofirmado (ECDSA P-256, rcgen).
    fs::create_dir_all(&config.tls_dir)?;
    let mut params = CertificateParams::new(vec!["localhost".to_string()])?;
    params.subject_alt_names = vec![
        SanType::DnsName("localhost".try_into()?),
        SanType::IpAddress(IpAddr::from([127, 0, 0, 1])),
    ];
    let signing_key = rcgen::KeyPair::generate()?;
    let cert = params.self_signed(&signing_key)?;
    let cert_pem = cert.pem();
    let key_pem = signing_key.serialize_pem();
    let der = cert.der().to_vec();
    fs::write(&cert_path, &cert_pem)?;
    fs::write(&key_path, &key_pem)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600));
        let _ = fs::set_permissions(&cert_path, fs::Permissions::from_mode(0o644));
    }
    Ok(Some(TlsMaterial {
        cert_path,
        key_path,
        fingerprint: hex::encode(Sha256::digest(&der)),
        generated: true,
    }))
}

/// Huella SHA-256 (DER) del primer certificado de un PEM.
fn fingerprint_of(cert_path: &Path) -> Result<String> {
    let pem = fs::read_to_string(cert_path)?;
    let mut reader = std::io::Cursor::new(pem.into_bytes());
    let certs = rustls_pemfile::certs(&mut reader).collect::<Result<Vec<_>, _>>()?;
    let first = certs.into_iter().next().context("certificado vacío")?;
    Ok(hex::encode(Sha256::digest(first.as_ref())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    #[test]
    fn self_signed_is_generated_once_and_reused() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("tls-tests");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let mut config = Config::fixture();
        config.tls_enabled = true;
        config.tls_dir = dir.clone();
        let first = load_or_generate(&config).unwrap().unwrap();
        assert!(first.generated);
        assert_eq!(first.fingerprint.len(), 64);
        assert!(first.cert_path.exists());
        assert!(first.key_path.exists());
        let second = load_or_generate(&config).unwrap().unwrap();
        assert!(!second.generated);
        assert_eq!(second.fingerprint, first.fingerprint);
    }

    #[test]
    fn tls_disabled_returns_none() {
        let mut config = Config::fixture();
        config.tls_enabled = false;
        assert!(load_or_generate(&config).unwrap().is_none());
    }
}
