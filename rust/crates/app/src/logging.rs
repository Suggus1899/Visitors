//! Registro en archivo con rotación (fase 6; documento §14.3).
//!
//! Consola + archivo `logmaster.log` en `<datos>/logs`
//! (`LOGMASTER_LOG_DIR`): rotación propia, 3 archivos de 10 MiB
//! (`logmaster.log`, `.1`, `.2`), como los 3 archivos de Compose.
//! Sin query strings ni secretos en los logs: lo que se registra
//! son mensajes y rutas sin query; las contraseñas y claves nunca
//! se escriben en un log.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use tracing_subscriber::fmt::MakeWriter;

/// Tamaño máximo por archivo de log (10 MiB).
pub const MAX_LOG_BYTES: u64 = 10 * 1024 * 1024;
/// Archivos rotados que se conservan (además del actual).
pub const KEEP_ROTATED: usize = 2;

/// Escritor con rotación: `logmaster.log`, `.1`, `.2`.
struct RotatingFileWriter {
    dir: PathBuf,
    current: Option<File>,
    written: u64,
}

impl RotatingFileWriter {
    fn new(dir: &Path) -> Result<Self> {
        fs::create_dir_all(dir)?;
        let path = dir.join("logmaster.log");
        let written = fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
        let current = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .with_context(|| format!("abrir {}", path.display()))?;
        Ok(Self {
            dir: dir.to_path_buf(),
            current: Some(current),
            written,
        })
    }

    fn rotate(&mut self) -> io::Result<()> {
        // Cerrar el archivo actual antes de renombrar (en Windows
        // no se puede renombrar un archivo abierto para escribir).
        self.current.take();
        let _ = fs::remove_file(self.dir.join("logmaster.log.2"));
        for i in (1..KEEP_ROTATED).rev() {
            let from = self.dir.join(format!("logmaster.log.{i}"));
            if from.exists() {
                let _ = fs::rename(&from, self.dir.join(format!("logmaster.log.{}", i + 1)));
            }
        }
        let _ = fs::rename(
            self.dir.join("logmaster.log"),
            self.dir.join("logmaster.log.1"),
        );
        self.current = Some(
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.dir.join("logmaster.log"))?,
        );
        self.written = 0;
        Ok(())
    }
}

impl Write for RotatingFileWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.written + buf.len() as u64 > MAX_LOG_BYTES {
            self.rotate()?;
        }
        let written = self
            .current
            .as_mut()
            .expect("archivo de log abierto")
            .write(buf)?;
        self.written += written as u64;
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        match self.current.as_mut() {
            Some(file) => file.flush(),
            None => Ok(()),
        }
    }
}

/// Consola + archivo, compartido entre hilos.
#[derive(Clone)]
pub struct LogWriter {
    file: Arc<Mutex<RotatingFileWriter>>,
}

impl Write for LogWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let _ = io::stdout().write_all(buf);
        let _ = io::stdout().flush();
        let mut file = self.file.lock().expect("lock de logs");
        file.write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.lock().expect("lock de logs").flush()
    }
}

impl<'a> MakeWriter<'a> for LogWriter {
    type Writer = Self;

    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

/// Inicializa el registro: consola + archivo con rotación. Si el
/// archivo no se puede abrir, el llamador usa solo consola.
pub fn init(log_dir: &Path) -> Result<()> {
    let writer = LogWriter {
        file: Arc::new(Mutex::new(RotatingFileWriter::new(log_dir)?)),
    };
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_writer(writer)
        .try_init()
        .map_err(|e| anyhow::anyhow!("iniciar registro: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_keeps_three_files() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("logging-tests");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let mut writer = RotatingFileWriter::new(&dir).unwrap();
        // Escribir más de 10 MiB en trozos de 1 MiB: debe rotar.
        let chunk = vec![b'x'; 1024 * 1024];
        for _ in 0..11 {
            writer.write_all(&chunk).unwrap();
        }
        writer.flush().unwrap();
        assert!(dir.join("logmaster.log").exists());
        assert!(dir.join("logmaster.log.1").exists());
        assert!(!dir.join("logmaster.log.3").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
