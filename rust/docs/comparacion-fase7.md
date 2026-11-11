# Fase 7 · Comparación y paridad (Go vs Rust)

Fecha de la comparación: 2026-11-11. Rama `rust-migration`, sobre el HEAD de
fase 6 `5431c51`. Commits de la fase: `42c9750` (arnés), `16b8608` (ruta de
auditoría), `2b3a3f7` (búsqueda en visitas PG) y el de este informe.

## Método

- **Arnes** (`rust/tools/fase7/`, solo stdlib): `compare.py` ejecuta los
  mismos 67 pasos contra cada versión en marcha y guarda una captura JSON
  normalizada (ids, tokens, fechas y hashes se sustituyen por marcadores;
  se comparan códigos, `error.code`, estados, totales, paginación, roles y
  textos); `--diff A.json B.json` compara paso a paso. `load.py` siembra 100
  perfiles (`V-20000001`..`V-20100000`), 9 visitas completadas + 1 en espera
  por perfil = 1.000 visitas, y mide 13 rutas × 50 muestras (+ ciclo
  check-in/checkout × 100); p95 = rango más cercano `valores[ceil(0.95*n)-1]`,
  como el `lab` de Go. Límites del lab: 1 s consulta/operación, 2 s
  búsqueda, errores < 1 %.
- **Recorridos**: los 4 de fase 5 (login anónimo→login; login + check-in con
  consentimiento y foto; ciclo completo; flujo ARCO; admin/auditoría/root) +
  matriz de roles (4 roles × 4 rutas) + errores de contrato + SSE +
  superadmin. Pasos: salud, auth, roles, J1 check-in (+ duplicado 409 +
  foto), J2 ciclo completo (+ 409 de estado inválido), J2b cancelación
  con/sin motivo, J3 ARCO, J4 consultas/reportes/auditoría/exportaciones,
  J5 errores de contrato + SSE + superadmin.
- **Mismo entorno**: una sola VM Linux, Go en `127.0.0.1:18081` con
  PostgreSQL 16 (clúster `fase7`, puerto 55432), Rust en `127.0.0.1:18085`
  con SQLite y con PostgreSQL 16. Misma clave de cifrado en las tres
  corridas (`19`×32, la del laboratorio), mismos 4 usuarios sembrados
  (`root`/`operador`/`admin`/`auditor`, contraseña `Private!Safe12Á`),
  límite de peticiones levantado en ambas (`RATE_LIMIT_MAX_REQUESTS=100000`;
  el límite en sí se verifica en pruebas propias) y `BACKUP_PATH`
  configurado en ambas (sin él, Rust lista respaldos con 500 y Go con 200
  `[]`). Cada captura se tomó sobre base limpia, recreada antes de correr.
- **Paridad por eje** (§12 de la línea base): verificación estática de
  código + prueba de paridad en proceso (`routes/parity.rs`: las 59 rutas
  del fixture, método, path, protección por sesión, rol permitido/denegado
  y códigos) + los recorridos y la carga de este informe.

## PostgreSQL 16, restaurado en esta VM

La VM no traía PostgreSQL (ni binarios, ni clúster, ni paquetes en apt).
Se restauró con el repositorio oficial `apt.postgresql.org` (clave
`ACCC4CF8.asc`, dearmor a `/usr/share/keyrings/postgresql.gpg` con permiso
0644; el espejo Ubuntu `cogentco` estaba colgado y se eliminó de
`ubuntu.sources`). Versión instalada: `16.15-1.pgdg24.04+2`. Clústeres:
`main` (puerto 5432) y `fase7` (puerto 55432). Roles/BDs de la comparación:
`logmaster_test`/`fixture` en `fase7` (BDs `logmaster_go_test`,
`logmaster_rust_test`, `logmaster_restore_test`) y
`logmaster_test`/`logmaster-test-only-local` en `main` (BD
`logmaster_pg_test`, para los tests de contrato). **Aviso**: si la VM se
reinicia, PostgreSQL y Go (instalados en `/usr`) se pierden y hay que
reinstalarlos; los pasos están en el informe al coordinador.

## Paridad por eje (§12 de la línea base)

| Eje | Qué se comparó | Veredicto |
| --- | --- | --- |
| Contrato HTTP | 59 rutas del fixture (método, path, protección por sesión, rol, códigos); sobre `success`/`data`; errores `success:false` + `error.code`/`error.message`; 400/401/403/404/409/413/429/503 | **Par**, salvo 2 diferencias documentadas: Axum devuelve 404/405 sin sobre de error (Go sí lo devuelve) y `/health` (proceso) solo existe en Rust (en Go esa ruta era del frontend Next.js) |
| Sesión/roles | JWT HS256, mismos claims; acceso 15 min, renovación 7 días, máximo absoluto 7 días; revocación por `tokenVersion`; gate de cambio obligatorio; cookies `__Host-logmaster-*` + CSRF doble envío; matriz de roles completa (4 roles × 4 rutas en los recorridos + paridad en proceso); límites 100/60 s y 500/15 min auth, 429 con `Retry-After` | **Par** |
| Visitas | Máquina de estados (waiting → active → intermittent → active → completed; cancel con motivo); 409 `OPEN_VISIT_EXISTS` / `INVALID_VISIT_STATE`; 404 `VISIT_NOT_FOUND`; consentimiento individual; atomicidad vía `UnitOfWork` en ambos motores; alias de transición preservados | **Par** |
| Datos | AES-256-GCM `ENC:hex:hex:hex` (nonce 16 B), HMAC-SHA-256 identidad, trigramas, bcrypt coste 12; mismos campos cifrados; fotos BLOB (límite 5 MiB por cuerpo, 413 `PAYLOAD_TOO_LARGE`; PNG/JPEG/WebP, ≤16 Mpx); unicidad (una visita abierta por identidad, un intervalo abierto por visita) | **Par**. La búsqueda por texto en visitas PG devolvía 0 (bug, ver hallazgos); corregida en esta fase |
| Privacidad | Estados ARCO `pending`/`in_progress`/`completed`/`rejected`; tipos `access`/`rectification`/`cancellation`/`opposition`; cancelación con constancia; edición con contraseña adicional (403 `INVALID_EDIT_PASSWORD`); retención con el alcance exacto de Go | **Par en Rust**. En Go, el cambio de estado ARCO responde 500 (bug latente, ver hallazgos) |
| Consultas | Paginación por defecto 10, orden global, búsqueda ≥3 caracteres (`SEARCH_TOO_SHORT`), consulta directa por cédula, fechas America/Caracas, calendario hasta 62 días, exportación con límites 2.000 (PDF) / 20.000 (XLSX), 413 `EXPORT_LIMIT_EXCEEDED` | **Par**, salvo la exportación: Go devuelve una instantánea JSON `{visits, total}` (el cliente Next.js generaba el archivo) y Rust genera el binario en servidor (fase 6, por diseño documentado) |
| Infraestructura | `/health` (proceso, solo Rust) y `/api/v1/health` (prueba real de conexión; 503 `DB_UNAVAILABLE` si falla); TLS rustls con cert autofirmado; SSE 256 suscriptores, `system:connected`, `:heartbeat` cada 25 s; respaldos con age; retención programada 02:00 Caracas; logs con rotación (3×10 MiB) | **Par**, salvo el cuerpo de `/api/v1/health` (Go `{status, backend}`; Rust `{database, engine, latency_ms, path, schema_version, status, version}`) |
| Recuperación | Ciclo respaldo/restauración dentro de cada versión; restauración en vivo en PG → 409 `RESTORE_TARGET_NOT_ALLOWED` en ambas; `tokenVersion` se incrementa (sesiones previas invalidadas) | **Par dentro de cada versión. Formatos incompatibles entre versiones**: Go usa `pg_dump --format=custom` + age; Rust usa formato propio `logmaster-rust/1` con COPY. Un respaldo Go no se restaura en Rust ni viceversa |

## Recorridos: 67 pasos

| Versión | Pasos con expectativa | Fallos |
| --- | --- | --- |
| Go (PostgreSQL 16) | 49 | **1**: `J3 cambiar estado como admin` → 500 `SERVER_ERROR` |
| Rust (SQLite) | 49 | **0** |
| Rust (PostgreSQL 16) | 49 | **0** |

(Los 18 pasos restantes —matriz de roles y `health proceso`— no llevan
expectativa de código en el arnés; se comparan por diff.)

**Diff Go vs Rust (misma captura en ambos motores): 57 iguales, 10
diferencias.** Las 10, una por una:

1. `J3 cambiar estado como admin`: Go 500 vs Rust 200. Bug de Go (ver
   hallazgos); no es divergencia de Rust.
2. `J4 bitácora`: mismo contenido salvo la entrada
   `ARCO_REQUEST_STATUS_UPDATED`, ausente en Go por su 500. Consecuencia
   del punto 1; los 9 conteos de acciones comunes son idénticos (LOGIN 4,
   VISIT_CHECKIN 2, VISIT_CHECKOUT 1, VISIT_ADMIT 1, VISIT_REENTRY 1,
   VISIT_INTERMITTENT_EXIT 1, VISIT_CANCELLED 1, ARCO_ACCESS_EXECUTED 1,
   ARCO_REQUEST_CREATED 1).
3. `J4 estadísticas de auditoría`: Rust añade `ARCO_REQUEST_STATUS_UPDATED:
   1`. Consecuencia del punto 1.
4. `J4 exportación CSV de auditoría`: mismo formato (cabecera con BOM,
   fechas ISO con `-04:00`); contenido distinto solo por la entrada ausente
   en Go. Consecuencia del punto 1.
5. `J4 exportación PDF de visitas`: mismo 200; Go devuelve instantánea
   JSON, Rust el binario. Por diseño (ver eje Consultas).
6. `J4 exportación XLSX de visitas`: igual que el punto 5.
7. `J5 método no permitido`: mismo 405; Go devuelve el sobre de error
   (`METHOD_NOT_ALLOWED`), Axum cuerpo vacío. Diferencia conocida desde
   fase 6.
8. `J5 ruta desconocida`: mismo 404; Go devuelve el sobre (`NOT_FOUND`),
   Axum cuerpo vacío. Diferencia conocida desde fase 6.
9. `health api`: ambos 200; cuerpo distinto por diseño (ver eje
   Infraestructura).
10. `health proceso`: Go 404 (esa ruta era del frontend Next.js) vs Rust
    200. Conocido.

## Carga pequeña: 100 perfiles / 1.000 visitas

Siembra (1.000 visitas): Go 5,6 s; Rust SQLite 51,0 s (~10× más lenta,
~27 ms/escritura frente a ~2,8 ms); Rust PG 14,8 s. Totales idénticos en
las tres: `total=1002, waiting=100, active=0` (1002 = 1000 + 2 de los
recorridos). Errores: **0/700 en las tres versiones**. p95 en ms:

| Ruta | Go | Rust SQLite | Rust PG | Límite lab |
| --- | --- | --- | --- | --- |
| GET /api/v1/health | 0,7 | 0,9 | 3,0 | 1.000 |
| GET /api/v1/visits/waiting | 22,1 | 41,5 | 125,3 | 1.000 |
| GET /api/v1/visits/active | 1,5 | 1,8 | 4,4 | 1.000 |
| GET /api/v1/visits (filtrada) | 3,9 | 5,0 | 19,3 | 1.000 |
| GET /api/v1/visits?search=cedula | 5,8 | 10,8 | 39,5 | 2.000 |
| GET /api/v1/visitors?search=nombre | 2,6 | 3,3 | 11,2 | 2.000 |
| GET /api/v1/visitors/{cedula} | 5,6 | 1,9 | 9,8 | 1.000 |
| GET /api/v1/visits/{id}/edit-history | 1,2 | 2,2 | 2,9 | 1.000 |
| GET /api/v1/visits/calendar (61 días) | 2,3 | 2,9 | 5,1 | 1.000 |
| GET /api/v1/reports/stats | 3,0 | 7,3 | 5,9 | 1.000 |
| GET /api/v1/audit/logs | 1,8 | 2,4 | 6,9 | 1.000 |
| GET /api/v1/visits/export?format=xlsx | 90,9 | 417,4 | 971,8 | 1.000 |
| POST check-in + checkout (ciclo) | 4,4 | 47,1 | 11,2 | 1.000 |

Todos los p95 están por debajo de los límites del lab. Notas: la lista de
espera descifra cada perfil (Rust SQLite 41,5 ms; Rust PG 125,3 ms). La
exportación XLSX de Rust genera el archivo real en servidor (Go devuelve
JSON): p95 417,4 ms en SQLite y 971,8 ms en PG, con un máximo de 1.114,5 ms
en PG —un único muestreo por encima del límite de 1 s; p95 dentro del
límite. La siembra lenta de SQLite (~27 ms/escritura) es el coste de
cifrar + indexar por visita; no afecta a las lecturas.

## Hallazgos

### Bug latente en Go: cambio de estado ARCO responde 500

`PATCH /api/v1/privacy/arco-requests/1/status` → 500 `SERVER_ERROR`,
reproducido a mano contra Go en vivo; el log Go dice `ERROR operation
failed error_type=*pgconn.PrepareError`. El SQL directo equivalente
funciona en psql. Los tests propios de Go no cubren este endpoint
(`privacy_test.go` solo tiene `TestPrivacyCancellationIntegration`). Es un
bug de la versión original, fuera de esta rama: Rust lo implementa bien
(200, y la transición queda auditada como `ARCO_REQUEST_STATUS_UPDATED`).
**Para fase 8**: corregirlo en Go o documentarlo como bug conocido de la
versión original.

### Bug en Rust PG: búsqueda por texto en visitas devolvía 0 (corregido)

`GET /api/v1/visits?search=V-10000001` devolvía `total: 0` en PostgreSQL
y `total: 1` en SQLite y en Go. Causa (`crates/store/src/repos/pg.rs`,
`visit_filter_where`): los ids del índice de trigramas iban como un `AND
p.id = ANY(...)` aparte y la rama de búsqueda solo con los ILIKE de
propósito/persona/notas; una búsqueda por cédula o nombre, que solo casa
por el índice, exigía además que el texto apareciera literal en esos
campos. El listado de visitantes en PG ya hacía lo correcto (ids dentro
del grupo OR), igual que Go y que el motor SQLite. Corregido en el commit
`2b3a3f7`: los ids van dentro del grupo OR. Verificado en vivo tras la
corrección: `visits?search=V-10000001` → 1, `visits?search=Prueba` → 2,
`visits?search=Reunión` → 1052 (el ILIKE de propósito sigue intacto),
`visits?visitorCedula=V-10000001` → 1. La comparación PG final ya se hizo
con el binario corregido.

### Ruta de auditoría sin prefijo `/api/v1` (corregido)

La `Uri` de Axum dentro de `.nest("/api/v1", …)` llega sin el prefijo, y
`audit_meta` la guardaba tal cual: todas las rutas de visitas/privacidad/
superadmin quedaban en la bitácora sin `/api/v1` (LOGIN sí salía completo
porque auth pasaba el literal). Corregido en el commit `16b8608` (helper
`full_api_path` + test `audit_path_keeps_full_api_prefix`). Verificado en
la captura final: las rutas de auditoría Rust llevan el prefijo completo,
como Go.

### Tests de contrato PG: en serie y sobre base limpia

- En paralelo, 4 casos fallan al migrar a la vez: `duplicate key value
  violates unique constraint "pg_type_typname_nsp_index"` (dos migraciones
  concurrentes crean el mismo tipo enum). No es un bug del producto: la
  suite debe correr con `--test-threads=1`, como indica el encargo.
- Sin recrear la base entre corridas, `filtered_lists_reports_and_audit`
  falla (`conteo de calendario inesperado: [("2020-01-02", 2)]`): el caso
  usa la fecha fija 2020-01-02 y la corrida anterior ya dejó una visita
  ese día. La base de contrato debe recrearse antes de cada corrida.

### Tests propios

- **Rust** (`cargo test --workspace -- --test-threads=1`, base PG limpia):
  **173 pasados, 0 fallos** (app 97, crypto 15, store 45, contrato 16,
  este último con el clúster PG real, sin avisos de omisión).
  `cargo check`, `cargo build`, `cargo fmt --check` y `cargo clippy
  --workspace --all-targets` (0 avisos) en verde.
- **Go** (`go test ./internal/httpapi/ -count=1 -v`, con Mailpit en
  127.0.0.1:1025/8025 y `LOGMASTER_RESTORE_ENV` apuntando a
  `logmaster_restore_test`): **42 pasados, 0 fallos**. Sin Mailpit falla
  `TestRecoveryIntegration` (el token de reset no se guarda como hash sin
  SMTP) y sin el entorno de restauración falla
  `TestBackupRestoreIntegration`; ambos son huecos de entorno, no
  regresiones.
- **Windows**: `cargo check --target x86_64-pc-windows-msvc` sigue roto
  como en fase 6 (`aws-lc-sys` exige `cl.exe` real; aquí solo hay `cc` de
  Linux). Registrado, no bloquea. Posible arreglo futuro: compilar rustls
  solo con `ring`.

## Qué queda para la fase 8

- Corregir el 500 ARCO en Go (fuera de esta rama) o documentarlo como bug
  conocido de la versión original.
- Decisión sobre 404/405 con sobre de error en Axum (hoy cuerpo vacío).
- `ops reindex` (reconstrucción de índices de identidad/búsqueda).
- Cuenta virtual `NT SERVICE\LogMaster` + permisos NTFS.
- DPAPI/bandeja/servicio Windows y SMTP real sin probar en Windows;
  recorridos Playwright contra el `.exe`; ciclo de respaldo/restauración
  PG en vivo en Rust.
- La siembra SQLite (~27 ms/escritura) y la exportación XLSX en PG (p95
  971,8 ms, cerca del límite de 1 s) merecen una mirada si la carga crece.
