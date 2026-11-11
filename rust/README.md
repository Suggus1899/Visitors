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
| Doble motor (entre 3 y 4) | Traits de repositorio, `Sqlite*`/`Pg*` sobre sqlx, selección por configuración, prueba de conexión al arrancar, `config.toml` junto al .exe, primer arranque en C: + acceso directo | ✅ esta rama |
| 4 · API por familias | auth, visits, visitors, privacy, audit, reports, superadmin, backups, SSE | ✅ esta rama |
| 5 · Frontend | Leptos SSR: login, operación, admin, auditoría, privacidad y root; 4 recorridos Playwright | ✅ esta rama |
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
├── config.example.toml # ejemplo de config.toml junto al .exe (doble motor)
├── docs/
│   └── instalacion-postgresql.md  # tutorial guiado de PostgreSQL 16 (Windows)
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
logmaster.exe check            # motor, base, version, latencia, esquema, integridad y huellas
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
  origen de Next; aquí ya no hay Next). El `config.toml` junto al .exe
  y la selección de motor llegaron con el doble motor (ver abajo);
  DPAPI para los secretos sigue siendo de la fase 6.
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

## Doble motor por configuración (entre fase 3 y fase 4)

SQLite sigue siendo el destino principal: un solo .exe con la base
embebida en WAL. PostgreSQL 16 es el motor elegible por
configuración, para el equipo que ya tiene PostgreSQL o necesita
multi-máquina. **No hay sincronización entre ambos**: cada motor
tiene sus propios datos; `convert` sigue siendo solo PG → SQLite.

- **Cómo se elige.** En el `config.toml` junto al .exe, sección
  `[database]`: `engine = "sqlite"` (por defecto) o
  `engine = "postgres"` con `url = "postgres://usuario:clave@host:5432/base"`.
  Por entorno: `LOGMASTER_DATABASE` (`sqlite` | `postgres`) y
  `DATABASE_URL`. El entorno gana al archivo, y el archivo al
  defecto. `serve`, `check`, `migrate`, `convert` y `preflight`
  funcionan con ambos; `migrate` aplica las migraciones del motor
  elegido y `check` valida la conexión del motor elegido.
- **Traits de repositorio** (`crates/store/src/repos/traits.rs`): el
  dominio y los handlers futuros trabajan solo contra los traits
  (`UserRepository`, `VisitorRepository`, `VisitRepository`,
  `AuditRepository`, `ArcoRepository`, `CatalogRepository`,
  `SearchTokenRepository`), sin SQL pegado a SQLite fuera de la
  implementación. Son `async` (`async_trait`): sqlx es async y Axum
  ya lo es; un trait síncrono obligaría a `block_on` en cada consulta
  de PostgreSQL. La implementación SQLite ejecuta rusqlite en línea
  (local, un solo escritor, sub-milisegundo). Un método = una
  operación atómica (su propia transacción). Limitación conocida: el
  patrón de la fase 2 de componer varias funciones libres en una
  `tx_immediate` del llamador (el check-in de Go: bloqueo asesor +
  insertar perfil + insertar visita + auditoría en una transacción)
  no cabe en traits por repositorio; la adaptación mínima es una
  operación compuesta en la fase 4 (servicio de dominio sobre los
  traits, o `UnitOfWork`). Hasta entonces, llamar los tres métodos
  seguidos deja los mismos datos y códigos, pero sin atomicidad
  conjunta.
- **Variante SQLite** (`Sqlite*Repository`): los repositorios de la
  fase 2 detrás de los traits, mismo comportamiento, mismas
  migraciones, mismos códigos.
- **Variante PostgreSQL** (`Pg*Repository`, sqlx): reutiliza casi
  literal el SQL de Go (`$n`, `RETURNING`, upserts). Las migraciones
  Goose 00001–00006 se copiaron byte a byte a
  `crates/store/migrations-pg/` y el runner propio replica Goose v3
  (una transacción por migración, versión en `goose_db_version`).
  Go no exige ninguna extensión en esas migraciones (no hay
  `pg_trgm`: los trigramas son tokens HMAC calculados en la crate
  `crypto` y guardados como columnas). Versión de esquema: 7 en
  SQLite (la 1 es infraestructura propia), 6 en PostgreSQL.
  Detalles de dialecto: los enums se escriben con cast explícito
  (`$n::"enum_..."`, obligatorio porque sqlx envía parámetros
  tipados como `text`), los ids `INTEGER` se mapean a `i64`, y los
  timestamps los pasa el llamador en ISO 8601 UTC canónico.
- **Prueba de conexión (sin comando `db test`).** No existe
  `logmaster db test`: se decidió que la prueba no sea un comando
  del CLI. Va en la configuración: `test_on_startup = true` en
  `[database]` (siempre activo; `false` es un error de
  configuración). Al arrancar (`serve`) y en `check`, el ejecutable
  abre la conexión configurada y ejecuta una consulta mínima
  (`SELECT version()` en PostgreSQL) y reporta motor, host/puerto o
  archivo, versión, latencia y esquema en el log de arranque y en
  `GET /api/v1/health`, que devuelve `database: ok` solo si la
  prueba pasa. Si falla, el motivo concreto (credenciales, host
  inalcanzable, base inexistente, TLS) y el arranque **falla de
  forma visible, no silenciosa**. Para SQLite el mismo mecanismo
  reporta archivo, integridad y versión de esquema.
- **`config.toml` junto al .exe** (`config.example.toml` en la raíz
  de `rust/`; el repo lleva solo el ejemplo). Al arrancar, el .exe
  usa el `config.toml` junto a él si existe y, si no, lo crea a
  partir del ejemplo sin pisar nunca el del usuario
  (`LOGMASTER_CONFIG` fija otra ruta; las actualizaciones nunca
  sobrescriben la configuración). Los secretos **no** van en el
  archivo: van por entorno (o archivo de secretos DPAPI en fase 6).
  Diferencias entre el ejemplo canónico y la implementación real:
  (1) la `url` debe ser formato URL
  `postgres://usuario:clave@host:5432/base` (sqlx no acepta
  `clave=valor`); (2) no hay `sslmode=require`: esta compilación no
  soporta TLS con PostgreSQL (misma limitación que `convert`, que
  usa `NoTls`): mismo host o red de confianza; (3)
  `test_on_startup = false` es un error de configuración; (4) las
  secciones `[mail]`, `[retention]` y `[backup]` se parsean pero
  aún no tienen efecto (fase 6; se avisa en el log); (5) los
  secretos en `[security]` se ignoran con advertencia (van por
  entorno); (6) `[install] folder` y `desktop_shortcut` alimentan
  la lógica de primer arranque.
- **Primer arranque en C:.** Al ejecutar el .exe por primera vez
  fuera del disco C: (Descargas, escritorio, USB), avisa en consola
  y ofrece copiarse a `C:\LogMaster` (o `[install] folder`) con
  confirmación, llevando consigo el `config.toml`; si se copia, el
  proceso termina indicando que se ejecute desde allí. Sin terminal
  solo avisa y sigue. En C: crea el acceso directo
  `LogMaster.lnk` en el escritorio (también en `service install`),
  sin duplicarlo si ya existe. El acceso directo apunta al propio
  .exe: se valoró que abriera la interfaz web
  (`https://localhost:8443`), pero `mslnk` 0.1.8 exige que el
  destino exista en disco y no admite un destino URL limpio; al
  hacer doble clic se arranca el servidor en consola y la web queda
  en `https://localhost:8443`. La creación real del .lnk solo está
  verificada con el check de Windows y pruebas unitarias de rutas:
  queda pendiente probarla en el PC de Gustavo.
- **Tutorial de PostgreSQL**: `docs/instalacion-postgresql.md`
  (instalador oficial 16, base y roles `logmaster_pilot`,
  `logmaster_runtime`, `logmaster_backup`,
  `logmaster_restore_test` con sus privilegios mínimos, puerto
  5432, comprobación con `psql`, `config.toml` y errores típicos).

Verificado en Linux (2026-11-11): `cargo test --workspace`
(97 tests: app 33, crypto 15, store 38, contrato 11 — cada caso del
contrato corre en ambos motores), `cargo fmt --check`,
`cargo clippy --workspace --all-targets` sin avisos,
`cargo check --workspace --target x86_64-pc-windows-msvc` con el
shim de `lib.exe`, y humo real del binario en ambos motores
(`serve` + `/health` con SQLite y con PostgreSQL 16 local; el
arranque con credenciales malas falla con salida 1 y el motivo
concreto). Lo de Windows queda pendiente de probar en el PC de
Gustavo, como en las fases anteriores.

## Fase 4 · API por familias: las 59 rutas, con paridad

Las rutas viven en `crates/app/src/routes/` (una familia por módulo)
y solo trabajan contra los traits de repositorio async y el
`UnitOfWork` de `crates/store`: el check-in y cada transición que
toca varios repositorios son atómicos en ambos motores (SQLite con
transacción inmediata, PostgreSQL con transacción + bloqueo asesor
por cédula). La auditoría se escribe en la misma transacción, con el
`entity_id` real. Los avisos SSE se publican después del commit.

- `auth`: login/refresh/forgot/reset/logout/session/change-password/
  renew, con `RateLimiter` por cuenta y `Retry-After: 900`.
- `visits`: check-in con consentimiento, transiciones del ciclo,
  listas por estado, filtrada, calendario (62 días, America/Caracas)
  y exportación JSON con los límites de Go por formato.
- `visitors`: detalle, empresas, fotos BLOB autenticadas, edición con
  contraseña adicional en cada guardado e historial.
- `privacy`: solicitudes ARCO, acceso, rectificación y cancelación
  con constancia de verificación de identidad.
- `audit`: bitácora, estadísticas, CSV con BOM y config de retención.
- `reports`: stats, mensual, comparativo y alertas (con las
  peculiaridades de agregación de Go).
- `superadmin`: cuentas solo para root (sin crear rol root, sin
  borrarlo ni cambiar su rol) y su variante de bitácora.
- `backups`: listado desde `backup.path`; crear y restaurar devuelven
  los 409 de Go hasta la fase 6.
- `events`: `GET /api/v1/events/visits` (SSE, 256 suscriptores,
  `system:connected`, `:heartbeat` cada 25 s, revalidación por evento
  y latido, temporizador en la expiración del token).

Verificación: `cargo test --workspace` (incluye la prueba de paridad
`routes::parity`, que recorre las 59 rutas de
`rust/fixtures/routes.json` comprobando método, path, protección por
sesión, rol permitido/denegado y códigos de error) y smoke tests del
binario real por familia en `~/workspace/.rust-verify/smoke-test/`
(no se guardan en el repo).

Pendiente para la fase 6: envío del correo de recuperación (lettre;
el token ya se guarda y el `forgot` avisa que el envío está
pendiente), ejecución real de respaldo/restauración con age, y
ejecución de la retención de auditoría. Desviación conocida: Axum
devuelve 404/405 sin el sobre de error para rutas o métodos
desconocidos (Go devuelve `NOT_FOUND`/`METHOD_NOT_ALLOWED` con el
sobre). La exportación de visitas es JSON con los límites de Go; el
PDF/XLSX en el servidor (rust_xlsxwriter/genpdf) queda para decidir
con el frontend.

## Salud

- `GET /health` — salud del proceso.
- `GET /api/v1/health` — ejecuta la prueba real de conexión del
  motor configurado y devuelve motor, versión, latencia y versión
  de esquema (`database: ok` solo si la prueba pasa); si no
  responde, 503 (`DB_UNAVAILABLE`), con el mismo sobre de respuesta
  del contrato actual (`success` / `data`, `error.code` / `error.message`).

## Fase 5 · Frontend Leptos (SSR, sin hidratación WebAssembly)

Leptos 0.8 solo SSR: el servidor renderiza el HTML (`view!{...}.to_html()`)
y un JS mínimo (`ui/app.js`, incrustado) llama a la API de la fase 4 por
`fetch` con cookies + CSRF. **Ninguna escritura vive en el SSR**: todas
las mutaciones van a `/api/v1/...`; las lecturas usan los mismos DTOs de
la API, leídos por los traits de repositorio. La hidratación con
WebAssembly queda diferida: el SSR + mejora progresiva cubre los 4
recorridos de aceptación, y el estado en vivo llega por SSE + sondeo
cada 15 s.

Rutas web: `/login`, `/forgot-password`, `/reset-password`,
`/change-password`, `POST /logout`, `/` (punto de control),
`/visits/{id}`, `/visitors/{cedula}`, `/admin` (historial, visitantes,
calendario y estadísticas por fetch, catálogos, respaldos), `/audit`
(bitácora + CSV), `/privacy` (solicitudes ARCO, consulta del titular,
cancelación) y `/root` (cuentas, auditoría de superadmin, respaldos).
La guardia de sesión redirige al login con `returnTo` y repone la
cookie al renovar; el cambio de contraseña obligatorio solo permite
`/change-password` y `/logout`.

Decisiones de la fase 5:

- **Mismo origen permitido en la capa de origen**: la fase 4 solo
  aceptaba el `Origin` de `APP_URL`/`CORS_ORIGINS`; el navegador que
  llama a su propio origen daba 403 en cada fetch. La capa acepta
  además el propio origen del servidor (mismo host y puerto que el
  `Host` de la petición); otro origen sigue rechazado y el doble
  envío CSRF sigue vigente.
- **Exportaciones**: JSON de visitas y CSV de auditoría, ya
  disponibles en la fase 4, enlazados desde `/admin` y `/audit`.
  PDF/XLSX en servidor (`rust_xlsxwriter`/genpdf) quedan para la
  fase 6; el recorrido original de admin que los descargaba no puede
  pasar aún y queda documentado aquí.
- **Correo (Mailpit/reset)**: el envío es fase 6; las páginas
  forgot/reset existen y la API responde el mensaje genérico.
- **Fotos/cámara**: subida por archivo (a data-URI) o captura con
  `getUserMedia` (exige contexto seguro); la cédula se normaliza en
  el cliente (solo dígitos → `V-…`), como el frontend anterior.
- **Leptos**: los hijos de `Show`/`For` son closures `Fn` y no
  admiten valores movidos; en SSR los bloques condicionales y las
  filas se precalculan como `AnyView` antes del `view!`.

Aceptación: `tests/browser/logmaster-fase5.spec.ts` — 5 pruebas
(anonimo redirige al login; login + check-in completo con
consentimiento y foto; ciclo completo waiting → admitir → salida
temporal → reingreso → salida; flujo ARCO; admin/auditoría/root).
Requiere el binario en marcha con usuarios sembrados
(`LOGMASTER_APP_URL`, `LOGMASTER_TEST_PASSWORD`); sin ellos falla
en el login. Corre con `@playwright/test 1.64.1` (el `package.json`
del repo ya lo fija); el `node_modules` vive fuera del repo.

## Qué NO hace todavía este esqueleto

- El envío del correo de
  recuperación, la ejecución real de respaldos con age y la retención
  de auditoría son de la fase 6 (lettre/age).
- `service install` registra el servicio con arranque automático
  retrasado y el binario con `service run` como punto de entrada del SCM.
  Las acciones de recuperación (reinicio a los 5 s en el 1.º y 2.º fallo)
  se configuran con `sc.exe failure` hasta tener instalador propio;
  la cuenta virtual `NT SERVICE\LogMaster` y los permisos NTFS llegan
  con la fase 6 de operación.
