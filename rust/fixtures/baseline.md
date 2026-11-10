# Corte de referencia — línea base de LogMaster

Punto de partida registrado para la refactorización a Rust
(línea base, sección 12).

## Commits

| Referencia | Commit | Fecha | Nota |
| --- | --- | --- | --- |
| Corte de referencia | `b760bc8` | 2026-10-31 | `docs: registra validacion linux del commit` |
| Punto de partida de la rama `rust-migration` | `b5516b96` | 2026-11-10 | `docs: agrega linea base tecnica de LogMaster` — único delta respecto a b760bc8, solo documentación, sin cambios funcionales |

## Versiones del sistema actual

| Pieza | Versión / tecnología |
| --- | --- |
| Web | Next.js 16.4.3, App Router, salida standalone; React 19.3.1, TypeScript 5.9, HeroUI 3.2.7, Tailwind CSS 4.3, TanStack Query 5 |
| API | Go 1.27 (toolchain 1.27.3), Chi v5, pgx v5, Goose v3, JWT v5, go-mail, age; sqlc genera los bindings |
| Base | PostgreSQL 16 Bookworm |
| Infra | Nginx 1.28 Alpine, Mailpit 1.31.4, Docker Compose |

## Contrato HTTP

Prefijo `/api/v1`. Éxitos JSON con `success` y `data`; fallos con
`success: false` y `error.code` / `error.message`. Códigos: 400 validación,
401 sesión/credencial, 403 permiso/restricción, 404 recurso, 409 conflicto,
413 tamaño, 429 límite, 503 indisponibilidad de la base.

**59 rutas, 53 protegidas por sesión y 6 públicas** (ver `routes.json`):
auth 7, visits 16, visitors 8, privacy 7, audit 6, superadmin 6,
reports 4, backups 3, events 1, health 1.

## Migraciones Goose (base PostgreSQL)

| Versión | Cambio |
| --- | --- |
| 00001 | Línea base compatible con el esquema anterior |
| 00002 | Consentimiento separado, propósito TEXT, reglas de visitas e intervalos abiertos |
| 00003 | Tabla y estado del índice de trigramas protegidos, más índice temporal de visitas |
| 00004 | Índices de estado y fecha para consultas |
| 00005 | Estado de la identidad protegida |
| 00006 | Estado `cancelled` y motivo de cancelación de visita |

Tablas: Users, Visitors, Visits, IntermittentLogs, VisitorEditHistories,
ActivityLogs, ArcoRequests, Departments, VisitPurposes,
VisitorSearchTokens, SearchIndexState, IdentityIndexState, SequelizeMeta,
goose_db_version.

## Límites que la versión Rust debe reproducir

- Cuerpo HTTP máximo: 5 MiB. Imágenes: formato validado, 16 millones de
  píxeles máximo, binarios en BYTEA (BLOB en SQLite).
- Sesión: acceso 15 minutos, renovación 7 días, máximo absoluto 7 días
  desde el inicio; secreto de refresh independiente.
- Contraseña: mínimo 12 caracteres, máximo 72 bytes UTF-8 (límite bcrypt),
  con mayúscula, minúscula, número y símbolo.
- Búsqueda general: mínimo 3 caracteres normalizados; cédula por
  consulta directa (HMAC-SHA-256).
- Calendario: hasta 62 días por rango; zona America/Caracas.
- Exportación: PDF hasta 2.000 visitas, XLSX hasta 20.000.
- Retención: desactivada por defecto; si se habilita, 02:00 de Caracas,
  60 días de datos y 365 días de auditoría.
- Respaldos: hasta 30 pares automáticos completos y exitosos; RPO 24 h,
  RTO 2 h; copia diaria 01:00 y ensayo dominical 03:00 (Caracas).
- Pool pgx: hasta 10 conexiones (referencia de concurrencia; en SQLite
  lo sustituyen WAL + una escritura serializada).
