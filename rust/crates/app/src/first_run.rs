//! Primer arranque: ubicar el .exe en el disco C: y crear el acceso
//! directo del escritorio.
//!
//! Flujo decidido por Gustavo:
//! - Si el .exe no está en una carpeta del disco C: (Descargas,
//!   escritorio, USB...), se avisa en consola y se ofrece copiarlo a
//!   `C:\LogMaster` (o a la carpeta de `[install] folder`) con
//!   confirmación. La copia lleva también el `config.toml` junto al
//!   .exe, si existe, para que configuración, base y servicio apunten
//!   siempre a la misma ubicación estable.
//! - Tras quedar en C:, el ejecutable crea `LogMaster.lnk` en el
//!   escritorio. También al instalar el servicio (`service install`).
//!   No se duplica si ya existe.
//!
//! Qué hace el acceso directo (decisión): apunta al propio .exe
//! (`C:\LogMaster\logmaster.exe`). Se valoró que abriera la interfaz
//! web (`https://localhost:8443`), pero la crate `mslnk` 0.1.8 exige
//! que el destino exista en disco (`fs::metadata` + `canonicalize`),
//! así que un destino URL no se puede construir limpiamente con
//! ella; apuntar al .exe es la alternativa prevista. Al hacer doble
//! clic se arranca el servidor en consola; la interfaz web queda en
//! `https://localhost:8443` una vez en marcha. Si el servicio ya está
//! instalado, la página se abre directamente en el navegador.
//!
//! La creación real del .lnk solo está verificada con
//! `cargo check --target x86_64-pc-windows-msvc` y con pruebas
//! unitarias de la lógica de rutas: queda pendiente probarla en el
//! PC de Gustavo.

use std::io::IsTerminal;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use anyhow::bail;
use anyhow::{Context, Result};

/// Carpeta de instalación por defecto en el disco C:.
/// Solo Windows: en Linux no hay disco C: que ubicar.
#[cfg(windows)]
pub const DEFAULT_INSTALL_FOLDER: &str = r"C:\LogMaster";

/// Nombre del acceso directo en el escritorio.
#[cfg(windows)]
pub const SHORTCUT_NAME: &str = "LogMaster.lnk";

/// Resultado de la comprobación de primer arranque en `serve`.
pub enum FirstRunOutcome {
    /// Seguir con el arranque normal.
    Continue,
    /// El .exe se copió a otra carpeta: el proceso debe terminar e
    /// indicar que se ejecute desde allí.
    Relocated(PathBuf),
}

/// Letra de unidad de una ruta Windows (`C:\...` o `c:/...`), si la
/// tiene. Función pura, testeable en Linux.
pub fn drive_of(path: &Path) -> Option<char> {
    let text = path.to_string_lossy();
    let mut chars = text.chars();
    let drive = chars.next()?;
    if chars.next() == Some(':') && drive.is_ascii_alphabetic() {
        Some(drive.to_ascii_uppercase())
    } else {
        None
    }
}

/// ¿Hay que reubicar el .exe? Solo cuando tiene unidad distinta de
/// C:. Una ruta sin unidad (Linux, o ruta relativa) no se reubica.
pub fn needs_relocation(exe_path: &Path) -> bool {
    matches!(drive_of(exe_path), Some(drive) if drive != 'C')
}

/// Carpeta del escritorio a partir del perfil del usuario
/// (`%USERPROFILE%\Desktop`). Función pura, testeable.
#[cfg(windows)]
pub fn desktop_dir_from_profile(profile: Option<&str>) -> Option<PathBuf> {
    profile.map(|p| Path::new(p).join("Desktop"))
}

/// Carpeta del escritorio en este sistema.
#[cfg(windows)]
pub fn desktop_dir() -> Option<PathBuf> {
    desktop_dir_from_profile(std::env::var("USERPROFILE").ok().as_deref())
}

/// Ruta del acceso directo en un escritorio dado.
#[cfg(windows)]
pub fn shortcut_path(desktop: &Path) -> PathBuf {
    desktop.join(SHORTCUT_NAME)
}

/// ¿Acepta la respuesta la reubicación? (`s`, `sí`, `y`, `yes`...)
pub fn accepts_answer(input: &str) -> bool {
    matches!(
        input.trim().to_lowercase().as_str(),
        "s" | "si" | "sí" | "y" | "yes"
    )
}

/// Pregunta en consola si se copia el .exe a la carpeta dada.
/// Devuelve `false` si la entrada no es un terminal (no se puede
/// preguntar) o si la respuesta no es afirmativa.
pub fn prompt_relocate(folder: &Path) -> bool {
    use std::io::Write;
    println!("LogMaster está en una carpeta fuera del disco C:.");
    println!(
        "Para que la configuración, la base y el servicio apunten siempre a la misma ubicación, alójalo en {}.",
        folder.display()
    );
    print!("¿Copiar logmaster.exe a {}? [s/N] ", folder.display());
    let _ = std::io::stdout().flush();
    let mut line = String::new();
    if std::io::stdin().read_line(&mut line).is_err() {
        return false;
    }
    accepts_answer(&line)
}

/// Copia el .exe (y el `config.toml` junto a él, si existe) a la
/// carpeta de instalación. Devuelve la ruta del .exe copiado.
pub fn relocate(exe: &Path, folder: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(folder)
        .with_context(|| format!("crear la carpeta {}", folder.display()))?;
    let name = exe
        .file_name()
        .context("el ejecutable no tiene nombre de archivo")?;
    let target = folder.join(name);
    std::fs::copy(exe, &target)
        .with_context(|| format!("copiar {} a {}", exe.display(), target.display()))?;
    if let Some(dir) = exe.parent() {
        let config = dir.join("config.toml");
        if config.is_file() {
            std::fs::copy(&config, folder.join("config.toml"))
                .with_context(|| "copiar config.toml junto al .exe".to_string())?;
        }
    }
    Ok(target)
}

/// Crea el acceso directo del escritorio apuntando al .exe.
/// Devuelve `true` si lo creó, `false` si ya existía (no se duplica)
/// o si no hay escritorio conocido. Un fallo al crearlo es un error:
/// el arranque no debe seguir como si el acceso existiera.
#[cfg(windows)]
pub fn create_desktop_shortcut(exe: &Path) -> Result<bool> {
    let Some(desktop) = desktop_dir() else {
        tracing::warn!("sin carpeta de escritorio conocida; no se crea el acceso directo");
        return Ok(false);
    };
    let lnk = shortcut_path(&desktop);
    if lnk.exists() {
        return Ok(false);
    }
    mslnk::ShellLink::new(exe)
        .and_then(|link| link.create_lnk(&lnk))
        .with_context(|| format!("crear el acceso directo {}", lnk.display()))?;
    tracing::info!(shortcut = %lnk.display(), "acceso directo creado en el escritorio");
    Ok(true)
}

/// Fuera de Windows no hay acceso directo que crear.
#[cfg(not(windows))]
pub fn create_desktop_shortcut(_exe: &Path) -> Result<bool> {
    Ok(false)
}

/// Carpeta de instalación leída del `config.toml` junto al .exe, si
/// existe y trae `[install] folder`; si no, la carpeta por defecto.
/// Lectura tolerante: nunca falla, solo usa el defecto. Solo la usa
/// `service install` (Windows).
#[cfg(windows)]
pub fn install_folder_for(exe: &Path) -> PathBuf {
    #[derive(serde::Deserialize)]
    struct InstallFile {
        #[serde(default)]
        install: Option<InstallSection>,
    }
    #[derive(serde::Deserialize)]
    struct InstallSection {
        folder: Option<String>,
    }
    let Some(dir) = exe.parent() else {
        return PathBuf::from(DEFAULT_INSTALL_FOLDER);
    };
    let Ok(text) = std::fs::read_to_string(dir.join("config.toml")) else {
        return PathBuf::from(DEFAULT_INSTALL_FOLDER);
    };
    let Ok(parsed) = toml::from_str::<InstallFile>(&text) else {
        return PathBuf::from(DEFAULT_INSTALL_FOLDER);
    };
    parsed
        .install
        .and_then(|section| section.folder)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_INSTALL_FOLDER))
}

/// Comprobación de primer arranque para `serve`: reubica con
/// confirmación si el .exe no está en C: y crea el acceso directo
/// cuando ya está ubicado. Sin terminal, solo avisa y sigue.
pub fn ensure_first_run(cfg: &crate::config::Config) -> Result<FirstRunOutcome> {
    let exe = std::env::current_exe().context("ruta del ejecutable")?;
    if !needs_relocation(&exe) {
        if cfg.desktop_shortcut {
            // El acceso directo es un extra: si no se puede crear,
            // se avisa y el arranque sigue.
            if let Err(e) = create_desktop_shortcut(&exe) {
                tracing::warn!(error = %e, "no se pudo crear el acceso directo del escritorio");
            }
        }
        return Ok(FirstRunOutcome::Continue);
    }
    let folder = PathBuf::from(&cfg.install_folder);
    if !std::io::stdin().is_terminal() {
        tracing::warn!(
            exe = %exe.display(),
            folder = %folder.display(),
            "logmaster.exe no está en el disco C:; se recomienda alojarlo en la carpeta indicada"
        );
        return Ok(FirstRunOutcome::Continue);
    }
    if prompt_relocate(&folder) {
        let target = relocate(&exe, &folder)?;
        return Ok(FirstRunOutcome::Relocated(target));
    }
    tracing::warn!(
        folder = %folder.display(),
        "se sigue desde la ubicación actual; la configuración, la base y el servicio pueden no coincidir"
    );
    Ok(FirstRunOutcome::Continue)
}

/// Comprobación de primer arranque para `service install`: el
/// servicio debe instalarse desde el disco C:. Si el .exe no está
/// allí, ofrece copiarlo y aborta indicando que se repita la
/// instalación desde la copia; si ya está, crea el acceso directo.
#[cfg(windows)]
pub fn ensure_service_location() -> Result<()> {
    let exe = std::env::current_exe().context("ruta del ejecutable")?;
    if !needs_relocation(&exe) {
        if let Err(e) = create_desktop_shortcut(&exe) {
            tracing::warn!(error = %e, "no se pudo crear el acceso directo del escritorio");
        }
        return Ok(());
    }
    let folder = install_folder_for(&exe);
    if !std::io::stdin().is_terminal() {
        bail!(
            "logmaster.exe no está en el disco C:; cópialo a {} y ejecuta `service install` desde allí",
            folder.display()
        );
    }
    if prompt_relocate(&folder) {
        let target = relocate(&exe, &folder)?;
        bail!(
            "LogMaster se copió a {}; ejecuta `{} service install` desde allí",
            target.display(),
            target.display()
        );
    }
    bail!(
        "el servicio debe instalarse desde una carpeta del disco C: ({}); mueve el .exe y repite la instalación",
        folder.display()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drive_of_detects_windows_drives() {
        assert_eq!(
            drive_of(Path::new(r"C:\LogMaster\logmaster.exe")),
            Some('C')
        );
        assert_eq!(
            drive_of(Path::new(r"c:/LogMaster/logmaster.exe")),
            Some('C')
        );
        assert_eq!(
            drive_of(Path::new(r"D:\Descargas\logmaster.exe")),
            Some('D')
        );
        assert_eq!(drive_of(Path::new("/usr/bin/logmaster")), None);
        assert_eq!(drive_of(Path::new(r"LogMaster\logmaster.exe")), None);
    }

    #[test]
    fn needs_relocation_only_outside_c() {
        assert!(!needs_relocation(Path::new(r"C:\LogMaster\logmaster.exe")));
        assert!(needs_relocation(Path::new(r"D:\Descargas\logmaster.exe")));
        assert!(needs_relocation(Path::new(r"E:\logmaster.exe")));
        assert!(!needs_relocation(Path::new("/tmp/logmaster")));
    }

    #[test]
    #[cfg(windows)]
    fn desktop_dir_from_profile_uses_desktop() {
        assert_eq!(
            desktop_dir_from_profile(Some(r"C:\Users\Ana")),
            Some(PathBuf::from(r"C:\Users\Ana\Desktop"))
        );
        assert_eq!(desktop_dir_from_profile(None), None);
    }

    #[test]
    #[cfg(windows)]
    fn shortcut_path_is_logmaster_lnk() {
        assert_eq!(
            shortcut_path(Path::new(r"C:\Users\Ana\Desktop")),
            PathBuf::from(r"C:\Users\Ana\Desktop\LogMaster.lnk")
        );
    }

    #[test]
    fn accepts_answer_spanish_and_english() {
        for yes in ["s", "S", "si", "sí", "SÍ", "y", "yes", "  s  "] {
            assert!(accepts_answer(yes), "{yes} debe aceptarse");
        }
        for no in ["", "n", "no", "N", "quizas"] {
            assert!(!accepts_answer(no), "{no} debe rechazarse");
        }
    }

    #[test]
    fn relocate_copies_exe_and_config() {
        let dir = std::env::temp_dir().join("logmaster-first-run-test");
        let _ = std::fs::remove_dir_all(&dir);
        let from = dir.join("origen");
        let to = dir.join("destino");
        std::fs::create_dir_all(&from).unwrap();
        let exe = from.join("logmaster.exe");
        std::fs::write(&exe, b"falso-ejecutable").unwrap();
        std::fs::write(from.join("config.toml"), b"[server]\nport = 8443\n").unwrap();
        let target = relocate(&exe, &to).unwrap();
        assert_eq!(target, to.join("logmaster.exe"));
        assert_eq!(std::fs::read(&target).unwrap(), b"falso-ejecutable");
        assert_eq!(
            std::fs::read_to_string(to.join("config.toml")).unwrap(),
            "[server]\nport = 8443\n"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(windows)]
    fn install_folder_for_reads_toml_or_default() {
        let dir = std::env::temp_dir().join("logmaster-first-run-folder-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("logmaster.exe");
        std::fs::write(&exe, b"x").unwrap();
        assert_eq!(
            install_folder_for(&exe),
            PathBuf::from(DEFAULT_INSTALL_FOLDER)
        );
        std::fs::write(
            &exe.with_file_name("config.toml"),
            "[install]\nfolder = \"D:\\\\Apps\"\n",
        )
        .unwrap();
        assert_eq!(install_folder_for(&exe), PathBuf::from(r"D:\Apps"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
