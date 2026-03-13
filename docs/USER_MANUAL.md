# Manual de Usuario

## 1. Objetivo

Esta aplicacion permite controlar el acceso de visitantes, registrar ingresos/salidas, consultar auditoria y operar respaldos de forma segura.

## 2. Acceso al sistema

1. Abrir la aplicacion.
2. Ingresar usuario y contrasena.
3. Si el sistema solicita cambio de contrasena, completar el flujo antes de continuar.

## 3. Roles y alcance

- Admin:
  - Gestion operativa completa.
  - Respaldos.
  - Acceso total a auditoria.
- Guard:
  - Operacion diaria de visitantes.
  - No administra respaldos ni funciones administrativas.
- Auditor:
  - Solo lectura en modulos de auditoria/reportes.
  - No puede ejecutar check-in/check-out/admit.

## 4. Flujo operativo de visitas

### 4.1 Check-in

1. Ir al modulo de visitas.
2. Completar datos del visitante.
3. Aceptar consentimiento obligatorio.
4. Guardar check-in.

Campos clave:

- Cedula de visitante.
- Motivo de visita.
- Persona a visitar.
- Consentimiento (version y timestamp).
- Datos opcionales: acompanante, vehiculo, area, accion, departamento.

### 4.2 Admitir visita en espera

1. Abrir lista de visitas en `waiting`.
2. Seleccionar visita.
3. Ejecutar `admit`.

### 4.3 Check-out

1. Abrir visita activa.
2. Ejecutar `checkout`.
3. Registrar notas de salida si aplica.

## 5. Consulta de visitantes

- Buscar por cedula.
- Revisar historico de visitas.
- Confirmar estado actual (waiting/active/completed).

## 6. Reportes

Modulo de reportes disponible para usuarios autorizados.

- Estadisticas generales.
- Estadisticas mensuales.
- Alertas de check-out omitido.
- Comparativos.

## 7. Auditoria

Para rol auditor/admin:

- Consultar logs con filtros (accion, usuario, fecha).
- Revisar estadisticas de actividad.
- Exportar registros para revision.

## 8. Respaldos (solo admin)

1. Crear backup manual desde el modulo de backups.
2. Validar que aparezca en el listado.
3. Mantener politica interna de custodia.

Nota:

- El sistema tambien ejecuta tareas de retencion automatica para logs y fotos.

## 9. Buenas practicas operativas

- No compartir credenciales.
- Cambiar contrasena periodicamente.
- Cerrar sesion al terminar turno.
- Verificar consentimiento antes de ingreso.
- Registrar observaciones relevantes en cada visita.

## 10. Errores comunes

1. `401 Unauthorized`:
- Sesion expirada o token invalido.
- Volver a iniciar sesion.

2. `403 PASSWORD_CHANGE_REQUIRED`:
- Debe cambiar contrasena para continuar.

3. `403 Forbidden`:
- El rol no tiene permiso para esa operacion.

4. `429 Too Many Requests`:
- Limite de peticiones alcanzado temporalmente.

## 11. Soporte interno

Si una operacion falla de forma persistente:

1. Registrar fecha/hora y modulo.
2. Capturar mensaje de error.
3. Escalar al administrador tecnico del sistema.
