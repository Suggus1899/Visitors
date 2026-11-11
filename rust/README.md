# LogMaster en Rust — migración a un solo ejecutable

Migración del sistema de control de visitantes (hoy Go/Chi + Next.js/BFF +
PostgreSQL 16 + Nginx + Docker) a un único `logmaster.exe` en Rust:
Axum + Tokio, SQLite embebido en modo WAL, frontend Leptos con SSR y
servicio de Windows con arranque automático.

Documento de referencia: `workspace/your_files/migracion-rust-logmaster/migracion-rust-logmaster.pdf`
(33 págs, 2026-11-10). Línea base del sistema actual:
`LINEA_BASE_TECNICA.md`, corte b760bc8 (2026-10-31).

## Estado por fases (documento, sección 18)

| Fase | Contenido | Estado |
| --- | --- | --- |
| 0 · Base | Corte congelado + fixtures exportados (`rust/fixtures/`) | ✅ esta rama |
| 1 · Esqueleto | Workspace, binario `logmaster` con Axum, `serve`/`check`/`migrate`, servicio de Windows mínimo, SQLite + migraciones base | ✅ esta rama |
| 2 · Datos | Esquema SQLite de las 6 migraciones, repositorios, `convert` desde PostgreSQL y preflight | ✅ esta rama |
| 3 · Cripto y sesión | AES-GCM/HMAC/bcrypt compatibles, JWT, cookies, roles como extractores | ✅ esta rama |
| 4 · API por familias | auth, visits, visitors, privacy, audit, reports, superadmin, backups, SSE | Pendiente |
| 5 · Frontend | Leptos: login y operación primero; luego admin, auditoría, privacidad y root | Pendiente |
| 6 · Operación | Respaldos con age, ensayo semanal, retención, correo, bandeja, logs | Pendiente |
| 7 · Comparación | Carga pequeña y recorridos en ambas versiones, mismo entorno | Pendiente |
| 8 · Corte | Conversión de datos reales, servicio en el equipo destino, observación | Pendiente |

> Nota de mapeo: en el documento, la fase 0 es solo el congelamiento y los
> fixtures, y el esqueleto es la fase 1. En esta rama se ejecutaron las dos
> juntas como "Fase 0" del encargo, porque el esqueleto sin el corte
> congelado no se puede verificar contra nada.

## Estructura

```text
rust/
├── Cargo.toml          # workspace (members: crates/app, crates/store)
├── .cargo/config.toml  # /MT estatico para el target MSVC
├── .gitignore          # /target/ y *.pdb fuera del repo
├── README.md           # este archivo
├── fixtures/           # Fase 0: corte congelado, reutilizable por Go y por Rust
│   ├── routes.json     # inventario de las 59 rutas (copia de server-go/contracts/routes.json)
│   ├── roles.md        # tabla de autorizacion (linea base, seccion 3)
│   ├── crypto-node.json        # vectores de compatibilidad Go/Node (copia de server-go/contracts/crypto-node.json)
│   ├── common-passwords.json   # lista de contrasenas comunes (copia de server-go/contracts/common-passwords.json)
│   └── baseline.md     # referencia del corte: commits, versiones y limites
└── crates/
    ├── app/            # binario logmaster: CLI, Axum, servicio de Windows
    ├── crypto/         # AES-256-GCM, HMAC, trigramas, bcrypt y contrasenas (fase 3)
    └── store/          # SQLite embebido (WAL, FK ON) + migraciones rusqlite_migration
```

El código Go/Next.js existente **no se toca** en esta fase. Las rutas de
dominio (visitas, visitantes, privacidad, auditoría, reportes, respaldos)
llegan en la fase 4; el frontend Leptos, en la fase 5.

## Compilar

En Windows, con rustup y el target MSVC (lo fiable según el documento,
sección 17; compilar en Linux para Windows exige enlace cruzado):

```powershell
cargo build --release -p logmaster
# target\release\logmaster.exe
```

En Linux (desarrollo del esqueleto; el módulo de servicio solo compila
para el target Windows):

```sh
cargo check -p logmaster
cargo check -p logmaster --target x86_64-pc-windows-msvc
cargo test
```

## Uso del esqueleto (fase 1)

```text
logmaster.exe                  # arranca el servidor en consola
logmaster.exe serve            # idem, explicito
logmaster.exe check            # version de esquema, integridad y ping de la base
logmaster.exe migrate          # aplica migraciones pendientes
logmaster.exe service install  # instala el servicio de Windows (admin)
logmaster.exe service start | stop | restart | uninstall
logmaster.exe convert --from-postgres <cadena> --to <sqlite>
logmaster.exe preflight --from-postgres <cadena> | --db <sqlite>
```

## Fase 2 · Datos: esquema, repositorios, convert y preflight

- **Migraciones rusqlite 2–7** = Goose 00001–00006: las 12 tablas de
  dominio (`Users`, `Visitors`, `Visits`, `IntermittentLogs`,
  `VisitorEditHistories`, `ActivityLogs`, `ArcoRequests`, `Departments`,
  `VisitPurposes`, `VisitorSearchTokens`, `SearchIndexState`,
  `IdentityIndexState`). `TIMESTAMPTZ` → `TEXT` ISO 8601 UTC canónico,
  `BYTEA` → `BLOB`, `BOOLEAN` → `INTEGER` 0/1, enums → `TEXT` con
  `CHECK`. Índices parciales únicos: una visita abierta por identidad
  y un intervalo abierto por visita. Desviaciones documentadas en
  `crates/store/src/migrations.rs` (el `CHECK` de `status` ya incluye
  `'cancelled'` desde la migración 2; `SequelizeMeta` y
  `goose_db_version` no se crean).
- **Repositorios** (`crates/store/src/repos/`): usuarios, visitantes,
  visitas con su máquina de estados, bitácora, ARCO con cancelación
  completa, catálogos y tokens de búsqueda. Las operaciones que agrupan
  mutación + auditoría corren en transacción inmediata del llamador
  (`Store::tx_immediate`), el equivalente a `FOR UPDATE` + transacción
  de Go. Errores de dominio con códigos (`OPEN_VISIT_EXISTS`,
  `INVALID_VISIT_STATE`, `VISIT_NOT_FOUND`, `VISITOR_BLOCKED`, ...).
- **`convert`** (`crates/app/src/convert.rs`): copia tabla por tabla en
  orden de dependencias, dentro de una sola transacción, con
  verificación de conteos origen/destino y preflight del destino. El
  destino no debe existir y se borra el parcial si algo falla. Las
  columnas enum de PostgreSQL se leen con `::text`. El `id` de
  `SearchIndexState`/`IdentityIndexState` es `BOOLEAN` en PostgreSQL y
  `INTEGER` 1 en SQLite. Conexión **sin TLS**: ejecutar en el mismo host
  que PostgreSQL o en su red de confianza.
- **`preflight`**: mismas comprobaciones que Go antes de adoptar una
  copia (descifrado de identidades, visitas abiertas duplicadas,
  relaciones rotas, intervalos duplicados, tokens de 32 bytes, estados
  de índice) más la integridad de SQLite. La clave sale de
  `ENCRYPTION_KEY` (o `PII_ENCRYPTION_KEY`), 32 bytes en hex; sin ella
  el descifrado queda `omitida`, no fallido.

Verificado en Linux (2026-11-11): `cargo test --workspace`
(38 tests del store + 1 del app) y e2e real contra PostgreSQL 16 local
con datos ficticios (2 usuarios, 3 visitantes —uno anonimizado—, 5
visitas, 2 intervalos, 1 historial, 4 registros de auditoría, 2 ARCO,
3 tokens): `preflight` del origen, `convert` con conteos idénticos y
`preflight` del destino, todo en verde; también se comprobó que un
origen con visita abierta duplicada y una clave incorrecta cancelan la
conversión sin dejar parciales. El `cargo check --target
x86_64-pc-windows-msvc` de la fase 1 sigue pendiente de re-verificar
tras estos cambios (solo check, no enlazado).

## Fase 3 · Cripto y sesión: AES-GCM/HMAC/bcrypt, JWT, cookies y roles

- **Crate `logmaster-crypto`** (`crates/crypto/`): traduce
  `server-go/internal/security/crypto.go`, `password.go` y
  `server-go/internal/search/tokens.go` sin inventar formatos.
  AES-256-GCM con el formato versionado `ENC:hex:hex:hex` de Go (nonce
  de 16 bytes) y tolerancia a valores históricos sin cifrar; HMAC-SHA-256
  de identidad (`logmaster/visitor-identity/v1`) y trigramas de búsqueda
  (`logmaster/name-search/v1`), así que los índices existentes siguen
  válidos; bcrypt con coste 12 y política 12–72 bytes
  (mayúscula/minúscula/número/símbolo, lista de contraseñas comunes),
  que verifica los hashes históricos, incluidos los de contraseñas
  largas de Node; token aleatorio de recuperación (32 bytes hex) y su
  hash SHA-256; y el alcance exacto de campos cifrados del perfil e
  historial (cédula, nombres, cargo, contacto, observaciones; empresa
  e imágenes sin cifrado individual). `store::crypto` reexporta la
  crate; `preflight` y `convert` no cambian. Los vectores de
  compatibilidad viven en `fixtures/crypto-node.json` (copia de
  `server-go/contracts/crypto-node.json`).
- **Sesión JWT** (`crates/app/src/session.rs`): HS256 con los mismos
  claims de Go (`id`, `username`, `role`, `tokenVersion`,
  `sessionStartedAt`, `absoluteExpiresAt`, `iat`, `exp`), acceso 15 min
  y renovación 7 días con secretos independientes, máximo absoluto de 7
  días desde el inicio, leeway 0 como jwt v5, `tokenVersion` contra la
  base en cada validación, rechazo del refresh histórico sin fechas y
  revocación por `tokenVersion` (logout, cambio de contraseña y
  restauración). Recuperación con token aleatorio hasheado, 15 min, un
  solo uso y respuesta genérica; el envío del correo es de la fase 6
  (lettre). El gate de cambio obligatorio solo permite
  `/api/v1/auth/change-password` y `/api/v1/auth/session`.
- **Cookies** (`crates/app/src/cookies.rs`): Axum emite y lee
  directamente `__Host-logmaster-access` y `__Host-logmaster-refresh`
  (Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age de la expiración del
  token) y `__Host-logmaster-csrf` para el doble envío, con los mismos
  nombres que ponía Next. `safe_return_to` valida el destino interno
  de `/auth/renew` como en el cliente.
- **Roles como extractores** (`crates/app/src/roles.rs`): tabla completa
  de la línea base, sección 3 (demo solo lee); el handler o su ruta
  declara el permiso y no se ejecuta si la sesión no lo cumple.
  `authorize()` cubre el permiso que depende del cuerpo (`isBlocked`
  en `editVisitor`, como Go).
- **Middleware** (`origin.rs`, `rate_limit.rs`, `client_ip.rs`): el
  orden de Go (`headers`, `limit`, `authenticate`). Origen no permitido
  403, origen obligatorio en escrituras (Referer como alternativa) y
  CSRF por doble envío solo con sesión por cookie. Límite en memoria:
  general 100/60 s, autenticación 500/15 min, por cuenta 20/15 min
  (para el login de la fase 4), 429 con `Retry-After` 60/900, tope de
  10000 cubos; `/health` sin límite.
- **Configuración** (`crates/app/src/config.rs`): secretos por entorno
  con los mismos nombres de Go (`JWT_SECRET`, `JWT_REFRESH_SECRET`,
  `ENCRYPTION_KEY` / `PII_ENCRYPTION_KEY`, `EDIT_PASSWORD`,
  `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`,
  `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`,
  `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `APP_URL`,
  `CORS_ORIGINS`, `TRUSTED_PROXY_CIDRS`). `serve` y `check` exigen los
  secretos, como el CLI de Go. `APP_URL` es por defecto
  `https://localhost:8443` (el BFF usaba `https://localhost:5173`, el
  origen de Next; aquí ya no hay Next). El `config.toml` y DPAPI son
  de la fase 6.
- **Arranque**: `serve` y `check` verifican las huellas de clave de los
  índices (`Store::verify_key_fingerprints`): error con clave
  equivocada; aviso si aún no están preparados (la reconstrucción
  `ops reindex` es de la fase 6), a diferencia de Go, que no arranca
  sin índice preparado.

Verificado en Linux (2026-11-11): `cargo test --workspace` (75 tests:
app 24, crypto 15, store 36), `cargo fmt --check`,
`cargo clippy --workspace --all-targets` sin avisos,
`cargo check --workspace --target x86_64-pc-windows-msvc` con el shim
de `lib.exe` (solo check, no enlazado) y humo real del binario
(`/health` y `/api/v1/health` en 200; `check` con huellas ok con la
clave correcta y error con la incorrecta). La matriz de roles HTTP
traduce `permissions_test.go` (mismos 5 roles, mismas 6 rutas, mismo
resultado) con JWT reales y la pila real de capas. Lo de Windows queda
pendiente de probar en el PC de Gustavo, como en las fases anteriores.

Por defecto escucha en `127.0.0.1:8443` (HTTP plano en el esqueleto) y usa
la base `data/logmaster.db` junto al directorio de trabajo, o
`%ProgramData%\LogMaster\data\logmaster.db` en Windows. Se puede anular
con `LOGMASTER_BIND`, `LOGMASTER_PORT` y `LOGMASTER_DB_PATH`.
El TLS con rustls y los secretos con DPAPI llegan con las fases
siguientes (documento, secciones 14.4 y 15).

## Salud

- `GET /health` — salud del proceso.
- `GET /api/v1/health` — comprueba la base SQLite y devuelve 503
  (`DB_UNAVAILABLE`) si no responde, con el mismo sobre de respuesta
  del contrato actual (`success` / `data`, `error.code` / `error.message`).

## Qué NO hace todavía este esqueleto

- No hay rutas de dominio (fase 4: las 59 rutas por familias, con
  `auth` primero), ni frontend Leptos (fase 5). La autenticación, la
  sesión, las cookies y los roles ya están (fase 3) como servicio y
  capas listos para esas rutas; el envío del correo de recuperación es
  de la fase 6 (lettre).
- `service install` registra el servicio con arranque automático
  retrasado y el binario con `service run` como punto de entrada del SCM.
  Las acciones de recuperación (reinicio a los 5 s en el 1.º y 2.º fallo)
  se configuran con `sc.exe failure` hasta tener instalador propio;
  la cuenta virtual `NT SERVICE\LogMaster` y los permisos NTFS llegan
  con la fase 6 de operación.
