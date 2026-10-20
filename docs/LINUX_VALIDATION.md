# Validación de la versión actual en Linux

Este procedimiento utiliza datos ficticios y volúmenes de laboratorio. La aceptación sigue pendiente hasta obtener los resultados sobre la versión que se entregará. No utilizar una instalación empresarial, bases anteriores ni sus respaldos.

## Versión y requisitos

Registrar `git rev-parse HEAD` y `git status --short` antes de ejecutar. Los workflows validan la referencia publicada que se seleccione; los cambios locales sin commit no forman parte de esa ejecución. Una copia de trabajo trasladada a Linux debe incluir los cambios pendientes y registrar su diff junto a los resultados, sin copiar secretos ni datos anteriores.

Los workflows `CI` y `Containers` usan runners de GitHub. El workflow manual `Full laboratory load` exige un runner Linux x64 dedicado con etiquetas `self-hosted, linux, x64, logmaster-load` y estos requisitos:

- Docker Engine y Compose V2 accesibles para el usuario del runner; Git, OpenSSL, Python 3 y compilador C para las pruebas Go con `-race`.
- Al menos 4 vCPU, 16 GiB de RAM y 512 GiB libres tanto en `RUNNER_TEMP` como en el almacenamiento de Docker. El workflow comprueba estos mínimos antes de generar datos.
- Permisos para instalar las dependencias Linux de Chromium mediante Playwright; si requiere sudo, debe funcionar sin interacción.
- Puerto loopback 8443 disponible y ausencia de otras instalaciones que utilicen la subred configurada en Compose. El runner debe estar reservado para ensayos ficticios.

Go, Node 22 y pnpm 12.4.2 se preparan mediante las acciones del workflow. No se instala Docker en Windows. Las ejecuciones completas se serializan; cada una recibe un proyecto Compose, secretos y resultados propios.

## Orden de ejecución y evidencia

1. **CI**: lockfile congelado, tipos, lint, build, pruebas del cliente, Go con `-race`, PostgreSQL y Mailpit independientes, bindings SQL y revisión de vulnerabilidades. La prueba de generación de secretos comprueba que mantenimiento, API y respaldo tienen contraseñas distintas y coincidentes con los secretos de PostgreSQL, tanto en el piloto como en carga.
2. **Containers**: instalación vacía, concesión de permisos, HTTPS/SSE y logs, recreación con persistencia, respaldo/restauración, timers, adopción de una baseline ficticia y recorridos de navegador. La adopción verifica la visita conservada mediante su perfil después de convertir la identidad a HMAC. Su segundo job mide una carga pequeña únicamente sobre la API.
3. **Full laboratory load**, manual: primero prueba el cifrado/lectura de un archivo de 2 GiB con `LOGMASTER_LARGE_BACKUP_TEST=true`; después prepara PostgreSQL, genera 100.000 perfiles, 1.000.000 de visitas y 5.000 visitas abiertas, y solo entonces inicia API, Next.js y Nginx. Ejecuta 50 sesiones durante dos minutos de calentamiento y quince de medición, con cinco registros de navegador concurrentes. Termina con respaldo y restauración desechable.

El generador utiliza la cuenta de mantenimiento del laboratorio; la API utiliza `logmaster_runtime` y el respaldo `logmaster_backup`. El arnés accede por HTTPS a Nginx/Next/BFF y renueva cookies de sesión. El archivo `load.json` debe identificar `https-nginx-next-bff-cookie-sessions`; un resultado `api-only` no acepta la carga completa.

Conservar los artefactos de `CI`, `Containers` y `fictitious-load-results` asociados a la revisión evaluada. Este último se publica durante siete días: descargarlo antes de que expire. Incluye hardware, recursos, prueba de flujo de 2 GiB, generación, navegador, p95, errores, respaldo y estado de restauración. En caso de fallo añade estado y logs limitados de los servicios; no publicar archivos de secretos ni volúmenes.

## Repetición local del recorrido integrado

En un equipo Linux dedicado, desde una copia del checkout que incluya los cambios a validar, con Node 22, pnpm 12.4.2 y Docker ya disponibles:

```sh
export COMPOSE_PROJECT_NAME="logmaster-validation-$(date -u +%Y%m%d%H%M%S)"
export LOGMASTER_CONFIG_DIR="$(mktemp -d /tmp/logmaster-config.XXXXXX)"
pnpm install --frozen-lockfile
sh deploy/scripts/configure.sh
sh deploy/scripts/smoke.sh
pnpm exec playwright install --with-deps chromium
docker compose -f compose.yaml -f deploy/compose.test.yaml --profile test up -d --wait api mailpit
pnpm exec playwright test tests/browser/operations.spec.ts
```

El smoke test respeta `LOGMASTER_CONFIG_DIR`, igual que las pruebas de navegador. Solo la configuración de pruebas publica API y Mailpit en loopback. Los ensayos de timers/adopción se ejecutan desde `Containers` sobre su runner desechable; no simular `GITHUB_ACTIONS` en una instalación compartida.

Para detener el laboratorio conservando la evidencia y los volúmenes:

```sh
docker compose --profile test --profile ops down
```

Eliminar volúmenes únicamente después de guardar resultados y confirmar el nombre del proyecto ficticio. El workflow de carga elimina solo sus volúmenes identificados por ejecución y su configuración privada temporal.

## Criterios de cierre

- Los tres workflows deben aprobar sobre la revisión entregada; la suite de integración de `CI` debe usar `LOGMASTER_DB_TEST=true` y el caso de 2 GiB no puede aparecer omitido. El caso de flujo de 2 GiB es independiente de PostgreSQL.
- p95 de consultas y operaciones habituales ≤1 s; búsqueda ≤2 s; errores inesperados <1 %; cero sesiones perdidas. Si fallan las listas con 5.000 visitas abiertas, corregirlas antes de aceptar rendimiento.
- Navegador, persistencia, cancelación/anonimización, permisos, exportaciones, adopción y restauración deben aprobar sin afectar bases externas.
- Registrar resultados y limitaciones en [OPERATIONAL_VALIDATION](OPERATIONAL_VALIDATION.md); mantener separados los resultados de commits anteriores. Un fallo de capacidad o un job omitido no constituye aceptación.

Estos ensayos no sustituyen la aceptación de operadores, SMTP externo, certificado confiable ni validación en el hardware empresarial.
