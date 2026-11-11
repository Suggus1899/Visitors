//! Servicio de Windows (SCM).
//!
//! El mismo .exe es el servicio: `service install` registra el binario
//! con `service run` como punto de entrada del SCM. Sin ese argumento,
//! el binario es la consola y el CLI de siempre (documento, seccion 13).
//!
//! Arranque automatico retrasado, para no competir con el arranque del
//! sistema. Al recibir Stop, el servicio deja de aceptar conexiones y
//! espera las tareas en curso: el mismo apagado ordenado que hoy hace Go.
//!
//! Pendiente para la fase de operacion: cuenta virtual
//! `NT SERVICE\LogMaster`, permisos NTFS de la carpeta de datos y
//! acciones de recuperacion (hoy se configuran con
//! `sc.exe failure LogMaster reset= 86400 actions= restart/5000/restart/5000//`).

use anyhow::Result;

/// Acciones de `logmaster service <accion>`.
#[derive(clap::Subcommand, Clone, Copy, Debug)]
pub enum ServiceAction {
    /// Instala el servicio (arranque automatico retrasado).
    Install,
    /// Retira el servicio; conserva datos, configuracion y respaldos.
    Uninstall,
    /// Arranca el servicio.
    Start,
    /// Detiene el servicio.
    Stop,
    /// Reinicia el servicio.
    Restart,
    /// Punto de entrada interno que usa el SCM para correr el servicio.
    Run,
}

#[cfg(windows)]
pub fn run_action(action: ServiceAction) -> Result<()> {
    imp::run_action(action)
}

#[cfg(not(windows))]
pub fn run_action(_action: ServiceAction) -> Result<()> {
    anyhow::bail!(
        "el servicio de Windows solo existe en Windows; en este sistema usa `logmaster serve`"
    )
}

#[cfg(windows)]
mod imp {
    use super::ServiceAction;
    use anyhow::{Context, Result};
    use std::ffi::{OsStr, OsString};
    use std::sync::Arc;
    use std::time::Duration;
    use windows_service::{
        service::{
            ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl,
            ServiceExitCode, ServiceInfo, ServiceStartType, ServiceState, ServiceStatus,
            ServiceType,
        },
        service_control_handler::{self, ServiceControlHandlerResult},
        service_dispatcher,
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    pub const SERVICE_NAME: &str = "LogMaster";
    const SERVICE_DISPLAY_NAME: &str = "LogMaster - Control de visitantes";

    pub fn run_action(action: ServiceAction) -> Result<()> {
        match action {
            ServiceAction::Install => install(),
            ServiceAction::Uninstall => uninstall(),
            ServiceAction::Start => control(ServiceAction::Start),
            ServiceAction::Stop => control(ServiceAction::Stop),
            ServiceAction::Restart => {
                control(ServiceAction::Stop)?;
                control(ServiceAction::Start)
            }
            ServiceAction::Run => run(),
        }
    }

    fn manager() -> Result<ServiceManager> {
        ServiceManager::local_computer(
            None::<&str>,
            ServiceManagerAccess::CONNECT
                | ServiceManagerAccess::CREATE_SERVICE
                | ServiceManagerAccess::ENUMERATE_SERVICE,
        )
        .context("abrir el Service Control Manager")
    }

    fn install() -> Result<()> {
        // El servicio debe instalarse desde el disco C:; si el .exe
        // no está allí, se ofrece copiarlo y se aborta indicando que
        // se repita la instalación desde la copia.
        crate::first_run::ensure_service_location()?;
        let manager = manager()?;
        let exe = std::env::current_exe().context("ruta del ejecutable")?;
        let info = ServiceInfo {
            name: SERVICE_NAME.into(),
            display_name: SERVICE_DISPLAY_NAME.into(),
            service_type: ServiceType::OWN_PROCESS,
            start_type: ServiceStartType::AutoStart,
            error_control: ServiceErrorControl::Normal,
            executable_path: exe,
            launch_arguments: vec![OsString::from("service"), OsString::from("run")],
            dependencies: vec![],
            account_name: None,
            account_password: None,
        };
        let service = manager
            .create_service(&info, ServiceAccess::CHANGE_CONFIG | ServiceAccess::START)
            .context("crear el servicio LogMaster")?;
        // Arranque automatico retrasado: windows-service 0.7 no tiene
        // variante de inicio retrasado; se activa aparte sobre el
        // servicio recien creado.
        service
            .set_delayed_auto_start(true)
            .context("activar arranque automatico retrasado")?;
        tracing::info!("servicio LogMaster instalado (arranque automatico retrasado)");
        Ok(())
    }

    fn uninstall() -> Result<()> {
        let manager = manager()?;
        let service = manager
            .open_service(
                SERVICE_NAME,
                ServiceAccess::DELETE | ServiceAccess::STOP | ServiceAccess::QUERY_STATUS,
            )
            .context("abrir el servicio LogMaster")?;
        if let Ok(status) = service.query_status() {
            if status.current_state != ServiceState::Stopped {
                let _ = service.stop();
            }
        }
        service.delete().context("eliminar el servicio LogMaster")?;
        tracing::info!("servicio LogMaster eliminado (datos y respaldos intactos)");
        Ok(())
    }

    fn control(action: ServiceAction) -> Result<()> {
        let manager = manager()?;
        let access = match action {
            ServiceAction::Start => ServiceAccess::START | ServiceAccess::QUERY_STATUS,
            ServiceAction::Stop => ServiceAccess::STOP | ServiceAccess::QUERY_STATUS,
            _ => unreachable!("control solo admite Start o Stop"),
        };
        let service = manager
            .open_service(SERVICE_NAME, access)
            .context("abrir el servicio LogMaster")?;
        match action {
            ServiceAction::Start => service
                .start::<&OsStr>(&[])
                .context("arrancar el servicio LogMaster")?,
            ServiceAction::Stop => {
                let _ = service.stop().context("detener el servicio LogMaster")?;
            }
            _ => unreachable!("control solo admite Start o Stop"),
        }
        Ok(())
    }

    // Punto de entrada del SCM. Solo el SCM debe lanzar este comando.
    // La macro genera el `extern "system" fn` que exige el SCM y lo
    // conecta con `service_main`.
    windows_service::define_windows_service!(ffi_service_main, service_main);

    fn run() -> Result<()> {
        service_dispatcher::start(SERVICE_NAME, ffi_service_main)
            .context("arrancar el despachador del servicio")
    }

    fn service_main(_arguments: Vec<OsString>) {
        if let Err(e) = service_main_inner() {
            tracing::error!(error = %e, "el servicio termino con error");
        }
    }

    fn service_main_inner() -> Result<(), windows_service::Error> {
        let shutdown = Arc::new(tokio::sync::Notify::new());
        let shutdown_handler = Arc::clone(&shutdown);
        let handler = move |control: ServiceControl| -> ServiceControlHandlerResult {
            match control {
                ServiceControl::Stop | ServiceControl::Shutdown => {
                    shutdown_handler.notify_one();
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };
        let status_handle = service_control_handler::register(SERVICE_NAME, handler)?;
        status_handle.set_service_status(mk_status(
            ServiceState::StartPending,
            ServiceControlAccept::empty(),
        ))?;

        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|e| {
                windows_service::Error::Winapi(std::io::Error::new(std::io::ErrorKind::Other, e))
            })?;

        status_handle.set_service_status(mk_status(
            ServiceState::Running,
            ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        ))?;

        let shutdown_future = async move { shutdown.notified().await };
        let result = runtime.block_on(crate::serve_with_shutdown(shutdown_future));

        status_handle.set_service_status(mk_status(
            ServiceState::Stopped,
            ServiceControlAccept::empty(),
        ))?;

        result.map_err(|e| {
            windows_service::Error::Winapi(std::io::Error::new(std::io::ErrorKind::Other, e))
        })
    }

    fn mk_status(state: ServiceState, accepted: ServiceControlAccept) -> ServiceStatus {
        ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: state,
            controls_accepted: accepted,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::from_secs(10),
            process_id: None,
        }
    }
}
