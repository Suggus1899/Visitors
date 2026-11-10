# Tabla de autorización — casos de la prueba de roles

Transcripción de la línea base, sección 3. Cada fila es un caso de la
prueba de roles que la versión Rust debe pasar (fase 3): mismo rol, misma
operación, mismo resultado esperado. La comprobación que vale es la del
servidor; la interfaz solo oculta acciones por rol.

| Operación | Quién puede |
| --- | --- |
| Consultar visitas, perfiles, reportes, fotos y eventos | Sesión vigente, con las restricciones aplicables |
| Registrar, admitir, cancelar una visita en espera y moverla por su ciclo | operador, admin o root |
| Editar perfil/fotos o rectificar | operador, admin o root, con contraseña adicional en cada guardado; se valida el vínculo si se indica una visita |
| Bloquear / desbloquear visitantes | admin o root, con contraseña adicional |
| Crear solicitud ARCO u oposición | operador, admin o root |
| Consultar solicitudes o datos del titular | admin, root o auditor |
| Cambiar estado de solicitudes o cancelar datos | admin o root; la cancelación requiere constancia de verificación de identidad |
| Auditoría general | admin, root o auditor |
| Respaldos por HTTP | admin o root, con restricciones del entorno para crear o restaurar |
| Cuentas, reset administrativo y auditoría del panel root | root |

El rol `demo` conserva su vista guiada de operación sin escrituras de
dominio. Referencia en el código Go:
`server-go/internal/httpapi/permissions_test.go`.
