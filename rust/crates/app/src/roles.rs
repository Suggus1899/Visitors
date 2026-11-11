//! Roles y permisos como extractores de Axum.
//!
//! Traduccion de la linea base, seccion 3 (tabla de autorizacion),
//! de `roles()` en `server-go/internal/httpapi/auth.go` y de los
//! `roles(...)` de cada familia de rutas (`audit.go`, `backups.go`,
//! `privacy.go`, `users.go`, `visitors.go`, `visits.go`).
//!
//! La regla de oro se mantiene: el cliente nunca decide permisos. El
//! handler (o su ruta) declara el permiso que necesita y no se ejecuta
//! si la sesion no lo cumple. El rol `demo` conserva su vista guiada
//! sin escrituras de dominio: solo tiene el permiso de lectura.

use axum::{
    extract::{FromRequestParts, Request, State},
    http::{request::Parts, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};

use crate::error;
use crate::session::Session;

/// Roles de cuenta, con los mismos nombres que Go.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Role {
    Root,
    Admin,
    Operador,
    Auditor,
    Demo,
}

impl Role {
    /// Parsea el rol guardado; un valor desconocido no concede nada.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "root" => Some(Role::Root),
            "admin" => Some(Role::Admin),
            "operador" => Some(Role::Operador),
            "auditor" => Some(Role::Auditor),
            "demo" => Some(Role::Demo),
            _ => None,
        }
    }
}

/// Permisos de dominio (linea base, seccion 3). Cada ruta de la fase 4
/// declara uno de estos; la tabla de `allows` es la traduccion de los
/// `roles(...)` de Go.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Permission {
    /// Consultar visitas, perfiles, reportes, fotos y eventos: sesion
    /// vigente, con las restricciones aplicables.
    Read,
    /// Registrar, admitir, cancelar una visita en espera y moverla por
    /// su ciclo.
    RegisterVisit,
    /// Editar perfil/fotos o rectificar (con contrasena adicional en
    /// cada guardado).
    EditProfile,
    /// Bloquear / desbloquear visitantes (con contrasena adicional).
    BlockVisitor,
    /// Crear solicitud ARCO u oposicion.
    CreateArco,
    /// Consultar solicitudes o datos del titular.
    ReadArco,
    /// Cambiar estado de solicitudes o cancelar datos.
    ManageArco,
    /// Auditoria general.
    ReadAudit,
    /// Respaldos por HTTP.
    ManageBackups,
    /// Cuentas, reset administrativo y auditoria del panel root.
    ManageAccounts,
}

/// Tabla de autorizacion (linea base, seccion 3): `true` si el rol
/// tiene el permiso. El rol `demo` solo lee.
pub fn allows(role: Role, permission: Permission) -> bool {
    use Permission::*;
    match permission {
        Read => true,
        RegisterVisit | EditProfile | CreateArco => {
            matches!(role, Role::Operador | Role::Admin | Role::Root)
        }
        BlockVisitor | ManageArco | ManageBackups => {
            matches!(role, Role::Admin | Role::Root)
        }
        ReadArco | ReadAudit => {
            matches!(role, Role::Admin | Role::Root | Role::Auditor)
        }
        ManageAccounts => matches!(role, Role::Root),
    }
}

/// Comprueba el permiso de una sesion ya validada. Devuelve el fallo
/// 403 de Go (`FORBIDDEN`, "No tienes permiso para esta operación")
/// cuando no lo tiene, para usarlo dentro de un handler cuando el
/// permiso depende del cuerpo (como `isBlocked` en `editVisitor`).
pub fn authorize(
    session: &Session,
    permission: Permission,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let role = Role::parse(&session.role).ok_or_else(|| {
        error::fail(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "No tienes permiso para esta operación",
        )
    })?;
    if allows(role, permission) {
        Ok(())
    } else {
        Err(error::fail(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "No tienes permiso para esta operación",
        ))
    }
}

/// Capa de Axum que exige un permiso: el handler no se ejecuta si la
/// sesion (puesta en las extensiones por la capa de sesion) no lo
/// cumple. Sin sesion, 401; sin permiso, 403. Se instala con
/// `middleware::from_fn_with_state(permiso, require_permission)`.
pub async fn require_permission(
    State(permission): State<Permission>,
    request: Request,
    next: Next,
) -> Response {
    let session = request.extensions().get::<Session>().cloned();
    let session = match session {
        Some(session) => session,
        None => {
            return error::fail(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "Sesión requerida")
                .into_response();
        }
    };
    match authorize(&session, permission) {
        Ok(()) => next.run(request).await,
        Err(failure) => failure.into_response(),
    }
}

/// Extractor de sesion para los handlers: la sesion ya validada por la
/// capa de sesion. Sin ella, 401 (la ruta no esta detras de la capa).
impl<S> FromRequestParts<S> for Session
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts.extensions.get::<Session>().cloned().ok_or_else(|| {
            error::fail(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "Sesión requerida")
                .into_response()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La tabla de autorizacion completa de la linea base, seccion 3:
    /// mismo rol, misma operacion, mismo resultado esperado.
    #[test]
    fn authorization_table_matches_baseline() {
        use Permission::*;
        let cases: &[(Role, Permission, bool)] = &[
            // Lectura: cualquier sesion vigente, incluido demo.
            (Role::Root, Read, true),
            (Role::Admin, Read, true),
            (Role::Operador, Read, true),
            (Role::Auditor, Read, true),
            (Role::Demo, Read, true),
            // Registrar / admitir / mover visitas.
            (Role::Root, RegisterVisit, true),
            (Role::Admin, RegisterVisit, true),
            (Role::Operador, RegisterVisit, true),
            (Role::Auditor, RegisterVisit, false),
            (Role::Demo, RegisterVisit, false),
            // Editar perfil / rectificar.
            (Role::Root, EditProfile, true),
            (Role::Admin, EditProfile, true),
            (Role::Operador, EditProfile, true),
            (Role::Auditor, EditProfile, false),
            (Role::Demo, EditProfile, false),
            // Bloquear / desbloquear.
            (Role::Root, BlockVisitor, true),
            (Role::Admin, BlockVisitor, true),
            (Role::Operador, BlockVisitor, false),
            (Role::Auditor, BlockVisitor, false),
            (Role::Demo, BlockVisitor, false),
            // Crear ARCO u oposicion.
            (Role::Root, CreateArco, true),
            (Role::Admin, CreateArco, true),
            (Role::Operador, CreateArco, true),
            (Role::Auditor, CreateArco, false),
            (Role::Demo, CreateArco, false),
            // Consultar solicitudes o datos del titular.
            (Role::Root, ReadArco, true),
            (Role::Admin, ReadArco, true),
            (Role::Operador, ReadArco, false),
            (Role::Auditor, ReadArco, true),
            (Role::Demo, ReadArco, false),
            // Cambiar estado de solicitudes o cancelar datos.
            (Role::Root, ManageArco, true),
            (Role::Admin, ManageArco, true),
            (Role::Operador, ManageArco, false),
            (Role::Auditor, ManageArco, false),
            (Role::Demo, ManageArco, false),
            // Auditoria general.
            (Role::Root, ReadAudit, true),
            (Role::Admin, ReadAudit, true),
            (Role::Operador, ReadAudit, false),
            (Role::Auditor, ReadAudit, true),
            (Role::Demo, ReadAudit, false),
            // Respaldos por HTTP.
            (Role::Root, ManageBackups, true),
            (Role::Admin, ManageBackups, true),
            (Role::Operador, ManageBackups, false),
            (Role::Auditor, ManageBackups, false),
            (Role::Demo, ManageBackups, false),
            // Cuentas, reset administrativo y panel root.
            (Role::Root, ManageAccounts, true),
            (Role::Admin, ManageAccounts, false),
            (Role::Operador, ManageAccounts, false),
            (Role::Auditor, ManageAccounts, false),
            (Role::Demo, ManageAccounts, false),
        ];
        for (role, permission, expected) in cases {
            assert_eq!(
                allows(*role, *permission),
                *expected,
                "{:?} con {:?} debe ser {expected}",
                role,
                permission
            );
        }
        // Un rol desconocido no concede nada.
        assert_eq!(Role::parse("superusuario"), None);
        // Cada rol se parsea desde su nombre guardado.
        for (name, role) in [
            ("root", Role::Root),
            ("admin", Role::Admin),
            ("operador", Role::Operador),
            ("auditor", Role::Auditor),
            ("demo", Role::Demo),
        ] {
            assert_eq!(Role::parse(name), Some(role));
        }
    }
}
