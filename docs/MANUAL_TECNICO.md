# Manual Tecnico — LogMaster (Sistema de Gestion de Visitantes)

---

## 1. Introduccion

LogMaster es un sistema de gestion de visitantes monorepo con frontend React + Vite, backend Express + Sequelize, base de datos PostgreSQL y empaquetado Electron para escritorio. Disenado para entornos empresariales con altos requisitos de seguridad, auditoria y cumplimiento normativo (GDPR).

## 2. Requisitos Previos

### 2.1 Hardware Minimo

| Componente | Minimo | Recomendado |
|---|---|---|
| CPU | 2 nucleos | 4 nucleos |
| RAM | 4 GB | 8 GB |
| Disco | 10 GB libres | 50 GB SSD |
| Red | 100 Mbps | 1 Gbps |

### 2.2 Software Requerido

| Software | Version Minima | Proposito |
|---|---|---|
| Node.js | 20.x LTS | Runtime del servidor |
| npm | 9.x | Gestor de paquetes |
| PostgreSQL | 16 | Base de datos (instalado localmente) |
| Git | 2.x | Control de versiones (desarrollo) |
| Windows | 10/11 64-bit | Sistema operativo soportado |

### 2.3 Puertos Necesarios

| Puerto | Servicio | Uso |
|---|---|---|
| 3000 | API Server | Backend REST |
| 5432 | PostgreSQL | Base de datos |
| 5173 | Vite dev | Desarrollo frontend |

### 2.4 Conocimientos Recomendados

- Linea de comandos Windows (PowerShell o CMD)
- Navegador web moderno (Chrome, Edge, Firefox)
- Para desarrollo: TypeScript, Node.js, React

---

## 3. Arquitectura General

### 3.1 Stack Tecnologico

| Componente | Tecnologia | Version |
|---|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Lucide React | 18.x / 5.x |
| Backend | Node.js, Express, TypeScript | 20.x LTS |
| ORM | Sequelize | 6.x |
| Base de Datos | PostgreSQL | 16 |
| Desktop | Electron + electron-builder | 40.x |
| Pruebas | Vitest (server + client) | 4.x |
| CI/CD | GitHub Actions | N/A |

### 3.2 Diagrama de Arquitectura

```
+----------------+       +------------------+       +----------------+
|  Cliente (Vite)|------>|  Server (Express)|------>|  PostgreSQL    |
|  :5173         |       |  :3000           |       |  :5432         |
|  SPA React     |       |  API REST        |       |  Datos + Fotos |
+----------------+       +------------------+       +----------------+
```

### 3.3 Flujo de una Visita

```
1. Registro: Operador busca visitante por cedula o crea nuevo
2. Captura: Foto del rostro + foto del documento de identidad
3. Check-in: Operador completa datos y confirma check-in
4. Estado "waiting": Visita en espera de ser admitida
5. Admitir: Operador o Admin admite al visitante (-> "active")
6. Salidas intermitentes: Salida temporal con reingreso
7. Check-out: Registro de salida definitiva (-> "completed")
8. Retention: Datos purgados segun politica GDPR configurada
```

### 3.4 Estructura del Monorepo

```
Visitors/
├── .github/workflows/   # CI/CD Pipeline (GitHub Actions)
├── .husky/              # Pre-commit hooks (lint + type-check + test)
├── scripts/             # Windows batch scripts
│   ├── start.bat        # Inicio de servicios
│   ├── detener.bat      # Detener servicios
│   ├── status.bat       # Estado y URLs
│   ├── auto-env.bat     # Auto-detecta IP y configura CORS
│   └── monitor-health.bat # Monitoreo continuo
├── client/              # Frontend React + Vite
│   ├── src/
│   │   ├── components/  # Componentes UI
│   │   │   ├── VisitForm.tsx, VisitsTable.tsx, etc.
│   │   │   └── __tests__/
│   │   ├── context/     # AuthContext (sesion JWT)
│   │   ├── hooks/       # Custom hooks
│   │   ├── services/    # Llamadas API
│   │   ├── types/       # Interfaces TypeScript
│   │   └── utils/       # photoValidator, pdfExport, excelExport
├── server/              # Backend Express + Sequelize
│   ├── src/
│   │   ├── domain/entities/     # Entidades de negocio puras
│   │   ├── domain/services/     # Interfaces de servicio
│   │   ├── application/usecases/# Casos de uso
│   │   ├── infrastructure/services/ # Implementaciones
│   │   ├── controllers/         # Handlers HTTP
│   │   ├── middleware/           # auth, firewall, rateLimiter, etc.
│   │   ├── routes/              # Definiciones de rutas
│   │   ├── models/              # Modelos Sequelize
│   │   ├── migrations/          # Migraciones SQL
│   │   ├── config/              # AppConfig + logger
│   │   ├── types/               # Tipos Express (AuthPayload)
│   │   └── utils/               # seeder, retention, Encryption
│   └── __tests__/               # Tests Vitest
├── docs/                # Documentacion
├── data/                # Datos persistentes locales
├── backups/             # Respaldos de base de datos
├── .env                 # Variables de entorno (NO commitear)
└── package.json         # Scripts raiz
```

---

## 4. Base de Datos

### 4.1 Esquema Relacional

```
Users
├── id (PK, INTEGER, autoIncrement)
├── username (STRING, UNIQUE, NOT NULL)
├── password (STRING, NOT NULL) -- bcrypt hash
├── role (ENUM: root|admin|operador|auditor|demo)
├── resetToken (STRING, NULL)
├── resetTokenExpiry (DATE, NULL)
├── mustChangePassword (BOOLEAN, DEFAULT true)
├── passwordChangedAt (DATE, NULL)
├── loginAttempts (INTEGER, DEFAULT 0)
└── lockedUntil (DATE, NULL)

Visitors
├── id (PK, INTEGER, autoIncrement)
├── cedula (STRING, UNIQUE, NOT NULL) -- hasheada al guardar
├── encrypted_cedula (STRING, NULL) -- cifrado AES-256-GCM
├── first_name (TEXT, NOT NULL) -- cifrado
├── last_name (TEXT, NOT NULL) -- cifrado
├── company (STRING, NOT NULL)
├── job_title (STRING, NULL) -- cifrado
├── photo_url (STRING, NULL)
├── id_photo_url (STRING, NULL)
├── photo_data (BLOB, NULL) -- BYTEA
├── id_photo_data (BLOB, NULL) -- BYTEA
├── email (TEXT, NULL) -- cifrado
├── phone (TEXT, NULL) -- cifrado
├── isBlocked (BOOLEAN, DEFAULT false)
├── observations (TEXT, NULL)
└── createdAt (DATE, DEFAULT NOW)

Visits
├── id (PK, INTEGER, autoIncrement)
├── visitor_id (FK -> Visitors.id)
├── visitor_cedula (STRING, NOT NULL)
├── purpose (STRING, NOT NULL)
├── person_to_visit (STRING, NOT NULL)
├── check_in_time (DATE, DEFAULT NOW)
├── check_out_time (DATE, NULL)
├── status (ENUM: waiting|active|intermittent|completed)
├── notes (TEXT, NULL)
├── arrival_time (DATE, NULL)
├── entry_time (DATE, NULL)
├── exit_time (DATE, NULL)
├── target_department (STRING, NULL)
├── host_person (STRING, NULL)
├── companion_name (STRING, NULL)
├── companion_cedula (STRING, NULL)
├── vehicle_brand (STRING, NULL)
├── vehicle_model (STRING, NULL)
├── vehicle_plate (STRING, NULL)
├── area (STRING, NULL)
├── action (ENUM: Carga|Descarga|Ninguna, DEFAULT Ninguna)
└── department (STRING, NULL)

IntermittentLogs
├── id (PK, INTEGER, autoIncrement)
├── visit_id (FK -> Visits.id, ON DELETE CASCADE)
├── exit_time (DATE, NOT NULL)
├── reentry_time (DATE, NULL)
├── notes (TEXT, NULL)
└── registered_by (STRING, NULL)

ActivityLogs
├── id (PK, INTEGER, autoIncrement)
├── userId (INTEGER, NOT NULL)
├── username (STRING, NOT NULL)
├── action (STRING, NOT NULL)
├── entity (STRING, NOT NULL)
├── entityId (STRING, NOT NULL)
├── details (TEXT, NULL)
├── ipAddress (STRING, NULL)
├── userAgent (STRING, NULL)
├── createdAt (DATE, DEFAULT NOW)
├── method (STRING, NULL)
├── path (STRING, NULL)
├── statusCode (INTEGER, NULL)
├── duration (INTEGER, NULL)
├── severity (ENUM: low|medium|high|critical)
├── role (STRING, NULL)
├── resource (STRING, NULL)
├── resourceId (INTEGER, NULL)
└── status (ENUM: success|failure)

ArcoRequests
├── id (PK, INTEGER, autoIncrement)
├── requestType (ENUM: access|rectification|cancellation|opposition)
├── subjectCedulaHash (STRING, NOT NULL)
├── subjectCedulaEncrypted (TEXT, NULL)
├── requestedByName (STRING, NOT NULL)
├── requestedByUserId (INTEGER, NULL)
├── contactEmail (STRING, NULL)
├── reason (TEXT, NULL)
├── requestPayload (TEXT, NULL)
├── status (ENUM: pending|in_progress|completed|rejected)
├── resolutionNotes (TEXT, NULL)
├── resolvedAt (DATE, NULL)
├── createdAt (DATE, DEFAULT NOW)
└── updatedAt (DATE, DEFAULT NOW)
```

### 4.2 Indices (Migracion 007)

| Tabla | Columna(s) | Tipo |
|---|---|---|
| Visits | visitor_cedula | BTREE |
| Visits | status | BTREE |
| Visits | check_in_time | BTREE (DESC) |
| Visits | check_out_time | BTREE |
| ActivityLogs | createdAt | BTREE (DESC) |
| ActivityLogs | username | BTREE |
| ActivityLogs | action | BTREE |
| Visitors | company | BTREE |

### 4.3 Cifrado de Campos Sensibles

- Algoritmo: **AES-256-GCM** (authenticated encryption)
- Clave: `ENCRYPTION_KEY` (32 bytes hex = 64 caracteres hex)
- Campos cifrados: cedula, first_name, last_name, email, phone, job_title
- Mecanismo: Hook `beforeSave` en VisitorModel
- Cedula adicionalmente hasheada con SHA-256 para busquedas exactas

### 4.4 Migraciones

Ejecutadas por `server/src/scripts/apply-migrations.ts` usando `fs.readFileSync` + `sequelize.query()`.

| Migracion | Archivo | Proposito |
|---|---|---|
| 001 | `001-add-password-policy-fields.sql` | mustChangePassword, passwordChangedAt en Users |
| 002 | `002-add-account-lockout-fields.sql` | loginAttempts, lockedUntil en Users |
| 003 | `003-extend-audit-log-fields.sql` | method, path, statusCode, duration, severity, etc. en ActivityLogs |
| 004 | `004-add-timestamp-fields.sql` | arrival_time, entry_time, exit_time, target_department, host_person en Visits; IntermittentLogs |
| 005 | `005-add-photo-blobs-and-intermittent.sql` | photo_data, id_photo_data en Visitors; IntermittentLogs |
| 006 | `006-visitor-enhancements-and-separation.sql` | isBlocked, observations, createdAt en Visitors; lookup tables |
| 007 | `007-performance-indexes.sql` | Indices de rendimiento |
| 008 | `008-unify-intermittent-tables.sql` | Drop VisitIntervals (unificado con IntermittentLogs) |

---

## 4. API REST

Base URL: `http://localhost:3000/api/v1`

Version: `v1` (prefijo: `/api/v1/`)

Documentacion interactiva: `/api-docs` (Swagger, solo en development)

### 4.1 Autenticacion

```
POST /api/v1/auth/login            # Iniciar sesion
POST /api/v1/auth/refresh          # Renovar token
POST /api/v1/auth/forgot-password  # Solicitar recuperacion
POST /api/v1/auth/reset-password   # Restablecer contrasena
POST /api/v1/auth/change-password  # Cambiar contrasena (requiere auth)
```

Formato token JWT:
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "iat": 1740000000,
  "exp": 1740000900
}
```

### 4.2 Visitas

```
POST   /api/v1/visits/checkin              # Registrar ingreso
POST   /api/v1/visits/:id/checkout         # Registrar salida
POST   /api/v1/visits/:id/admit            # Admitir visita en espera
GET    /api/v1/visits/waiting              # Lista en espera
GET    /api/v1/visits/active               # Lista activas
GET    /api/v1/visits/intermittent         # Lista en salida intermitente
POST   /api/v1/visits/:id/intermittent     # Marcar como intermitente
POST   /api/v1/visits/:id/reactivate       # Reactivar desde intermitente
POST   /api/v1/visits/:id/intermittent-exit   # Salida temporal
POST   /api/v1/visits/:id/intermittent-reentry # Reingreso
GET    /api/v1/visits                      # Lista con filtros
```

### 4.3 Visitantes

```
GET    /api/v1/visitors/:cedula        # Obtener por cedula
PATCH  /api/v1/visitors/:cedula        # Actualizar datos
GET    /api/v1/visitors/companies      # Lista de empresas
GET    /api/v1/visitors                # Lista paginada
GET    /api/v1/visitors/:cedula/photo  # Foto del rostro
GET    /api/v1/visitors/:cedula/id-photo # Foto del documento
```

### 4.4 Root / SuperAdmin Dashboard (Gestion de Usuarios)

```
GET    /api/v1/root/users                    # Listar usuarios
POST   /api/v1/root/users                    # Crear usuario
PUT    /api/v1/root/users/:id                # Actualizar usuario
DELETE /api/v1/root/users/:id                # Eliminar usuario
POST   /api/v1/root/users/:id/reset-password # Resetear contrasena
GET    /api/v1/root/audit-logs               # Logs de auditoria
```

### 4.5 Respaldos

```
POST   /api/v1/backups                # Crear respaldo
GET    /api/v1/backups                # Listar respaldos
POST   /api/v1/backups/:filename/restore # Restaurar respaldo
```

### 4.6 Reportes

```
GET    /api/v1/reports/stats               # Estadisticas generales
GET    /api/v1/reports/stats/monthly        # Reporte mensual
GET    /api/v1/reports/alerts              # Alertas de check-out omitido
GET    /api/v1/reports/comparison           # Comparativa de periodos
```

### 4.7 Auditoria

```
GET    /api/v1/audit/logs      # Logs con filtros
GET    /api/v1/audit/stats     # Estadisticas de actividad
GET    /api/v1/audit/export    # Exportar logs
GET    /api/v1/audit/actions   # Lista de acciones disponibles
GET    /api/v1/audit/users     # Lista de usuarios con actividad
GET    /api/v1/audit/config    # Politica de retencion
```

### 4.8 Privacidad (ARCO)

```
POST   /api/v1/privacy/arco-requests              # Crear solicitud ARCO
GET    /api/v1/privacy/arco-requests              # Listar solicitudes
PATCH  /api/v1/privacy/arco-requests/:id/status   # Actualizar estado
GET    /api/v1/privacy/subjects/:cedula           # Acceso a datos
PATCH  /api/v1/privacy/subjects/:cedula           # Rectificacion
DELETE /api/v1/privacy/subjects/:cedula           # Cancelacion (anonimizar)
POST   /api/v1/privacy/subjects/:cedula/opposition # Oposicion
```

### 4.9 Eventos SSE

```
GET    /api/v1/events/visits?token=<jwt>  # Stream en tiempo real de visitas
```

### 4.10 Health

```
GET    /api/v1/health  # Health check (publico)
```

### 4.11 Codigos de Respuesta

| Codigo | Significado |
|---|---|
| 200 | OK |
| 201 | Creado |
| 400 | Error de validacion |
| 401 | No autenticado |
| 403 | Prohibido (rol) o cambio de password requerido |
| 404 | No encontrado |
| 409 | Conflicto (usuario existente) |
| 429 | Rate limit excedido |
| 500 | Error interno |

---

## 6. Seguridad

### 6.1 Autenticacion JWT

- Algoritmo: HS256
- Access token: 15 minutos de validez
- Refresh token: 7 dias de validez
- Blacklist en memoria (TokenBlacklist) — tokens revocados invalidados globalmente
- Invalidacion por usuario al resetear password o cambiar rol

### 6.2 Política de Contrasenas

- Longitud: 12-128 caracteres
- Requiere: mayuscula, minuscula, digito, caracter especial
- Lista negra de contrasenas comunes (~1000 entradas)
- Bcrypt rounds: 12 (configurable)
- Maximo 5 intentos fallidos antes de bloqueo de 15 minutos

### 6.3 Rate Limiting

| Limiter | Ventana | Limite (dev) | Limite (prod) |
|---|---|---|---|
| General | 1 minuto | 100 | 100 |
| Auth (login) | 1 minuto | 20 | 10 |
| Admin | 5 minutos | 150 | 30 |
| Reportes | 1 hora | 100 | 20 |

### 6.4 Firewall de Middleware

- Bloqueo de User-Agent sospechosos: `lucid`, `scrapy`, `curl`, `wget`, `python`, `scanner`, `sqlmap`, `nmap`, `nikto`, `burp`
- Bloqueo de paths administrativos: `/admin`, `/wp-admin`, `/phpmyadmin`
- Bloqueo de patrones de ataque en URL: `<script`, `DROP TABLE`, `UNION SELECT`, `exec(`, `../../`
- Bloqueo temporal ante multiples eventos sospechosos (60 en 5 minutos)
- Bloqueo permanente via `blockIP()` / `unblockIP()`
- Headers de seguridad: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`

### 6.5 CORS

- Controlado por variable `ALLOWED_ORIGINS` (comma-separated)
- Actualizado automaticamente por `auto-env.bat` al cambiar IP
- En produccion debe apuntar al dominio real

### 6.6 Helmet

- Middleware Helmet activo en todos los entornos
- HSTS habilitado solo en produccion (requiere SSL valido)

### 6.7 Validacion de Entrada

- Schemas Zod en todos los endpoints publicos: auth, visits, privacy
- Middleware `validate()` que parsea y rechaza payloads invalidos
- Middleware `sanitize` en campos string

### 6.8 Logging

- Winston con rotacion diaria de archivos
- Directorio: `logs/server/`
- Niveles: error, warn, info, debug (configurable via `LOG_LEVEL`)
- Nunca se registran contrasenas o tokens en texto plano

---

## 6. Modelo de Seguridad (AuthPayload)

```typescript
// server/src/types/express.d.ts
export interface AuthPayload {
  id: number;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
  mustChangePassword?: boolean;
}
```

### Roles y Permisos

| Rol | Visitas | Visitantes | Reportes | Auditoria | Usuarios | Respaldos | ARCO |
|---|---|---|---|---|---|---|---|
| root | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |
| admin | CRUD | CRUD | CRUD | CRUD | R* | CRUD | CRUD |
| operador | CRUD | R | R | - | - | - | R |
| auditor | - | R | R | CRUD | - | - | CRUD |
| demo | CRUD | R | R | - | - | - | R |

*admin solo lectura en Usuarios (no puede crear/modificar/eliminar)

Nota: `root` es el unico rol con acceso al dashboard SuperAdmin (ruta `/root`). `demo` incluye auto-tour guiado.

---

## 7. Casos de Uso (Application Layer)

Cada operacion de negocio se implementa como un Use Case en `server/src/application/usecases/`.

| Use Case | Input | Output |
|---|---|---|
| LoginUseCase | username, password | { user, accessToken, refreshToken } |
| ChangePasswordUseCase | userId, currentPassword, newPassword | void |
| RefreshTokenUseCase | refreshToken | { accessToken } |
| CreateUserUseCase | { username, password, role } | User |
| UpdateUserUseCase | { id, username?, role? } | User |
| DeleteUserUseCase | userId | void |
| ResetUserPasswordUseCase | { userId, newPassword } | void |
| ListUsersUseCase | void | User[] |
| GetAuditLogsUseCase | { userId?, action?, limit?, offset? } | { logs, total } |

---

## 8. Infraestructura

### 8.1 Servicios

| Servicio | Archivo | Proposito |
|---|---|---|
| JwtAuthService | `infrastructure/services/JwtAuthService.ts` | Generacion/verificacion de tokens JWT |
| EmailService | `infrastructure/services/EmailService.ts` | Envio de correos (STUB: nodemailer no instalado, pendiente de configurar SMTP) |
| TokenBlacklist | `infrastructure/services/TokenBlacklist.ts` | Blacklist en memoria de tokens revocados |
| Encryption | `utils/Encryption.ts` | Cifrado AES-256-GCM de campos sensibles |
| EventEmitterService | `infrastructure/services/EventEmitterService.ts` | Eventos SSE en tiempo real |

### 8.2 Contenedor DI (Dependency Injection)

`server/src/shared/Container.ts` — registro manual de dependencias sin framework DI.

```typescript
container.userRepository    // UserRepository (Sequelize)
container.visitRepository   // VisitRepository
container.authService       // JwtAuthService
container.passwordPolicy    // PasswordPolicy
```

### 8.3 Logger (Winston)

```typescript
// server/src/config/logger.ts
logger.info()    // Informacion general
logger.warn()    // Eventos de seguridad/advertencia
logger.error()   // Errores
logger.debug()   // Depuracion (solo development)
```

Rotacion: diaria, max 30 dias, compresion .gz

### 8.4 Retention Policy (GDPR)

Ejecutada por `server/src/utils/retention.ts` en un scheduler diario:

| Accion | Periodo | Comportamiento |
|---|---|---|
| Purga ActivityLogs | `AUDIT_LOG_RETENTION_DAYS` (defecto 365) | DELETE WHERE createdAt < NOW() - days |
| Purga Visits completadas | `DATA_RETENTION_DAYS` (defecto 60) | DELETE WHERE status='completed' AND check_out_time < NOW() - days |
| Purga Visitantes huérfanos | Misma politica | DELETE Visitors sin visits asociadas |
| Purga Fotos | Misma politica | Elimina archivos del disco |

---

## 9. CI/CD (GitHub Actions)

Archivo: `.github/workflows/ci.yml`

Eventos: push, pull_request (ramas: main, develop, master)

Jobs:
1. **server-tests**: PostgreSQL service → `vitest run` en server/
2. **client-tests**: `vitest run` en client/
3. **lint**: `npm run lint` en client/
4. **build**: `npm run build` en client/ + `tsc --noEmit` en server/

---

## 10. Pre-commit Hooks (Husky v9)

Archivo: `.husky/pre-commit`

Ejecuta automaticamente en cada `git commit`:

1. `cd client && npm run lint`
2. `cd client && npx tsc --noEmit`
3. `cd client && npm test`
4. `cd server && npx tsc --noEmit`
5. `cd server && npm test`

Se salta en ramas: main, develop, master.

---

## 11. Variables de Entorno

| Variable | Obligatoria | Defecto | Proposito |
|---|---|---|---|
| NODE_ENV | No | development | development/production |
| PORT | No | 3000 | Puerto del servidor |
| DB_HOST | No | localhost | Host PostgreSQL |
| DB_PORT | No | 5432 | Puerto PostgreSQL |
| DB_NAME | No | visitors | Nombre BD |
| DB_USER | No | postgres | Usuario BD |
| DB_PASSWORD | Prod | - | Contrasena BD |
| DB_SSL | No | false | SSL para BD |
| JWT_SECRET | **SI** | - | Clave de firma JWT (64 bytes hex) |
| JWT_REFRESH_SECRET | No | derivada de JWT_SECRET | Clave refresh JWT |
| ENCRYPTION_KEY | Prod | - | Clave cifrado AES (32 bytes hex) |
| BCRYPT_ROUNDS | No | 12 | Costo de bcrypt |
| MAX_LOGIN_ATTEMPTS | No | 5 | Intentos antes de bloqueo |
| LOCKOUT_DURATION_MINUTES | No | 15 | Duracion bloqueo |
| ALLOWED_ORIGINS | No | - | Origenes CORS permitidos |
| SMTP_HOST | No | - | Servidor SMTP |
| SMTP_USER | No | - | Usuario SMTP |
| SMTP_PASSWORD | No | - | Password SMTP |
| DATA_RETENTION_DAYS | No | 60 | Dias retencion datos visitantes |
| AUDIT_LOG_RETENTION_DAYS | No | 365 | Dias retencion logs |
| BACKUP_PATH | No | ./Backups | Ruta de respaldos |

---

## 12. Despliegue

### 12.1 Inicio de Servicios

```bash
# Servidor (puerto 3000)
cd server && npm run dev

# Cliente (puerto 5173)
cd client && npm run dev
```

URLs de acceso:
- Cliente: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`

### 12.2 Scripts Windows

| Script | Proposito |
|---|---|
| `start.bat` | Inicio de servicios |
| `detener.bat` | Detener servicios |
| `status.bat` | Estado de servicios + URLs de acceso |
| `verify-system.bat` | Verificacion completa de salud del sistema |
| `auto-env.bat` | Detecta IP LAN y configura .env + CORS |
| `monitor-health.bat` | Monitoreo continuo en tiempo real |

### 12.3 Electron (Standalone)

```bash
npm run electron:dev   # Desarrollo
npm run dist           # Generar ejecutable
```

---

## 13. Pruebas

### 13.1 Servidor (Vitest)

```
cd server && npm test              # Todas las pruebas
cd server && npx vitest run        # Una ejecucion
cd server && npx vitest --watch    # Modo watch
cd server && npm run test:coverage # Cobertura
```

Archivos de prueba: `server/src/__tests__/**/*.test.ts`

Cobertura actual: ~142 tests en 14 archivos.

### 13.2 Cliente (Vitest)

```
cd client && npm test
```

Cobertura actual: ~test en 7 archivos.

---

## 14. Migraciones y Seed

```bash
# Aplicar migraciones SQL
cd server && npm run migrate

# Seed de datos de prueba
cd server && npm run seed

# Seed + limpieza previa
cd server && npm run seed:clean

# Reset completo de BD
cd server && npm run db:reset
```

---

## 15. Manejo de Errores

### 15.1 Errores HTTP

Todos los errores siguen el formato `ResponseBuilder`:

```json
{
  "success": false,
  "error": {
    "code": "CODIGO_ERROR",
    "message": "Descripcion para el usuario",
    "details": [{ ... }]  // Solo en errores de validacion
  }
}
```

### 15.2 Errores de Configuracion

`AppConfig.validate()` lanza error al inicio si faltan variables requeridas (JWT_SECRET, ENCRYPTION_KEY en prod, DB_PASSWORD en prod).

### 15.3 Crash Log

Si el servidor no puede conectar a la BD, escribe `server_crash_log.txt` en `data/`.

---

## 16. Dependencias Principales

### Server

| Paquete | Uso |
|---|---|
| express | Framework HTTP |
| sequelize | ORM |
| pg | Driver PostgreSQL |
| jsonwebtoken | JWT |
| bcryptjs | Hashing de contrasenas |
| winston | Logging |
| zod | Validacion de schemas |
| nodemailer | Correo electronico |
| exceljs | Exportacion Excel |
| pdfkit | Exportacion PDF |
| cors | CORS middleware |
| helmet | Headers de seguridad |
| express-rate-limit | Rate limiting |

### Client

| Paquete | Uso |
|---|---|
| react | UI |
| react-router-dom | Enrutamiento |
| tailwindcss | Estilos |
| lucide-react | Iconos |
| axios | HTTP client |
| xlsx | Exportacion Excel |
| jspdf + html2canvas | Exportacion PDF |
| vitest + @testing-library/react | Pruebas |
