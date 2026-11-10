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
| 2 · Datos | Esquema SQLite de las 6 migraciones, repositorios, `convert` desde PostgreSQL y preflight | Pendiente |
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
```

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

- No hay tablas de dominio: la migración 00001 solo crea la tabla de
  metadatos `app_meta`. Las tablas Users, Visitors, Visits,
  IntermittentLogs, etc. se traducen en la fase 2 desde las migraciones
  Goose 00001–00006.
- No hay autenticación, sesión ni roles (fase 3), ni rutas de dominio
  (fase 4), ni frontend Leptos (fase 5).
- `service install` registra el servicio con arranque automático
  retrasado y el binario con `service run` como punto de entrada del SCM.
  Las acciones de recuperación (reinicio a los 5 s en el 1.º y 2.º fallo)
  se configuran con `sc.exe failure` hasta tener instalador propio;
  la cuenta virtual `NT SERVICE\LogMaster` y los permisos NTFS llegan
  con la fase 6 de operación.
