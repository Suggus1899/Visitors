# LogMaster — control integral de visitantes

Aplicación para Industrias de Alimentos el Trébol: registro, consentimiento y fotografías; espera, admisión, salida temporal, reingreso y cierre; administración, auditoría y exportaciones PDF/Excel. El backend vigente utiliza Go, Chi, pgx, sqlc y Goose sobre PostgreSQL 16. El cliente utiliza React, TypeScript, Vite y shadcn/ui.

## Laboratorio reproducible en Linux

Requiere Docker Engine con Compose, Git y OpenSSL. Los scripts no instalan Docker. El laboratorio utiliza datos ficticios, Mailpit y un certificado temporal.

```sh
sh deploy/scripts/configure.sh
docker compose --profile test build
docker compose --profile test up -d --wait postgres mailpit
docker compose run --rm ops migrate
docker compose run --rm ops seed
docker compose --profile test up -d --wait api web
```

Acceso: **https://localhost:8443**. La contraseña inicial de `root` está en `SEED_ROOT_PASSWORD`, dentro del archivo privado `.local/containers/app.env`; debe cambiarse al entrar. La retención permanece desactivada. El arranque comprueba conexión, migraciones e índice; no cambia el esquema ni ejecuta semillas.

PostgreSQL, API y Mailpit no publican puertos en la configuración normal. El override `deploy/compose.test.yaml` publica diagnósticos exclusivamente en loopback. Datos, respaldos y contraseñas cifradas utilizan volúmenes nombrados separados. **No se recrea Visitors-local.** `docker compose stop` conserva los datos; `down -v` destruye volúmenes y solo corresponde a laboratorios desechables.

## Comprobaciones

```sh
pnpm install --frozen-lockfile       # pnpm 12.4.2; Node.js 22
pnpm test                           # Go sin integración y cliente
pnpm typecheck:client
pnpm --dir client run lint
pnpm build
sh deploy/scripts/smoke.sh       # laboratorio HTTPS y persistencia
pnpm exec playwright install chromium
pnpm exec playwright test            # recorrido sobre Compose
```

CI ejecuta PostgreSQL/Mailpit independientes, Go con `-race`, sqlc, govulncheck, tipos, lint, pruebas y build. Containers comprueba persistencia, respaldo/restauración aislada, timers adelantados, navegador HTTPS y carga pequeña; publica las imágenes verificadas como artefacto `logmaster-images` durante siete días.

El workflow manual **Full laboratory load** genera 100.000 visitantes y 1.000.000 de visitas ficticios, abre 50 sesiones, calienta dos minutos y mide quince. Publica hardware, recursos, latencias y respaldo/restauración. Un objetivo incumplido hace fallar el job.

## Contratos y mantenimiento

Se conservan los contratos y formatos criptográficos históricos. La búsqueda general exige tres caracteres y usa trigramas HMAC con verificación de candidatos descifrados. El calendario incluye conteos diarios y detalle paginado. PDF admite hasta 2.000 visitas y Excel hasta 20.000; se comprueba el límite antes de recopilar y nunca se truncan resultados.

Fotografías y SSE requieren sesión. La API exige roles y contraseña adicional en cada edición; cancelar con visita abierta devuelve `409 OPEN_VISIT_EXISTS`. Cambiar/restablecer contraseña revoca acceso y refresh persistentemente.

`ops preflight|adopt|migrate|bootstrap-root|restore` simula por defecto. Para modificar exige `--apply --confirm-target host:puerto/base` y la aplicación detenida. La restauración valida una copia desechable y confirma datos, revocación y auditoría en una transacción. La restauración HTTP sigue limitada al ensayo.

Consulta [operación y recuperación](docs/OPERATIONS.md), [arquitectura](docs/ARCHITECTURE.md), [API](docs/API.md), [seguridad](docs/SECURITY.md) y el [registro histórico](docs/BACKEND_GO_MIGRATION.md).

El backend Node se conserva en la referencia Git `backup/node-before-retirement-2026-10-10`. Sus fixtures de contratos, cifrado y esquema se comprueban en Go; no quedan tareas activas que dependan de ese backend. Los archivos privados anteriores permanecen fuera de Git y de las imágenes.

La instalación empresarial requiere servidor, hostname, certificado confiable, responsables, SMTP y aceptación de operadores. Al adoptar datos se conservan sus claves originales. Los respaldos pueden contener información cancelada y requieren revisión antes de restaurarse.
