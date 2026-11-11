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
| 3 · Cripto y sesión | AES-GCM/HMAC/bcrypt compatibles, JWT, cookies, roles como extractores | Pendiente |
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
│   └── baseline.md     # referencia del corte: commits, versiones y limites
└── crates/
    ├── app/            # binario logmaster: CLI, Axum, servicio de Windows
    └── store/          # SQLite embebido (WAL, FK ON) + migraciones rusqlite_migration
```

El código Go/Next.js existente **no se toca** en esta fase. El dominio
(visitas, visitantes, privacidad, auditoría, reportes, respaldos) llega en
las fases 2–6.

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

- No hay autenticación, sesión ni roles (fase 3), ni rutas de dominio
  (fase 4), ni frontend Leptos (fase 5). Las tablas de dominio ya
  existen (fase 2) y los repositorios están listos para usarlas; el
  cifrado completo, HMAC, bcrypt y JWT llegan con la fase 3 (el
  descifrado mínimo de `preflight` no los sustituye).
- `service install` registra el servicio con arranque automático
  retrasado y el binario con `service run` como punto de entrada del SCM.
  Las acciones de recuperación (reinicio a los 5 s en el 1.º y 2.º fallo)
  se configuran con `sc.exe failure` hasta tener instalador propio;
  la cuenta virtual `NT SERVICE\LogMaster` y los permisos NTFS llegan
  con la fase 6 de operación.
