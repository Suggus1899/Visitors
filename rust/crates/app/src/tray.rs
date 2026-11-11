//! Bandeja del sistema (fase 6; documento §14.3).
//!
//! `logmaster tray`: icono en el área de notificación con el estado
//! del servicio (consultado al SCM), menú para abrir la interfaz,
//! reiniciar el servicio y salir. El servidor y la bandeja son dos
//! modos del mismo ejecutable; la bandeja no sirve HTTP.
//!
//! Solo Windows: en otros sistemas el comando explica que no está
//! disponible. El comportamiento real (icono, menú, SCM) solo se
//! puede probar en Windows real y queda marcado como pendiente.

use anyhow::Result;

#[cfg(windows)]
pub fn run_tray() -> Result<()> {
    imp::run_tray()
}

#[cfg(not(windows))]
pub fn run_tray() -> Result<()> {
    anyhow::bail!("la bandeja del sistema solo está disponible en Windows")
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::time::Duration;
    use tray_icon::{Icon, Menu, MenuEvent, MenuItem, TrayIconBuilder};

    /// Icono 32x32 generado en código: cuadro verde con una `L`
    /// blanca (sin archivos externos, el ejecutable es único).
    fn icon() -> Result<Icon> {
        const SIZE: usize = 32;
        let mut rgba = vec![0u8; SIZE * SIZE * 4];
        for y in 0..SIZE {
            for x in 0..SIZE {
                let i = (y * SIZE + x) * 4;
                // Fondo verde oscuro, borde más claro.
                let (r, g, b) = if x == 0 || y == 0 || x == SIZE - 1 || y == SIZE - 1 {
                    (0x1e, 0x6b, 0x3a)
                } else {
                    (0x2e, 0x8b, 0x57)
                };
                rgba[i] = r;
                rgba[i + 1] = g;
                rgba[i + 2] = b;
                rgba[i + 3] = 0xff;
            }
        }
        // `L` blanca, 5x7, centrada.
        const GLYPH: [[u8; 5]; 7] = [
            [1, 0, 0, 0, 0],
            [1, 0, 0, 0, 0],
            [1, 0, 0, 0, 0],
            [1, 0, 0, 0, 0],
            [1, 0, 0, 0, 0],
            [1, 0, 0, 0, 0],
            [1, 1, 1, 1, 1],
        ];
        for (gy, row) in GLYPH.iter().enumerate() {
            for (gx, pixel) in row.iter().enumerate() {
                if *pixel == 1 {
                    let x = 13 + gx;
                    let y = 12 + gy;
                    let i = (y * SIZE + x) * 4;
                    rgba[i] = 0xff;
                    rgba[i + 1] = 0xff;
                    rgba[i + 2] = 0xff;
                }
            }
        }
        Ok(Icon::from_rgba(rgba, SIZE as u32, SIZE as u32)?)
    }

    fn tooltip() -> String {
        format!("LogMaster — servicio {}", crate::service::service_state())
    }

    /// URL de la interfaz: la del config si se puede cargar, si no
    /// `APP_URL` o el valor por defecto.
    fn app_url() -> String {
        crate::config::Config::load()
            .map(|cfg| cfg.app_url)
            .unwrap_or_else(|_| {
                std::env::var("APP_URL")
                    .ok()
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| "https://localhost:8443".to_string())
            })
    }

    pub fn run_tray() -> Result<()> {
        let open_item = MenuItem::new("Abrir interfaz", true, None);
        let restart = MenuItem::new("Reiniciar servicio", true, None);
        let quit = MenuItem::new("Salir", true, None);
        let menu = Menu::new();
        let items: [&dyn tray_icon::menu::IsMenuItem; 3] = [&open_item, &restart, &quit];
        menu.append_items(&items)?;
        let icon = icon()?;
        let tray = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip(tooltip())
            .with_icon(icon)
            .build()?;
        tracing::info!("bandeja de LogMaster activa");
        let receiver = MenuEvent::receiver();
        let mut ticks: u32 = 0;
        loop {
            match receiver.recv_timeout(Duration::from_secs(5)) {
                Ok(event) => {
                    if event.id == open_item.id() {
                        if let Err(e) = open::that(app_url()) {
                            tracing::error!(error = %e, "no se pudo abrir la interfaz");
                        }
                    } else if event.id == restart.id() {
                        match crate::service::restart_service() {
                            Ok(()) => {
                                tracing::info!("servicio reiniciado desde la bandeja")
                            }
                            Err(e) => {
                                tracing::error!(error = %e, "reinicio del servicio fallido")
                            }
                        }
                    } else if event.id == quit.id() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Refrescar el estado del servicio cada ~30 s.
                    ticks += 1;
                    if ticks % 6 == 0 {
                        tray.set_tooltip(Some(tooltip()))?;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        Ok(())
    }
}
