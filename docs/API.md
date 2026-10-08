# API - Sistema de Gestion de Visitantes

## Resumen
Backend REST montado en Express bajo el prefijo `/api`.

- Base local: `http://localhost:3000`
- Prefijo API: `/api`
- Version: `v1`
- Swagger UI: `/api-docs`

## Seguridad y Autenticacion

- Mecanismo principal: JWT Bearer Token.
- Header requerido en endpoints protegidos:
  - `Authorization: Bearer <token>`
- Rate limiting:
  - General: aplicado a `/api`.
  - Auth: aplicado a endpoints de autenticacion.
- Politica de cambio de contrasena:
  - Si el usuario tiene `mustChangePassword=true`, solo puede usar el endpoint de cambio de contrasena hasta cumplirlo.

## Endpoints

### Auth
Prefijo: `/api/v1/auth`

1. `POST /login`
- Publico.
- Body:
```json
{
  "username": "admin",
  "password": "Admin123!@#"
}
```
- Respuesta esperada: token de acceso y datos de usuario.

2. `POST /forgot-password`
- Publico.
- Body:
```json
{
  "username": "admin"
}
```
- Genera token de recuperacion.

3. `POST /reset-password`
- Publico.
- Body:
```json
{
  "token": "reset-token",
  "newPassword": "NuevaClaveSegura123!"
}
```

4. `POST /refresh`
- Publico.
- Body:
```json
{
  "refreshToken": "refresh-token"
}
```

5. `POST /change-password`
- Protegido (`Bearer`).
- Body:
```json
{
  "currentPassword": "Actual123!",
  "newPassword": "NuevaClaveSegura123!",
  "confirmPassword": "NuevaClaveSegura123!"
}
```

### Visits
Prefijo: `/api/v1/visits`

1. `POST /checkin`
- Protegido (`Bearer`).
- Restringido para rol `auditor` (auditor no puede operar check-in).
- Body minimo:
```json
{
  "visitorCedula": "12345678",
  "consent": {
    "accepted": true,
    "policyVersion": "v1",
    "acceptedAt": "2026-03-11T12:00:00.000Z"
  },
  "purpose": "Reunion",
  "personToVisit": "Juan Perez"
}
```
- Soporta datos extendidos: `notes`, `visitorData`, acompanante, vehiculo, area, accion, departamento.

2. `POST /:id/checkout`
- Protegido (`Bearer`).
- Restringido para rol `auditor`.

3. `POST /:id/admit`
- Protegido (`Bearer`).
- Restringido para rol `auditor`.
- Admite visitas en estado `waiting`.

4. `GET /waiting`
- Protegido (`Bearer`).
- Restringido para rol `auditor`.

5. `GET /active`
- Protegido (`Bearer`).
- Restringido para rol `auditor`.

6. `GET /`
- Protegido (`Bearer`).
- Restringido para rol `auditor`.
- Filtros comunes: `page`, `limit`, `status`.

### Visitors
Prefijo: `/api/v1/visitors`

1. `GET /:cedula`
- Protegido (`Bearer`).
- Obtiene visitante por cedula.

### Reports
Prefijo: `/api/v1/reports`

1. `GET /stats`
- Protegido (`Bearer`).
- Filtros: `start`, `end`.

2. `GET /stats/monthly`
- Protegido (`Bearer`).
- Filtros: `month`, `year`.

3. `GET /alerts`
- Protegido (`Bearer`).

4. `GET /comparison`
- Protegido (`Bearer`).

### Backups
Prefijo: `/api/v1/backups`

1. `POST /`
- Protegido (`Bearer`) + rol `admin`.
- Crea respaldo.

2. `GET /`
- Protegido (`Bearer`) + rol `admin`.
- Lista respaldos.

### Audit
Prefijo: `/api/v1/audit`

1. `GET /logs`
- Protegido (`Bearer`) + `auditor` o `admin`.
- Filtros: `page`, `limit`, `action`, `username`, `startDate`, `endDate`.

2. `GET /stats`
- Protegido (`Bearer`) + `auditor` o `admin`.

3. `GET /export`
- Protegido (`Bearer`) + `auditor` o `admin`.

4. `GET /actions`
- Protegido (`Bearer`) + `auditor` o `admin`.

5. `GET /users`
- Protegido (`Bearer`) + `auditor` o `admin`.

6. `GET /config`
- Protegido (`Bearer`) + `auditor` o `admin`.

### Privacy (ARCO)
Prefijo: `/api/v1/privacy`

1. `POST /arco-requests`
- Protegido (`Bearer`).
- Crea solicitud ARCO.
- Body:
```json
{
  "requestType": "access",
  "cedula": "12345678",
  "requestedByName": "Juan Perez",
  "contactEmail": "juan@correo.com",
  "reason": "Solicito acceso a mis datos",
  "requestPayload": {
    "source": "frontdesk"
  }
}
```

2. `GET /arco-requests`
- Protegido (`Bearer`) + `auditor` o `admin`.
- Lista solicitudes con filtros (`page`, `limit`, `status`, `requestType`, `search`).

3. `PATCH /arco-requests/:id/status`
- Protegido (`Bearer`) + `auditor` o `admin`.
- Actualiza estado de la solicitud (`pending`, `in_progress`, `completed`, `rejected`).

4. `GET /subjects/:cedula`
- Protegido (`Bearer`) + `auditor` o `admin`.
- ARCO Acceso: devuelve datos del titular y su historial de visitas.

5. `PATCH /subjects/:cedula`
- Protegido (`Bearer`).
- Restringido para rol `auditor`.
- ARCO Rectificacion: actualiza campos del titular (`firstName`, `lastName`, `company`, `jobTitle`, `email`, `phone`).

6. `DELETE /subjects/:cedula`
- Protegido (`Bearer`) + rol `admin`.
- ARCO Cancelacion: anonimiza datos personales y elimina fotos asociadas cuando existan.

7. `POST /subjects/:cedula/opposition`
- Protegido (`Bearer`).
- ARCO Oposicion: registra solicitud de oposicion para tratamiento.

## Codigos de respuesta frecuentes

- `200 OK`: operacion correcta.
- `201 Created`: recurso creado.
- `400 Bad Request`: validacion fallida.
- `401 Unauthorized`: token ausente/invalido.
- `403 Forbidden`: sin permisos o password change requerido.
- `404 Not Found`: recurso no encontrado.
- `429 Too Many Requests`: rate limit.
- `500 Internal Server Error`: error interno.

## Notas operativas

- Las fotos se sirven desde `/data/photos`.
- El backend aplica limpieza de retencion (logs/fotos) de forma automatica en segundo plano.
- Revisar Swagger (`/api-docs`) para detalle de contratos en tiempo real.
