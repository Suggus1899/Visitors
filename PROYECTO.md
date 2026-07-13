# LogMaster — Documentación del Proyecto

## Descripción General

Sistema de control de visitas (check-in/check-out) con panel administrador, módulo de auditoría y soporte para visita intermitente. Desplegado con Node.js + Express (backend), React + Vite (frontend) y PostgreSQL 16.

---

## Estado Actual (11 Jun 2026)

### Contenedores

| Contenedor | Puerto | Health |
|---|:-:|:-:|
| `logmaster-postgres` | 5432 | healthy |
| `logmaster-server`  | 3000 | healthy |
| `logmaster-client`  | 80/443 | healthy |

### URL de Acceso

`https://192.168.0.141`

Nginx sirve el frontend y redirige `/api/` → `server:3000`.

---

## Roles del Sistema

| Role | Acceso |
|---|---|
| `root` | Todo: ops, admin, auditoría, superadmin |
| `admin` | Operaciones + Admin Dashboard + Auditoría |
| `operador` | Solo operaciones (registrar entrada/salida) |
| `auditor` | Solo panel de auditoría (redirigido automático desde `/`) |
| `demo` | Operaciones con auto-tour guiado |

No existe el rol `guard` ni `superadmin`. El dashboard de gestión está en la ruta `/root`, accesible solo por el rol `root`. El usuario `guard` del seed tiene rol `operador` (es un username, no un rol).

### Credenciales (seed)

| Usuario | Password (default) | Role |
|---|---|---|
| `trebolmaster` | `TrebolMaster2026!` | root |
| `Admin@trebol.com` | `Trebol123*` | admin |
| `operador` | `Operador2026!` | operador |
| `auditor` | `Audit2026!@#` | auditor |
| `demo` | `Demo123!@#` | demo |

> Las contraseñas se sobrescriben via variables de entorno: `SEED_ROOT_PASSWORD`, `SEED_ADMIN_PASSWORD`, `SEED_OPERADOR_PASSWORD`, `SEED_AUDITOR_PASSWORD`, `SEED_DEMO_PASSWORD`.

Password mínimo: 8 caracteres.

---

## Arquitectura

```
Client (Vite + React :5173)
    │
    ▼ proxy /api/
Server (Express + TypeScript :3000)
    │
    ▼
PostgreSQL 16
```

### Frontend (client/)

- **Stack**: React 18, TypeScript, Vite, Tailwind CSS, React Query, react-webcam
- **Enrutamiento**: `HashRouter` con rutas `/login`, `/forgot-password`, `/reset-password`, `/`, `/audit`, `/admin`, `/root`
- **Contexto**: `AuthProvider`, `ThemeProvider`
- **Notas**:
  - `ErrorBoundary` envuelve `VisitForm` para capturar crashes de React
  - `AppToaster` centraliza notificaciones toast
  - `safeNotify` previene dobles notificaciones
  - `notranslate` activo en `<html>` y meta tag para prevenir que extensiones muten el DOM durante reconciliación de React
  - Favicon `/vite.svg` servido correctamente desde `public/`

### Backend (server/)

- **Stack**: Express, TypeScript, Sequelize, PostgreSQL, Zod (v4.3.6, schemas), clean architecture
- **Patrón**: Use Cases + Repositories + Controllers
- **Endpoints**:
  - `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`
  - `GET/PATCH /api/v1/visitors/:cedula`
  - `GET /api/v1/visitors/:cedula/photo`, `/id-photo` (devuelve BLOB binario)
  - `POST /api/v1/visits/checkin`, `POST /api/v1/visits/:id/checkout`, `POST /api/v1/visits/:id/admit`
  - `GET /api/v1/visits/active`, `/waiting`, `/intermittent`
  - `GET /api/v1/events/visits` (SSE)
  - `POST /api/v1/root/users`, `GET /api/v1/root/users`
- **Seguridad**:
  - Cédulas y PII cifradas (hash + encryption bidireccional)
  - `PII_ENCRYPTION_KEY` con fallback a `ENCRYPTION_KEY`
  - JWT con access/refresh tokens
  - Rate limiting en login
  - Password policy (mín 8 chars, mayúscula, número, especial)

---

## Historial de Cambios

### 1. Roles del Sistema

**Archivos modificados**: servidor (entities/middleware/routes/schemas/controllers), frontend (types/routes/guards/modals)

- Eliminadas todas las referencias a los roles `guard` y `superadmin` (el usuario `guard` del seed conserva rol `operador`)
- Roles actuales: `root`, `admin`, `operador`, `auditor`, `demo`
- `AuditRoute` creado para redirigir auditor automáticamente
- `OperationsRoute` redirige auditor a `/audit` si intenta acceder a operaciones
- Seeders crean usuarios independientes (no compartidos entre seeders)

### 2. Variable de Cifrado PII

**Archivo**: `server/src/config/AppConfig.ts`, `.env`, `.env.example`

- `piiEncryptionKey` con fallback bidireccional:
  ```typescript
  piiEncryptionKey: process.env.PII_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'fallback-dev-key-change-in-production'
  ```

### 3. Password Mínimo 8 Caracteres

**Archivos**: `server/src/config/PasswordPolicy.ts`, schemas Zod

- Regla `minLength(8)` en todos los schemas de creación/actualización de usuarios
- Coherente con la política de backend

### 4. Scripts Batch

2 scripts en `scripts/`:

| Script | Función |
|---|---|
| `start.bat` | Inicia el sistema (verifica .env, dependencias, PostgreSQL) |
| `status.bat` | Estado del sistema y URLs de acceso |

### 7. Seeders

4 seeders creados:

| Seeder | Función |
|---|---|
| `seed-users.ts` | Crea root, admin, operador, auditor, demo |
| `seed-demo-data.ts` | Datos demo para pruebas |
| `seed-test-visits.ts` | Visitas de prueba |
| `seed-renewed.ts` | Actualiza datos seed |

### 8. Nuevos Componentes Frontend

| Componente | Archivo | Función |
|---|---|---|
| `AppToaster` | `AppToaster.tsx` | Toast personalizado para react-hot-toast |
| `ErrorBoundary` | `ErrorBoundary.tsx` | Captura errores de React con UI de fallback |
| `safeNotify` | `safeNotify.ts` | Previene duplicación de notificaciones toast |
| `cameraDevices` | `cameraDevices.ts` | Utilidad para enumerar cámaras |
| `visitRefresh` | `visitRefresh.ts` | Utilidad para refresco de visitas |

### 9. Bugfix Firewall

- Healthcheck paths exentos (`/api/v1/health`, `/health`) en configuración de firewall

### 10. Bugfix CORS

**Archivo**: `server/src/config/cors.ts`

- Cambiado de error a `callback(null, origin)` en la función de origen
- Acepta cualquier origen (en desarrollo, el origen varía)

### 11. Bugfix URLs Hardcoded

**Archivos**: `Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `SuperAdminDashboard.tsx`, `VisitDetailsModal.tsx`

- Reemplazadas URLs hardcoded `http://localhost:3000` con rutas relativas

### 12. Bugfix "Otro" en Motivo de Visita

**Archivo**: `client/src/components/visit/VisitDetailsStep.tsx` (línea 93-104)

- Select value mapea `Otro: texto` → `Otro` para que el dropdown no se resetee al escribir
- Guarda `"Otro: texto"` en BD si hay texto, o `"Otro"` si está vacío
- El `<input>` ahora es **controlled** con prop `value` para evitar que React pierda el texto al re-renderizar

### 13. Bugfix Loading State

**Archivo**: `client/src/components/VisitForm.tsx` (línea 314)

- Se agregó `setLoading(false)` en la ruta de éxito de `handleSubmit`
- Antes solo se resetaba en `catch`, dejando `loading=true` permanentemente al registrar exitosamente

### 14. Prevención de React Crash (insertBefore)

**Archivo**: `client/index.html` (líneas 2, 7)

- Agregado `class="notranslate"` en `<html>`
- Agregado `<meta name="google" content="notranslate" />` en `<head>`
- Previene que Google Translate y otras extensiones modifiquen el DOM durante la reconciliación de React (causa del error `NotFoundError: Failed to execute 'insertBefore' on 'Node'`)

**Archivo**: `client/src/App.tsx` (líneas 35, 148-157)

- Importado `ErrorBoundary` del componente existente
- Envuelto `VisitForm` con `ErrorBoundary` con fallback que muestra botón "Recargar"

### 15. Favicon (vite.svg)

**Archivo creado**: `client/public/vite.svg`

- Antes: 404 en navegador por favicon faltante
- Ahora: SVG con iniciales "LM" servido correctamente

### 16. Foto de Visitante en Búsqueda

**Archivo**: `client/src/components/visit/VisitorLookupStep.tsx` (líneas 80-90)

- El `<img>` ahora tiene manejador `onError` que oculta la imagen rota y muestra placeholder con inicial del nombre
- El placeholder se muestra cuando el backend devuelve 404 (foto no existente)

### 18. Eliminación de Toaster Duplicado en VisitForm

**Archivo**: `client/src/components/VisitForm.tsx`

- Eliminado `<Toaster>` propio de VisitForm (ya lo renderiza `AppToaster`)
- Reemplazadas 11 llamadas `toast.*` → `safeNotify.*` para prevenir conflictos de reconciliación al cambiar de paso

### 19. Winston Logger en Umzug

**Archivo**: `server/src/config/umzug.ts`

- Reemplazado `logger: console` por `logger: logger` (Winston con rotación diaria)
- `console.log`/`console.warn` → `logger.warn`

### 20. Corrección de Tipos (as any)

**Archivo**: `server/src/controllers/AuthCleanController.ts`

- Eliminados 6 casts `as any` en catch blocks, reemplazados con interfaz `AuthError` tipada
- Eliminado `(req as any).user.id` → `(req as AuthenticatedRequest).user!.id`

### 21. Migración SQLite Deprecada Eliminada

**Archivo**: `server/src/migrations/migrate-visit-schema.ts`

- Eliminado archivo de migración SQLite (no usado con PostgreSQL)

---

## Issues Conocidos

### 0. Email Service no funcional (Stub)

- **Causa**: `nodemailer` no está instalado, el transporter y `sendMail()` están comentados en `EmailService.ts`
- **Impacto**: "Olvidé mi contraseña" nunca envía email; el token solo se loguea en dev
- **Requiere**: Instalar nodemailer, configurar SMTP en `.env`, descomentar el código

### 1. React Crash `insertBefore` (Mitigado)

- **Síntoma**: `NotFoundError: Failed to execute 'insertBefore' on 'Node'` después de registro exitoso, al transicionar de step 4 a step 1
- **Causa más probable**: Extensiones de navegador (Google Translate, Grammarly) modifican el DOM durante la reconciliación de React
- **Mitigación**: `notranslate`, `ErrorBoundary` envolviendo `VisitForm`, eliminado `<Toaster>` duplicado en VisitForm, migración a `safeNotify`
- **Si persiste**: Probar en ventana incógnito o deshabilitar extensiones

### 2. 404 en `/api/v1/visitors/*/photo` (Resuelto parcial)

- **Causa**: La foto nunca se almacenaba para visitantes existentes durante check-in
- **Arreglo**: `CheckInVisitor.usecase.ts` ahora actualiza `photo_data` cuando se recibe `photoBase64` como data URL
- **Pendiente**: Las fotos anteriores a este fix (que no se almacenaron) seguirán devolviendo 404

### 3. Performance de Chunks

- Advertencia de Vite: algunos chunks JS superan 500 kB
- No crítico, pero se podría mejorar con `dynamic import()` y `manualChunks`

---

## Flujo de Registro de Visita

```
Step 1 (VisitorLookupStep)
  ├─ Ingresa cédula → busca visitante existente
  ├─ Si existe: carga datos + foto previa (desde endpoint /photo)
  └─ Si no existe: ingresa nombre/apellido manualmente

Step 2 (VisitorInfoStep)
  └─ Empresa, cargo, teléfono (con código de país)

Step 3 (VehicleInfoStep)
  └─ Acompañantes y vehículo (opcional)

Step 4 (VisitDetailsStep)
  ├─ Departamento destino, persona a visitar
  ├─ Motivo de visita (select + "Otro" con texto libre)
  ├─ Checkbox consentimiento
  ├─ Foto de rostro (opcional, vía webcam o archivo)
  ├─ Foto de identificación (opcional)
  └─ Botones: "Registrar Entrada" o "Poner en Espera"

Submit → handleSubmit()
  ├─ Si datos de visitante cambiaron: PATCH /visitors/:cedula
  ├─ POST /visits/checkin
  ├─ Invalida queries de React Query
  ├─ Resetea formulario (step 1, datos limpios)
  └─ Muestra toast de éxito
```

---

## Variables de Entorno

| Variable | Default | Descripción |
|---|---|---|
| `DB_NAME` | `visitors` | Nombre BD |
| `DB_USER` | `postgres` | Usuario BD |
| `DB_PASSWORD` | `postgres` | Password BD |
| `JWT_SECRET` | — | Secreto JWT |
| `ENCRYPTION_KEY` | — | Clave de cifrado PII |
| `PII_ENCRYPTION_KEY` | (fallback ENCRYPTION_KEY) | Clave de cifrado PII específica |
| `VITE_API_URL` | `""` | URL base API (vacío = relativo, proxy mode) |
| `PORT` | `3000` | Puerto del servidor Express |
| `SERVER_PORT` | `3000` | Puerto servidor |

---

## Despliegue

### Build y Deploy Completo

```bash
scripts\deploy.bat
```

### Ver Estado

```bash
scripts\status.bat
scripts\monitor-health.bat   # Monitoreo continuo
```

### Detener

```bash
scripts\detener.bat
```

### Acceso

```
https://192.168.0.141
```

---

## Estructura de Archivos Clave

```
Visitors/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VisitForm.tsx            ← Lógica principal del formulario
│   │   │   ├── ErrorBoundary.tsx        ← Captura errores React
│   │   │   ├── PhotoCapture.tsx         ← Webcam + captura de foto
│   │   │   ├── visit/
│   │   │   │   ├── VisitDetailsStep.tsx ← Step 4 (motivo, fotos, submit)
│   │   │   │   ├── VisitorLookupStep.tsx← Step 1 (búsqueda + foto previa)
│   │   │   │   ├── VisitorInfoStep.tsx  ← Step 2 (datos empresa)
│   │   │   │   └── VehicleInfoStep.tsx  ← Step 3 (vehículo/acompañantes)
│   │   │   └── ...
│   │   ├── App.tsx
│   │   ├── hooks/
│   │   │   └── useVisitQueries.ts       ← React Query hooks
│   │   └── config/
│   │       └── env.ts                   ← API_URL resolution
│   ├── index.html                       ← notranslate, CSP
├── server/
│   └── src/
│       ├── application/
│       │   └── usecases/
│       │       ├── CheckInVisitor.usecase.ts    ← Guardado de fotos
│       │       ├── GetVisitorByCedula.usecase.ts
│       │       └── UpdateVisitor.usecase.ts
│       ├── controllers/
│       │   └── VisitorCleanController.ts        ← Photo GET endpoints
│       ├── infrastructure/
│       │   └── database/repositories/
│       │       └── SequelizeVisitorRepository.ts ← getPhotoBlob
│       └── config/
│           ├── AppConfig.ts
│           └── PasswordPolicy.ts
├── scripts/
│   ├── *.bat (2 scripts)
│   └── seeders/
│       ├── seed-users.ts
│       ├── seed-demo-data.ts
│       ├── seed-test-visits.ts
│       └── seed-renewed.ts
└── ssl/
    ├── cert.pem
    └── key.pem
```
