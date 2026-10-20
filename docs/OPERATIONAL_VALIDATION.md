# Validación operativa de laboratorio

LogMaster se prepara en `main` para Linux con contenedores. Los ensayos utilizan bases, credenciales, correo y visitantes ficticios; no se instaló Docker en el equipo Windows ni se modificaron sus bases o respaldos anteriores. La retención de información personal permanece desactivada.

**Alcance de la evidencia:** la integración de la remediación se verificó en Linux sobre `94107f2` el 20 de octubre de 2026. La carga completa del arnés actualizado y la prueba de flujo de 2 GiB siguen pendientes del runner dedicado. Las métricas de rendimiento del 12 de octubre y anteriores se conservan como evidencia histórica y no aceptan el rendimiento del estado actual.

## Integración de la remediación — 20 de octubre de 2026

Referencia evaluada: [94107f2](https://github.com/Suggus1899/Visitors/commit/94107f244fb50b8a99d13756ef5288aed8b450ab).

| Comprobación | Evidencia y alcance |
|---|---|
| [CI](https://github.com/Suggus1899/Visitors/actions/runs/39499158253) | Cliente y backend aprobados: instalación congelada, tipos, lint, 166 pruebas del cliente en 29 archivos, build de Next.js, auditoría de dependencias, migraciones en PostgreSQL 16 ficticio, Mailpit, Go con `-race -p 1`, vet, build, sqlc y govulncheck. |
| [Containers](https://github.com/Suggus1899/Visitors/actions/runs/39499158174) | Instalación vacía, cuentas y privilegios separados, HTTPS, logs sin identificadores de prueba, persistencia tras recreación, respaldo cifrado, restauración, revocación de sesiones, timers adelantados y adopción del esquema anterior ficticio. Incluye cuatro recorridos de navegador y una carga pequeña de 100 visitantes/1.000 visitas únicamente sobre la API. |
| Restauración rechazada | El CLI devuelve error ante un root inexistente y el smoke verifica que no cambie `tokenVersion` en la fuente. La restauración válida posterior y las migraciones repetidas también aprueban. Las pruebas Go cubren la reversión ante fallos de revocación/auditoría. |
| Navegador | Cámara HTTPS, fotografías autenticadas, consentimiento, espera/admisión/salida temporal/reingreso/cierre, recuperación Mailpit, roles, SSE, rechazo de IP falsificada y descarga real de PDF/Excel. El quinto caso, carga de cinco navegadores, queda omitido deliberadamente fuera del laboratorio completo. |
| Carga completa y archivo de 2 GiB | No ejecutados en este bloque. Mantener abiertas la aceptación de escala, latencias y recursos del arnés actual. |

La primera ejecución detectó una variable de error sombreada en el CLI de restauración: una operación rechazada podía imprimir éxito. Se corrigió su propagación y se reforzó el smoke. CI también detectó dos avisos altos en `follow-redirects` 1.16.0; el lockfile se actualizó exclusivamente a 1.16.1 y la auditoría posterior aprobó. El recorrido de cámara se actualizó para localizar el botón por su nombre accesible. La limpieza de Containers incluye los servicios del perfil `ops`.

El cierre de esta revisión añade al comando `local:prepare` y al ejemplo del README la misma concesión de roles ya comprobada por Containers, después de migrar y antes de iniciar la API. Los workflows de su commit de cierre vuelven a ejecutar las comprobaciones; consultar el historial de Actions para esa referencia final. No se ejecutaron migraciones, semillas ni restauraciones sobre las bases anteriores del equipo Windows.

## Verificación local del trabajo actual — 19 de octubre de 2026

- `LOGMASTER_DB_TEST=false go test -race -p 1 ./... -count=1`, `go vet ./cmd/lab` y `go build ./cmd/lab`: aprobados.
- `pnpm test:client`: 29 archivos y 166 pruebas aprobados; `pnpm --dir client exec tsc --noEmit` y el tipado de `tests/browser/load.spec.ts`/`playwright.config.ts`: aprobados.
- `pnpm exec playwright test tests/browser/load.spec.ts`: omitido correctamente fuera del modo de laboratorio; Chromium y la aplicación no se ejecutaron en este equipo.
- Los YAML del workflow/Compose se analizaron y `configure.sh` creó un certificado temporal con SAN `localhost`, `web` y `127.0.0.1`. No se generaron datos de carga ni se conectó a PostgreSQL.

La capacidad disponible localmente no permite aceptar la etapa: este host no tiene Docker ni Podman. La etapa 7 exige runner Linux con ≥4 vCPU, ≥16 GiB de RAM y ≥512 GiB libres tanto en workspace como en Docker. La instancia debe ejecutar el workflow manual `Full laboratory load` con las etiquetas `self-hosted, linux, x64, logmaster-load`.

La preparación posterior corrige `pnpm backup` para usar la cuenta de respaldo, separa la cuenta runtime del laboratorio de carga, inicia la API después de generar el esquema/datos y actualiza la comprobación de adopción para identidades HMAC. La prueba nueva de credenciales falló por ausencia de `load-runtime.env` y pasó después de corregirlo, ejecutada como binario Linux en WSL con archivos temporales ficticios. Esta prueba no utiliza Docker ni PostgreSQL. El workflow manual habilita explícitamente el caso de flujo de 2 GiB, todavía pendiente de ejecución. La secuencia y evidencia exigidas están en [LINUX_VALIDATION](LINUX_VALIDATION.md).

En este bloque pasaron `go test -race ./internal/config ./cmd/lab -count=1`, la suite de configuración compilada para Linux y ejecutada en WSL, el tipado estricto de ambos archivos de navegador y su configuración, y el análisis de siete YAML junto con la sintaxis Bash/sh de workflows y despliegue. Estas comprobaciones no sustituyen ejecutar Compose, la adopción SQL ni los recorridos reales. El lockfile permanece sin cambios.

## Evidencia histórica de Next.js y HeroUI — 12 de octubre de 2026

La validación histórica corresponde al commit [45e37c5](https://github.com/Suggus1899/Visitors/commit/45e37c57f311a77a04ccfe73aed71a167190d122). La [CI](https://github.com/Suggus1899/Visitors/actions/runs/38282064141) aprobó Go con `-race`, `go vet`, compilación, bindings SQL y revisión de vulnerabilidades; en el cliente aprobó TypeScript, ESLint, las 140 pruebas en 22 archivos, compilación de Next.js y auditoría de dependencias.

El workflow [Containers](https://github.com/Suggus1899/Visitors/actions/runs/38282064271) aprobó instalación vacía, persistencia, timers, adopción de una base ficticia y la carga pequeña. Playwright pasó 4 de 4 recorridos con API y PostgreSQL reales en contenedores: ciclo de acceso con cámara y consentimiento, recuperación de contraseña mediante Mailpit, permisos/SSE/IP y administración con descargas reales de PDF y Excel. El recorrido del ciclo detectó que el botón compartido convertía el `PressEvent` de HeroUI en un `MouseEvent`; al intentar detener la propagación, la función fallaba antes de enviar la admisión. El wrapper ahora reenvía el evento HeroUI sin convertirlo y el recorrido completo pasa.

La prueba completa de esta revisión aprobó en el [workflow manual](https://github.com/Suggus1899/Visitors/actions/runs/38282782707). El runner Linux tuvo 4 vCPU AMD EPYC 9V74, 15,61 GiB de RAM, Docker 28.0.4, PostgreSQL 16 y Go 1.27.2. Generó los 100.000 perfiles y 1.000.000 de visitas ficticias en 66,28 segundos; ejecutó 120 segundos de calentamiento y 900 segundos de carga mixta con 50 sesiones.

| Medición del 12 de octubre | Resultado | Criterio |
|---|---:|---:|
| Solicitudes medidas | 57.123 | Carga mixta durante 900 s |
| p95 de consultas habituales | 0,213 s | ≤ 1 s |
| p95 de búsquedas | 0,843 s | ≤ 2 s |
| p95 de operaciones | 0,063 s | ≤ 1 s |
| Errores inesperados | 0 % | < 1 % |
| Respaldo cifrado verificado | 83.562.141 bytes; 10,34 s | Exitoso |
| Restauración desechable | 22,45 s | Exitosa; la fuente se conservó |

El muestreo periódico de `docker stats` observó máximos de 71,89 MiB para la API y 302,90 MiB para PostgreSQL durante la carga. En respaldo/restauración observó 1.042,43 MiB para el proceso administrativo, 302,90 MiB para PostgreSQL fuente y 199,60 MiB para la base desechable. Son máximos de muestras cada 15 segundos durante carga y cada 2 segundos durante respaldo/restauración, no picos absolutos; los registros estaban en el artefacto `fictitious-load-results`. Estos datos corresponden exclusivamente a la revisión del 12 de octubre y no validan el arnés ni el formato de respaldos actuales.

## Diagnóstico del proceso y evaluación de uso

Los instrumentos para entrevista, observación y evaluación de LogMaster están preparados en [DOCX](instrumentos-diagnostico/Instrumentos_Diagnostico_Evaluacion_LogMaster.docx) y [PDF](instrumentos-diagnostico/Instrumentos_Diagnostico_Evaluacion_LogMaster.pdf). El levantamiento en Industrias de Alimentos El Trébol y las pruebas con sus operadores siguen pendientes: requieren observar el proceso real y contar con la participación de la empresa. No se usaron datos ni participantes reales en la validación técnica.

## Evidencia por etapa

| Etapa | Implementación y comprobación |
|---|---|
| 1. Contenedores | Imágenes multietapa con versiones/digests, secretos excluidos, usuarios dedicados, datos/respaldos/contraseñas en volúmenes separados; instalación vacía y persistencia tras recreación |
| 2. HTTPS y correo | Nginx bajo el mismo origen, 5 MB, SSE sin buffering, IP del proxy verificada; cámara, Blob privado, recuperación en Mailpit y rechazo de IP falsificada |
| 3. Mantenimiento | Simulación sin mutación, destino confirmado, adopción del esquema Node ficticio y primer root; migración repetida; restauración de staging antes de aplicar y revocación/auditoría en una transacción |
| 4. Consultas | Trigramas HMAC, reconstrucción reanudable y verificación exacta; agregaciones SQL y calendario diario con detalle paginado; búsqueda corta rechazada e índice eliminado al cancelar |
| 5. Cliente y exportación | Pestañas y bibliotecas diferidas; límites PDF 2.000/Excel 20.000 antes de recopilar, cancelación y detección de totales/IDs inconsistentes; PDF y Excel descargados desde el navegador real |
| 6. Respaldos | La revisión del 20 de octubre verifica cifrado de flujo, roles separados, respaldo/restauración, timers y rollback con PostgreSQL ficticio. La prueba de flujo de 2 GiB y el ensayo a escala permanecen pendientes del runner dedicado. |
| 7. Rendimiento y retiro | La carga histórica de 100.000 visitantes/1.000.000 de visitas se ejecutó antes de las tareas actuales. El nuevo arnés añade imágenes ficticias, 5.000 visitas abiertas y 50 sesiones vía TLS/Nginx/Next/BFF; los recorridos de navegador y el ensayo grande requieren el runner etiquetado `logmaster-load` y aún no se ejecutaron. |

El recorrido de navegador anterior al retiro, [Containers del commit d040e64](https://github.com/Suggus1899/Visitors/actions/runs/38069769820), aprobó cuatro pruebas: operación completa con cámara/consentimiento/transiciones, restablecimiento mediante Mailpit y uso único, permisos/SSE/IP y carga diferida con descargas reales. La [CI del mismo commit](https://github.com/Suggus1899/Visitors/actions/runs/38069769795) comprobó también el backend Node antes de retirarlo.

Después del retiro, [CI de 4581a57](https://github.com/Suggus1899/Visitors/actions/runs/38070560477) y [Containers de 4581a57](https://github.com/Suggus1899/Visitors/actions/runs/38070560275) aprobaron el backend Go, cliente, auditoría de dependencias, instalación/restauración, timers, adopción, cuatro recorridos de navegador y carga pequeña. Las imágenes de esta versión están en el artefacto `logmaster-images`. La ruta PostgreSQL heredada en la imagen de herramientas de la API utiliza un montaje temporal comprobado dentro del contenedor; los datos persistentes siguen en volúmenes nombrados.

Los cuatro scripts necesarios se reubicaron en `deploy/scripts/`, por preferencia del usuario, junto a Compose, Nginx y systemd. [CI de 34181c7](https://github.com/Suggus1899/Visitors/actions/runs/38071327928) y [Containers de 34181c7](https://github.com/Suggus1899/Visitors/actions/runs/38071327979) volvieron a aprobar las comprobaciones con sus referencias actualizadas. Las imágenes vigentes también están disponibles como artefacto de ese ensayo.

Las pruebas Go con PostgreSQL real comprueban permisos, sesión revocada incluso después de crear otra instancia, búsqueda protegida y equivalencia de estadísticas. También comprueban rollback de edición/auditoría, cancelación y registro independiente, archivo dañado, clave incorrecta, esquema incompatible y fallos inducidos durante la revocación y auditoría de restauración. El ensayo CLI adopta una baseline ficticia sin tabla Goose y conserva su visita antes de crear el primer root. Esta matriz se repitió para la remediación en los workflows del 20 de octubre; no reemplaza el ensayo de carga completo.

## Carga completa aprobada antes del retiro

Fuente: [Full laboratory load — bc1d441](https://github.com/Suggus1899/Visitors/actions/runs/38068317402), artefacto `fictitious-load-results`. Runner Linux x86_64, 4 CPU virtuales Intel Xeon Platinum 8573C, 15,61 GiB de RAM, PostgreSQL 16 y Go 1.27.2. Se generaron 100.000 perfiles y 1.000.000 de visitas en 67,86 segundos; hubo dos minutos de calentamiento y quince de medición, con 50 sesiones.

| Medición | Resultado | Criterio |
|---|---:|---:|
| Solicitudes medidas | 47.482 | Carga mixta durante 900 s |
| p95 consultas habituales | 0,79156 s | ≤ 1 s |
| p95 búsquedas | 1,72305 s | ≤ 2 s |
| p95 operaciones | 0,34433 s | ≤ 1 s |
| Errores inesperados | 0 % | < 1 % |
| Respaldo cifrado | 88.983.933 bytes; 12,63 s | Creación y verificación exitosas |
| Restauración desechable | 25,84 s | Estado exitoso, fuente conservada |

La operación se mide por cada petición de transición; el tiempo de las cinco peticiones de un ciclo completo no se confunde con la latencia individual. El arnés abre 50 sesiones con pausa de un segundo entre recorridos; no equivale a 50 peticiones por segundo constantes. Los registros incluyen estados abiertos/cerrados, nombres frecuentes, perfiles anonimizados y fotografías ficticias. Los resultados corresponden al hardware y mezcla documentados.

El muestreo cada 15 segundos durante la carga anterior registró máximos observados de 88,84 MiB para la API y 290,60 MiB para PostgreSQL. Son muestras periódicas, no picos absolutos ni mediciones de memoria de la creación del respaldo; se conservan los registros originales en el artefacto.

Los ensayos previos que superaron objetivos no se aceptaron. Se corrigió la planificación de consultas según los parámetros reales, los índices y el cálculo de latencias. El workflow utiliza `bash` con parada ante errores de la tubería, por lo que una salida JSON con `passed: false` hace fallar la ejecución.

## Carga y recursos después del retiro

La ejecución final [Full laboratory load — dae5e51](https://github.com/Suggus1899/Visitors/actions/runs/38070296024) aprobó el mismo volumen, 50 sesiones, 120 segundos de calentamiento y 900 segundos de medición. Runner Linux x86_64, 4 CPU virtuales AMD EPYC 7763, 15,61 GiB de RAM y Go 1.27.2. La generación duró 59,53 segundos. La empresa ficticia se almacenó en texto claro, como exige el contrato de ese campo; el primer ensayo utilizaba una representación más larga. Los campos personales cifrados, anonimización y fotografías se conservaron.

| Medición final | Resultado | Criterio |
|---|---:|---:|
| Solicitudes medidas | 47.817 | Carga mixta durante 900 s |
| p95 consultas habituales | 0,68153 s | ≤ 1 s |
| p95 búsquedas | 1,46237 s | ≤ 2 s |
| p95 operaciones | 0,36842 s | ≤ 1 s |
| Errores inesperados | 0 % | < 1 % |
| Respaldo cifrado verificado | 83.169.874 bytes; 12,45 s | Exitoso |
| Restauración desechable | 18,12 s | Exitosa |

Durante la carga, el muestreo registró máximos observados de 69,72 MiB para API y 296,00 MiB para PostgreSQL. Durante respaldo/restauración se registraron 1.041,41 MiB para el proceso administrativo, 288,80 MiB para PostgreSQL fuente y 198,40 MiB para PostgreSQL desechable. El proceso administrativo y sus temporales necesitan margen adicional al consumo habitual de la API. Son muestras periódicas de `docker stats`, no picos absolutos; `resources.txt` y `backup-resources.txt` acompañan los resultados. Los límites explícitos y las pruebas de fallo de E/S permanecen activos.

El backend de aplicación no cambió entre dae5e51 y 34181c7: solo se corrigió la comprobación del montaje temporal, se reorganizaron scripts y se actualizaron referencias/manuales. La carga completa y los recorridos posteriores verifican ese mismo backend; los cambios siguientes de esta entrega son evidencia documental y un comentario de la plantilla de entorno.

## Comprobaciones locales y estructura final

- Las métricas locales históricas de esta sección —incluidos los tamaños de bundle y 146 pruebas en 21 archivos— corresponden al cliente React/Vite anterior a Next.js. Para la validación vigente de Next.js/HeroUI, la CI del 12 de octubre aprobó tipos, lint, build y auditoría; localmente pasaron 140 pruebas en 22 archivos. Véase la sección vigente al inicio del documento.
- Instalación histórica `pnpm install --frozen-lockfile` aprobada con pnpm 12.4.2; dos proyectos en el workspace: raíz y cliente.
- Las pruebas locales con `LOGMASTER_DB_TEST=false` no cubren PostgreSQL. La integración PostgreSQL, sqlc y govulncheck se verificaron posteriormente en Linux CI el 20 de octubre; véase el registro al inicio.
- `pnpm audit --prod --audit-level moderate`: ninguna vulnerabilidad conocida después de retirar las dependencias exclusivas del backend Node.
- Administración: fragmento de 17,55 kB minificado; estadísticas, calendario, respaldos y exportadores están separados. El fragmento inicial de 578,10 kB todavía produce aviso de tamaño, y el exportador Excel ocupa 940,82 kB; se descarga al exportar. No se ocultó ese aviso.
- El código anterior está en `backup/node-before-retirement-2026-10-10` (d040e64), publicada en el remoto. Las ramas de respaldo anteriores y los dos stashes permanecen conservados.
- `server/` ya no tiene archivos versionados. Sus `.env`, `data/` y `backups/` locales se conservaron. La política automática bloqueó la eliminación de `server/node_modules`; queda ignorado y excluido del contexto Docker, sin uso por el workspace vigente.
- Codebase Memory y Graphify se actualizaron tras retirar Node. Hay límites de análisis SQL/Nginx en los grafos; los hallazgos de esas rutas se corroboraron con fuente y pruebas reales, sin interpretar ausencia en el índice como prueba de completitud.

## Reproducción y recuperación

Los comandos y precauciones están en [QUICKSTART](QUICKSTART.md) y [OPERATIONS](OPERATIONS.md). El workflow manual `Full laboratory load` ejecuta el conjunto completo; `Containers` ejecuta carga pequeña en cada push y publica `logmaster-images.tar.gz` como artefacto de siete días. Las imágenes se pueden cargar en Linux mediante `docker load -i logmaster-images.tar.gz` y usar con Compose sin volver a construirlas.

No ejecutar `down -v` sobre una instalación operativa. Usar los comandos de simulación del CLI antes de confirmar `host:puerto/base`, conservar claves y contraseña fuera del respaldo y validar una copia antes de intervenir una base anterior. La instalación física necesita servidor, hostname, certificado confiable, SMTP seguro, responsables y aceptación de operadores.

Los respaldos históricos pueden reintroducir datos cancelados. Deben revisarse las cancelaciones posteriores antes de restaurar. No se probaron datos reales, correo externo ni hardware empresarial; el laboratorio no representa aceptación institucional.
