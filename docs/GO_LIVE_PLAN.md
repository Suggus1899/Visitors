# Plan de salida a producción de LogMaster

> **Estado: borrador de trabajo, sin aprobación.** Este documento no declara que LogMaster esté listo para producción. Las decisiones marcadas como pendientes requieren a la institución.

## 1. Alcance de la publicación

La publicación en `origin/main` es una serie de 8 commits sobre el `origin/main` anterior, más un commit final con este documento:

| # | Commit | Contenido |
|---|---|---|
| 1 | `chore: parchear Next.js y registrar el plan de auditoría` | Parche de Next.js y plan de auditoría |
| 2 | `fix(auth): estabilizar sesiones SSR y cierre de sesión` | Sesiones SSR y cierre de sesión |
| 3 | `feat(security): proteger índices de identidad de visitantes` | Índices de identidad protegidos |
| 4 | `feat(privacy): agregar flujos de cancelación de visitas` | Cancelación de visitas |
| 5 | `feat(reports): agregar ordenamiento global y exportaciones consistentes` | Reportes y exportaciones |
| 6 | `feat(backups): transmitir respaldos cifrados y separar roles de base de datos` | Respaldos cifrados y roles de base de datos |
| 7 | `test(carga): ejecutar laboratorio de carga con TLS y origen configurable` | Laboratorio de carga; incluye `tests/browser/load.spec.ts`, que `load.yml` y `playwright.config.ts` necesitan |
| 8 | `docs: actualizar guías de operación, seguridad y validación` | Guías de operación, seguridad y validación |

Fuera de la publicación: `docs/propuestas-grado/` (material académico local, sin rastrear).

La copia principal de trabajo (remoto `local`) tiene commits y cambios locales sin publicar que no forman parte de esta serie. No se modificó.

## 2. Fases

| # | Fase | Prioridad | Estado | Bloqueo o siguiente acción |
|---|---|---|---|---|
| 1 | Proceso y criterios de aceptación | P0 | Bloqueada por personas | Levantamiento en Industrias de Alimentos El Trébol pendiente. Instrumentos en `docs/instrumentos-diagnostico/`. |
| 2 | Privacidad y conservación | P0 | Decisiones pendientes | Plazos de visitantes, fotos, auditoría y respaldos. Decidir sobre el índice HMAC de trigramas. `RETENTION_ENABLED=false` hasta decidir. |
| 3 | Infraestructura | P0 | Bloqueada | Servidor, hostname, certificado confiable, firewall, IP fija y SMTP. |
| 4 | Migración y recuperación | P0 si hay base | Bloqueada | Confirmar si existe una base a migrar. Si existe: backup verificado y copia separada. |
| 5 | Validación del candidato | P0 | Parcial | Go, cliente y build pasan (sección 3). Faltan Playwright E2E, Compose y Nginx con TLS. |
| 6 | Piloto y go/no-go | P0 | Pendiente | Usar la plantilla de la sección 5. |
| 7 | Rendimiento y documentación | P1 | Parcial | Medición de bundle hecha antes de la serie (sección 4). Falta corregir referencias obsoletas. |
| 8 | Operación continua | P1 | Pendiente | Asignar responsables de respaldos, claves, actualizaciones e incidentes. |

## 3. Validación técnica

Entorno local: Windows, Go 1.27.2 con CGO, PostgreSQL 18.4, Mailpit como binario local, Node 25.8.2, pnpm 12.4.2 y Next.js 16.4.1.

El CI (`.github/workflows/ci.yml`) usa Linux, PostgreSQL 16, la imagen `axllent/mailpit:v1.31.4`, Node 22 y `go test -race -p 1 ./... -count=1`. Esta validación local no reemplaza el CI.

| Comprobación | Resultado |
|---|---|
| `go test -race -p 1 ./... -count=1` (server-go, base `logmaster_go_test` limpia) | OK: 9 paquetes con pruebas, sin fallos ni data races |
| `gofmt -l .` y `go vet ./...` | OK |
| `go build ./...` (CGO habilitado) | OK |
| `sqlc generate` | Sin diferencias |
| Migraciones 00001 a 00006 | OK |
| `govulncheck ./...` (v1.8.0) | Sin vulnerabilidades alcanzadas por el código. Hay una vulnerabilidad en un módulo requerido que el código no invoca |
| Cliente: `tsc --noEmit` y `lint --max-warnings 0` | OK |
| Cliente: `vitest` (`pnpm test`) | 29 archivos, 166 pruebas OK |
| Cliente: `next build` | OK |
| `pnpm audit --prod --audit-level moderate` | Sin vulnerabilidades conocidas |
| Playwright `--list` (raíz) | 5 pruebas en 2 archivos listadas. No ejecutadas |
| `sh -n deploy/scripts/configure.sh` y `git diff --check` | OK |

Hallazgos:

- `TestRecoveryIntegration` necesita un servidor SMTP. Si el envío falla, `sendResetEmail` devuelve error y el flujo borra el token de restablecimiento (`server-go/internal/httpapi/auth.go`, líneas 438-439). Con Mailpit en `127.0.0.1:1025` la prueba pasa. Es el comportamiento actual, no un defecto confirmado. El despliegue debe probar SMTP real antes de habilitar el restablecimiento de contraseña.
- Ejecutar `go test` sin `-p 1` sobre la misma base falla. Los paquetes de prueba corren en paralelo y comparten la base. Los registros huérfanos de `ArcoRequests` (de pruebas que borran visitantes sin borrar sus solicitudes) hacen que `RebuildIdentity` falle cerrado con "privacy request N has no identity mapping". El índice de identidad queda no preparado y las pruebas de `internal/httpapi` fallan con "protected identity index not prepared". La validación de esta sección usa `-p 1` y base limpia, igual que el CI. Requiere aislar las bases de prueba o limpiar esos registros (follow-up).
- Una corrida previa mostró "unexpected Go schema version 4". Se atribuye a dos migraciones con versión 4 dentro de la serie. La migración no publicada se renumeró a 00005 y 00006; la 00004 publicada no cambió.

No ejecutado: Docker/Compose, Nginx con TLS en `https://localhost:8443`, Playwright E2E (Chromium), SMTP real y CI en GitHub Actions para el commit publicado.

## 4. Rendimiento y documentación (fase 7)

Los exportadores pesados se cargan bajo demanda: ExcelJS (unos 935 KB sin comprimir) y jsPDF con autoTable (unos 450 KB) no aparecen en los manifiestos de ruta. Solo se cargan al exportar (`VisitsTable.tsx`, `CalendarView.tsx`, `statistics/pdfExport.ts`).

Tamaño de JS por ruta, sumando los chunks referenciados. Es aproximado y no equivale al "First Load JS" oficial de Next. Medido antes de la serie de cambios; no se repitió y debe repetirse antes del go/no-go.

| Ruta | Sin comprimir | gzip |
|---|---|---|
| `/login` | 348 KiB | 115 KiB |
| `(private)` raíz | 573 KiB | 178 KiB |
| `/admin` | 448 KiB | 147 KiB |
| `/audit` | 545 KiB | 181 KiB |
| `/root` | 391 KiB | 126 KiB |
| `/change-password` | 381 KiB | 125 KiB |
| `/forgot-password` | 345 KiB | 114 KiB |
| `/reset-password` | 346 KiB | 115 KiB |
| `/privacy` | 224 KiB | 73 KiB |
| `/auth/renew` | 109 KiB | 37 KiB |

Documentación y scripts obsoletos (sin corregir; follow-up):

- `docs/BACKEND_GO_MIGRATION.md`: la línea 106 dice que `server/` conserva el backend anterior para el ensayo de reversión, pero ese directorio no tiene archivos rastreados en Git. Las líneas 65 y 74 documentan `go test ./... -count=1` sin `-p 1`.
- `package.json` raíz: `dev`, `start`, `server`, `backup`, `backup:monitor`, `local:prepare` y `local:start` llaman a Docker Compose directamente.

## 5. Go/no-go (plantilla)

Decisión: `GO` / `GO condicionado` / `NO-GO`. **No tomada.**

Fecha: ________ Responsable: ________

| Criterio | Evidencia | Cumple |
|---|---|---|
| Piloto con operadores reales completado | | [ ] |
| Criterios de aceptación definidos y medidos | | [ ] |
| Decisiones de privacidad y conservación aprobadas | | [ ] |
| SMTP real probado (envío y restablecimiento) | | [ ] |
| TLS con certificado confiable | | [ ] |
| Backup y restauración probados en el servidor destino | | [ ] |
| Migración de datos verificada (si aplica) | | [ ] |
| CI verde en el commit exacto a publicar | | [ ] |
| Playwright E2E verde contra Compose | | [ ] |
| Plan de reversión documentado | | [ ] |

## 6. Decisiones pendientes

1. Plazos de conservación de visitantes, fotos, auditoría y respaldos.
2. Índice HMAC de trigramas: mantenerlo, cambiarlo o documentar la filtración de frecuencias.
3. Servidor destino: sistema operativo, hostname, certificado, IP fija y disponibilidad de Docker/Compose.
4. Base existente a migrar, o instalación vacía.
5. Proveedor SMTP, modo TLS y dirección remitente.
6. Responsables de operación, privacidad y aprobación.

## 7. Próximos pasos

1. Confirmar en GitHub Actions que el CI queda verde en el commit publicado (Linux, Node 22, PostgreSQL 16, `-p 1`).
2. Repetir la validación de cliente y Go sobre el commit publicado, y E2E Playwright si hay Docker disponible.
3. Follow-ups técnicos: aislar las bases de prueba de `internal/httpapi` o limpiar los `ArcoRequests` huérfanos; documentar `-p 1` como requisito; corregir `docs/BACKEND_GO_MIGRATION.md`; revisar los scripts de Docker de `package.json`.
4. Cualquier publicación adicional requiere autorización explícita y se hace solo a `origin`.
