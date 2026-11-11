# Fase 8 · Corte y aceptación final

Fecha de la aceptación: 2026-11-11. Rama `rust-migration`, sobre el
HEAD de fase 7 `31ada83`. Commits de la fase:

| Commit | Contenido |
| --- | --- |
| `34a36c7` | Sobre de error en 404/405 como Go |
| `c0e56f2` | `ops reindex` para SQLite y PostgreSQL |
| `6b6529c` | Runbook de corte y reversión (`docs/corte-fase8.md`) |
| (este) | Informe final de aceptación + README |

Documento de referencia: `docs/corte-fase8.md` (runbook) y
`docs/comparacion-fase7.md` (paridad por eje, recorridos y carga).

## Decisiones pendientes de fases anteriores (resueltas)

### Bug latente en Go: cambio de estado ARCO responde 500 — DOCUMENTADO, no corregido

`PATCH /api/v1/privacy/arco-requests/{id}/status` → 500
`SERVER_ERROR` en Go (`*pgconn.PrepareError` en su log; el SQL
directo equivalente funciona en psql). Los tests propios de Go no
cubren ese endpoint. **Decisión: se documenta como defecto conocido
de la versión original y no se corrige en Go.** Motivos:

- Go queda archivado, no se mantiene en paralelo: corregir su API
  no cambia el sistema que se pone en producción.
- La versión Rust lo implementa bien (200, transición auditada como
  `ARCO_REQUEST_STATUS_UPDATED`); los recorridos Rust dan 49/49.
- Impacto en Go: el cambio de estado ARCO por API no funciona; la
  bitácora no registra ese cambio. No afecta a la creación, la
  consulta ni la ejecución de solicitudes ARCO.
- Si alguna vez se volviera a Go (reversión), el defecto seguiría
  ahí; queda registrado aquí y en `comparacion-fase7.md`.

### 404/405 sin sobre de error en Axum — IMPLEMENTADO

Era viable: `Router::fallback` + `Router::method_not_allowed_fallback`
de Axum 0.8, aplicados solo al router de `/api/v1` (las rutas web de
Leptos mantienen su propia página de error). Ahora Rust responde
exactamente como Go: 404 `NOT_FOUND` / "Ruta no encontrada" y 405
`METHOD_NOT_ALLOWED` / "Método no permitido", con el sobre
`success:false + error.code/error.message`. Prueba en proceso con la
pila real (origen, límite, sesión) en `http.rs`. El diff Go vs Rust
pasa de 10 diferencias a **8** (ver abajo).

### `ops reindex` — IMPLEMENTADO para ambos motores

`logmaster.exe ops reindex [--force]`, traducción de
`db.RebuildSearch` / `db.RebuildIdentity` de Go: lotes de 1.000 con
progreso guardado, mismas guardas (no rehace un índice listo con la
huella actual salvo `--force`; error si está listo con otra clave),
identidad en una transacción (inmediata en SQLite; candado asesor
174829302 en PostgreSQL). Verificado en vivo en ambos motores (ver
"Conversión" y "Reindex"). El aviso de arranque ahora remite a este
comando.

## Verificación completa (todo rehecho en esta fase)

Entorno: una sola VM Linux. PostgreSQL 16 en los clústeres `main`
(5432) y `fase7` (55432); Go 1.27.3 y Rust 1.99.1. Clave de
laboratorio `19`×32 en todas las corridas. **Aviso**: a mitad de la
fase la VM se reinició y volvió de una instantánea con solo el
clúster `main` (PG 16.15 de Ubuntu, sin roles ni BDs de prueba): el
clúster `fase7` y las BDs `logmaster_go_test`,
`logmaster_rust_test`, `logmaster_restore_test` y
`logmaster_pg_test` se recrearon con `pg_createcluster` y los pasos
de `tools/fase7/README.md`. Quien repita la verificación tras un
reinicio debe recrear ese entorno primero.

| Comprobación | Resultado |
| --- | --- |
| `cargo check --workspace` | Verde |
| `cargo build -p logmaster` | Verde |
| `cargo test --workspace -- --test-threads=1` (base PG limpia, recreada antes) | **177/177**: app 98, crypto 15, store 48, contrato 16 (4 pruebas nuevas: 1 de 404/405, 3 de reindex SQLite) |
| `cargo fmt --check` | Verde |
| `cargo clippy --workspace --all-targets` | **0 avisos** |
| `go test ./internal/httpapi/ -count=1 -v` (Mailpit 1025/8025, `LOGMASTER_RESTORE_ENV` a `logmaster_restore_test`) | **42/42** |
| Paridad de las 59 rutas (`routes::parity`, en la suite) | Verde |
| Recorridos (67 pasos, arnés fase 7) | Go 48/49 (solo el 500 ARCO), Rust SQLite 49/49, Rust PostgreSQL 49/49 |
| Diff Go vs Rust (misma captura) | **59 iguales, 8 diferencias** (antes 57/10; las 2 de 404/405 desaparecen) |
| Carga (100 perfiles / 1.000 visitas) | Totales idénticos (1002/100/0); **0/700 errores en las tres**; p95 en la tabla de abajo |
| Playwright fase 5 (`tests/browser/logmaster-fase5.spec.ts`, 5 pruebas) + humo SSR (11 comprobaciones) | **Todo OK** (guion `f8-smoke.sh`; el guion de fase 5 necesitó `LOGMASTER_TLS=false`, porque TLS llegó en fase 6) |
| Respaldo/restauración Rust por CLI sobre la base convertida | Backup 19,2 s, `rehearse` 12,1 s, `restore` 13,4 s; conteos idénticos (152/1052/3220) |
| `cargo check --target x86_64-pc-windows-msvc` | **Roto como en fase 6/7**: `aws-lc-sys` exige `cl.exe` real; aquí solo hay `cc` de Linux. No es un fallo de esta fase; el release se compila en Windows. Posible arreglo futuro: compilar rustls solo con `ring` |

## Las 8 diferencias restantes (Go vs Rust)

1. `J3 cambiar estado como admin`: Go 500 vs Rust 200. Bug de Go
   (ver decisiones).
2–4. Consecuencias del punto 1 en bitácora, estadísticas de
   auditoría y CSV de auditoría (falta la entrada
   `ARCO_REQUEST_STATUS_UPDATED` en Go).
5–6. Exportación PDF/XLSX de visitas: Go devuelve instantánea JSON
   (el cliente Next.js generaba el archivo); Rust genera el binario
   en servidor. Por diseño (fase 6).
7. Cuerpo de `/api/v1/health`: Go `{status, backend}`; Rust
   `{database, engine, latency_ms, path, schema_version, status,
   version}`. Por diseño.
8. `/health` (proceso): solo existe en Rust (en Go esa ruta era del
   frontend Next.js). Por diseño.

## Carga pequeña: p95 en ms (límites del lab: 1 s consulta/operación, 2 s búsqueda)

| Ruta | Go | Rust SQLite | Rust PG |
| --- | --- | --- | --- |
| GET /api/v1/health | 0,8 | 1,4 | 4,7 |
| GET /api/v1/visits/waiting | 8,0 | 44,9 | 153,5 |
| GET /api/v1/visits/active | 1,9 | 2,0 | 3,5 |
| GET /api/v1/visits (filtrada) | 3,7 | 9,5 | 20,0 |
| GET /api/v1/visits?search=cedula | 7,9 | 22,9 | 26,6 |
| GET /api/v1/visitors?search=nombre | 4,3 | 3,9 | 13,0 |
| GET /api/v1/visitors/{cedula} | 1,3 | 2,1 | 3,4 |
| GET /api/v1/visits/{id}/edit-history | 1,2 | 1,9 | 7,5 |
| GET /api/v1/visits/calendar (61 días) | 2,4 | 3,5 | 5,7 |
| GET /api/v1/reports/stats | 3,5 | 7,3 | 8,0 |
| GET /api/v1/audit/logs | 2,2 | 3,7 | 8,0 |
| GET /api/v1/visits/export?format=xlsx | 80,7 | 514,1 | **1.256,9** |
| POST check-in + checkout (ciclo) | 4,5 | 48,8 | 16,2 |
| Siembra (1.000 visitas) | 6,6 s | 58,6 s | 20,1 s |

Todos los p95 están dentro de los límites del lab **salvo la
exportación XLSX en PostgreSQL (1.256,9 ms, máximo 1.292,4 ms)**:
en fase 7 estaba en 971,8 ms (p95) con un máximo de 1.114,5 ms, así
que hay variabilidad entre corridas, pero el p95 de esta corrida
supera el límite de 1 s. Es la generación del archivo real en
servidor (Go devuelve JSON): si la carga crece, merece una mirada
(por ejemplo, generar por lotes o medir con el .exe release, que es
más rápido que este binario debug). La siembra lenta de SQLite
(~59 ms/escritura) es el coste de cifrar + indexar por visita; no
afecta a las lecturas.

## Conversión de datos reales (ensayo, `docs/corte-fase8.md`)

Datos realistas del arnés de fase 7 (100 perfiles / 1.000 visitas +
recorridos): instantánea Go con 4 usuarios, 152 visitantes, 1.052
visitas, 1 intervalo, 2.018 registros de auditoría, 1 solicitud ARCO
y 3.220 tokens.

| Paso | Medido |
| --- | --- |
| `pg_dump -Fc` (archivo) | 0,23 s, 155.701 bytes |
| Respaldo age de Go por API | 0,56 s, 155.981 bytes |
| `preflight --from-postgres` | 0,18 s, todo correcto (152 perfiles descifrados) |
| `convert` PG → SQLite | **1,0 s**; conteos idénticos en las 12 tablas |
| `preflight --db` destino | 0,08 s, todo correcto |
| `check` del destino | Huellas ok, integridad ok, esquema 7 |
| `ops reindex` (sin `--force`) | No-op en ambos índices (ya listos, heredados de Go) |
| `ops reindex --force` (SQLite) | 152 perfiles / 3.220 tokens en 0,42 s; 0 cambios de identidad |
| `ops reindex` (PostgreSQL, `logmaster_rust_test`) | 152 perfiles / 3.220 tokens en ~1,0 s; `check` pasa de `pendientes` a `ok`; segunda pasada no-op; `--force` reconstruye con los mismos conteos |
| Servir la base convertida (API) | Login root, `visits total: 1052`, búsqueda `V-20000001` → 1 perfil (`Perfil1`), espera 100, stats `totalVisits: 1052` |
| Fotos BLOB | Las 152 fotos, byte a byte idénticas entre PG y SQLite (SHA-256) |
| Reversión: `pg_restore` en base nueva + Go sirviendo | 0,22 s; Go responde `visits total: 1052` y el mismo visitante `V-20000001` / `Perfil1` |

La diferencia de 2 registros de auditoría entre la instantánea
(2.018) y la conversión (2.020) es el login y la creación del
respaldo age, posteriores a la instantánea: actividad real, no
pérdida.

## Checklist de «migración terminada» (documento, §20)

| Punto | Veredicto |
| --- | --- |
| Un solo `logmaster.exe` atiende interfaz, API y base en el equipo destino, instalado como servicio con arranque automático retrasado | **Pendiente de ejecutar en el equipo destino.** El servicio, el arranque automático retrasado, la recuperación y el primer arranque en `C:` están implementados y verificados en código y en humo (Linux); la instalación real en Windows, con su cuenta virtual y permisos NTFS, solo se puede hacer en el PC de Gustavo |
| Las 59 rutas responden igual; la tabla de roles pasa entera; los 4 recorridos Playwright pasan | **Verificado** (con las 8 diferencias documentadas arriba, 4 de ellas por el bug de Go). Roles: matriz completa en pruebas + recorridos. Playwright: 5/5 |
| Los datos reales convertidos superan conteos, preflight e integridad; las sesiones y fotos funcionan con las claves de siempre | **Verificado en el ensayo** (tabla de conversión; fotos byte a byte idénticas; sesiones con las claves de siempre) |
| Respaldo diario, ensayo dominical y restauración completa demostrados en el equipo destino | **Parcial.** Ciclo completo demostrado en esta VM por CLI (backup/rehearse/restore con conteos idénticos) y programador implementado (01:00 respaldo, 02:00 retención, domingo 03:00 ensayo); el ciclo con el servicio de Windows en el equipo destino queda pendiente |
| Reiniciar Windows deja el sistema trabajando sin iniciar sesión ni tocar nada | **Pendiente de probar en Windows real** (no afirmado) |
| La instalación anterior queda archivada y la reversión, ensayada una vez | **Verificado**: archivo = base PostgreSQL intacta + `pg_dump` + respaldo age de Go; reversión ensayada con éxito (tabla de conversión) |

## Qué queda pendiente (PC de Gustavo o infraestructura real)

- Instalar el servicio en `C:\LogMaster` (`init`, `service
  install`), cuenta virtual `NT SERVICE\LogMaster` + permisos NTFS,
  y comprobar el arranque tras reiniciar Windows sin iniciar sesión.
- DPAPI real, bandeja real y envío SMTP real (aquí: secretos en
  base64 con aviso, bandeja solo verificada contra las fuentes de
  los crates, correo contra Mailpit/sumidero).
- Compilar el `.exe` release en Windows con rustup + target MSVC
  (el `cargo check` cruzado desde Linux está roto por `aws-lc-sys`)
  y repetir contra él el humo SSR + Playwright + respaldo.
- Periodo de observación de 30 días propuesto con PostgreSQL
  archivado (ver `docs/corte-fase8.md` §9); el borrado del archivo
  solo con confirmación explícita de Gustavo.
- Rendimiento a vigilar si la carga crece: siembra SQLite lenta y
  exportación XLSX en PG por encima del límite del lab en esta
  corrida.
