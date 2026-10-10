# API de LogMaster con Go

Base en Compose `https://localhost:8443/api/v1`. Se conservan las 53 rutas anteriores y se añade calendario agregado. El inventario `server-go/contracts/routes.json` se compara con el router real y comprueba solicitudes sin sesión.

Las respuestas JSON mantienen `{ success: true, data: ... }` o `{ success: false, error: { code, message } }`, con metadatos de paginación según la ruta. Fotos, CSV y eventos son respuestas binarias/textuales. No hay publicación de fotografías en un directorio estático ni Swagger servido por el backend Go.

## Autorización y cambios

Las rutas protegidas reciben `Authorization: Bearer <accessToken>`. Solo login, recuperación, restablecimiento, refresh y health son públicos. Un usuario con cambio obligatorio solo puede renovar sesión y cambiar su propia contraseña. El servidor consulta rol, restricción y versión actuales; no confía en un rol obsoleto dentro del JWT.

- `PATCH /visitors/:cedula`: datos parciales validados y `editPassword` obligatorio en cada guardado. Contexto de visita opcional y comprobado; actor obtenido de la sesión. Operador/admin/root pueden editar, solo admin/root pueden bloquear.
- Rectificación usa la misma edición y autorización. Las fotografías no se actualizan implícitamente al registrar una nueva visita de un perfil existente.
- `GET /visitors/:cedula/photo` y `/id-photo`: binario autenticado, `Cache-Control: private, no-store`; sin sesión devuelve 401.
- La consulta devuelve bloqueo, observaciones, historial solicitado y datos previos de visita, departamento, anfitrión y vehículo.
- El historial admite `visitId=null`; los valores personales se cifran en almacenamiento y desaparecen al cancelar. Las fotos solo dejan constancia de cambio.
- Registro exige consentimiento con `accepted`, `policyVersion` y `acceptedAt`; sus columnas son independientes de `notes`. Espera → activa ↔ intermitente → completada aplica tiempos y bloqueos en el servidor.
- Cancelación con visita abierta: `409 OPEN_VISIT_EXISTS`. Después del cierre elimina perfil identificativo, fotografías y valores personales relacionados dentro de una transacción. Los registros históricos devuelven cédula pública `null` y nombre «Anonimizado».
- Usuarios: campo `email`; correo requerido en cuentas operativas nuevas. Solo root administra cuentas. Nuevas contraseñas: 12 caracteres, complejidad y máximo 72 bytes UTF-8; el restablecimiento administrativo deja cambio obligatorio y revoca sesiones.
- Recuperación responde genéricamente, nunca devuelve el token. Mailpit recibe el enlace `APP_URL/#/reset-password?token=...`; el token se guarda como hash, vence en 15 minutos y admite un uso.
- SSE `/events/visits`: Bearer en cabecera; rechaza `?token=...`, comprueba restricción, versión y vencimiento durante la conexión. El cliente renueva y reconecta con el token actual.
- Fechas sin hora se interpretan en `America/Caracas`. El final de un rango de días incluye todo el último día. Búsqueda y filtros preceden a la paginación; CSV exporta todos los resultados filtrados y neutraliza fórmulas.
- Respaldos: nombre contenido, contraseña y metadatos obligatorios. Restaurar fuera de `logmaster_restore_test` devuelve `409 RESTORE_TARGET_NOT_ALLOWED`. Tras restaurar, las sesiones anteriores dejan de ser válidas.

Códigos generales: 400 validación, 401 sesión/contraseña inválida, 403 permiso o cambio obligatorio, 404 recurso, 409 conflicto de estado, 413 cuerpo mayor de 5 MB, 429 límite, 500 operación fallida y 503 conexión de base no disponible.

Los filtros generales `search` exigen al menos tres caracteres tras normalización; entradas menores devuelven `400 SEARCH_TOO_SHORT`. La consulta directa por cédula permanece. La búsqueda conserva distinción de acentos y usa candidatos del índice protegido.

`GET /api/v1/visits/calendar?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&status=...` devuelve `{ success: true, data: { days: [{ date, count }] } }`, con días Caracas y rango máximo de 62 días. Usa los permisos de consulta existentes. El detalle sigue paginado por `/visits`. PDF/Excel del cliente rechazan totales mayores de 2.000/20.000, incluyendo PDF de calendario; no hay generación masiva en el servidor.

El CLI de mantenimiento mantiene simulación por defecto y confirmación explícita; no añade rutas públicas. Véase [OPERATIONS](OPERATIONS.md).

## Inventario de rutas

| Método | Ruta | Sesión |
|---|---|---|
| GET | /api/v1/audit/logs | Obligatoria |
| GET | /api/v1/audit/stats | Obligatoria |
| GET | /api/v1/audit/export | Obligatoria |
| GET | /api/v1/audit/actions | Obligatoria |
| GET | /api/v1/audit/users | Obligatoria |
| GET | /api/v1/audit/config | Obligatoria |
| POST | /api/v1/auth/login | Pública |
| POST | /api/v1/auth/forgot-password | Pública |
| POST | /api/v1/auth/reset-password | Pública |
| POST | /api/v1/auth/refresh | Pública |
| POST | /api/v1/auth/change-password | Obligatoria |
| POST | /api/v1/backups | Obligatoria |
| GET | /api/v1/backups | Obligatoria |
| POST | /api/v1/backups/:filename/restore | Obligatoria |
| GET | /api/v1/events/visits | Obligatoria |
| GET | /api/v1/health | Pública |
| POST | /api/v1/privacy/arco-requests | Obligatoria |
| GET | /api/v1/privacy/arco-requests | Obligatoria |
| PATCH | /api/v1/privacy/arco-requests/:id/status | Obligatoria |
| GET | /api/v1/privacy/subjects/:cedula | Obligatoria |
| PATCH | /api/v1/privacy/subjects/:cedula | Obligatoria |
| DELETE | /api/v1/privacy/subjects/:cedula | Obligatoria |
| POST | /api/v1/privacy/subjects/:cedula/opposition | Obligatoria |
| GET | /api/v1/reports/stats | Obligatoria |
| GET | /api/v1/reports/stats/monthly | Obligatoria |
| GET | /api/v1/reports/alerts | Obligatoria |
| GET | /api/v1/reports/comparison | Obligatoria |
| GET | /api/v1/superadmin/users | Obligatoria |
| POST | /api/v1/superadmin/users | Obligatoria |
| PUT | /api/v1/superadmin/users/:id | Obligatoria |
| DELETE | /api/v1/superadmin/users/:id | Obligatoria |
| POST | /api/v1/superadmin/users/:id/reset-password | Obligatoria |
| GET | /api/v1/superadmin/audit-logs | Obligatoria |
| POST | /api/v1/visits/checkin | Obligatoria |
| POST | /api/v1/visits/:id/checkout | Obligatoria |
| POST | /api/v1/visits/:id/admit | Obligatoria |
| GET | /api/v1/visits/waiting | Obligatoria |
| GET | /api/v1/visits/active | Obligatoria |
| POST | /api/v1/visits/:id/intermittent | Obligatoria |
| POST | /api/v1/visits/:id/reactivate | Obligatoria |
| GET | /api/v1/visits/intermittent | Obligatoria |
| POST | /api/v1/visits/:id/intermittent-exit | Obligatoria |
| POST | /api/v1/visits/:id/intermittent-reentry | Obligatoria |
| GET | /api/v1/visits | Obligatoria |
| GET | /api/v1/visits/calendar | Obligatoria |
| GET | /api/v1/visitors/companies | Obligatoria |
| GET | /api/v1/visitors | Obligatoria |
| GET | /api/v1/visitors/:cedula | Obligatoria |
| PATCH | /api/v1/visitors/:cedula | Obligatoria |
| POST | /api/v1/visitors/verify-edit-password | Obligatoria |
| GET | /api/v1/visits/:visitId/edit-history | Obligatoria |
| GET | /api/v1/visitors/:cedula/edit-history | Obligatoria |
| GET | /api/v1/visitors/:cedula/photo | Obligatoria |
| GET | /api/v1/visitors/:cedula/id-photo | Obligatoria |
