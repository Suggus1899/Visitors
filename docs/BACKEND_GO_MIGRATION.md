# Migración del backend a Go

Referencia de partida: commit 3e3917e, versión integral restaurada. Entrega directamente en `main`, por indicación del usuario. Su referencia anterior se conserva en `backup/main-before-go-2026-10-09`.

El backend predeterminado es Go. Las etapas se implementaron y comprobaron antes de cambiar el arranque local. El servidor TypeScript queda conservado para compatibilidad y reversión controlada. Las bases operativas anteriores, los respaldos dentro del repositorio, las ramas de respaldo y el stash se conservan. Los entornos ficticios se retiraron al cierre por petición del usuario, como se detalla al final. Ningún ensayo autoriza escribir en la base operativa anterior.

## Registro de etapas

| Etapa | Alcance | Estado | Evidencia requerida |
|---|---|---|---|
| 0 | Inventario de contratos y hallazgos | Verificado | 53 rutas únicas, 117 columnas, 19 hallazgos y fixtures Node |
| 1 | Configuración, PostgreSQL, migraciones y servidor Go | Verificado | Baseline creada y adoptada; esquema incompatible rechazado; HTTP real, configuración, límites y CORS probados |
| 2 | Criptografía, sesiones, cuentas y SMTP | Verificado | Compatibilidad Node/Go, root y política, revocación después de reinicio y Mailpit aprobados |
| 3 | Visitantes, fotos y transiciones atómicas | Verificado | Ciclo completo, salida concurrente única, consentimiento estable, matriz de cinco roles y rollback por fallo de auditoría aprobados |
| 4 | Privacidad e historial de auditoría | Verificado | Cancelación real y rollback en PostgreSQL; nuevo perfil independiente; CSV con filtros y fórmulas neutralizadas; IP confiable probada |
| 5 | Consultas, informes y SSE | Verificado | Búsqueda por nombre/cédula, paginación SQL, fronteras Caracas y SSE real con revocación; reconexión y limpieza de consultas probadas en el cliente |
| 6 | Respaldos, retención y operación | Verificado | Dump binario real, metadatos obligatorios, contraseña/rutas inválidas rechazadas; restauración HTTP aislada y retención con antigüedad, exclusión mutua y rollback aprobados |
| 7 | Cliente, CI y ensayo de cambio | Verificado | Recorrido real con fotos y ciclo completo; PDF/Excel leídos; 141 pruebas del cliente y 184 del servidor anterior; CI completa aprobada en GitHub; copia Node/Go interoperable |

Cada etapa debe registrar comandos y resultados antes de avanzar. Una prueba de contrato documenta el comportamiento esperado, sin convertir un fallo del servidor anterior en requisito del nuevo.

## Hallazgos y aceptación

| ID | Corrección | Etapa |
|---|---|---|
| A01 | Salida/reingreso con bloqueo, registro y auditoría en una transacción | 3 |
| A02 | Registro inicial atómico; límites API/BD compatibles | 3 |
| A03 | Fecha de salida persistida | 3 |
| A04 | Consentimiento independiente de observaciones | 3 |
| A05 | Actor correcto y auditoría obligatoria de operaciones | 3,4 |
| A06 | Búsqueda por cédula y nombre sin almacenar PII en claro | 5 |
| A07 | CSV de auditoría como texto; mismos filtros que pantalla | 4 |
| A08 | IP de proxies explícitamente confiables y rate limits coherentes | 4,6 |
| A09 | SSE sin token en URL, reconexión con token vigente | 5,7 |
| A10 | Rangos y grupos America/Caracas | 5 |
| A11 | Restauración exige metadatos y ruta contenida | 6 |
| A12 | Respaldo binario sin shell ni base fija | 6 |
| A13 | Retención con antigüedad, transacción y exclusión mutua | 6 |
| A14 | Migraciones explícitas y reversión honesta | 1 |
| A15 | Secretos válidos, certificados y apagado ordenado | 1,6 |
| A16 | CI con integración, concurrencia y diagnósticos de arranque | 7 |
| A17 | Errores visibles y respuestas de consultas ordenadas | 7 |
| A18 | Navegación móvil y controles accesibles | 7 |
| A19 | Documentación y carga diferida del cliente | 7 |

## Compatibilidad que debe preservarse

- HTTP `/api/v1`, estructura `{ success, data, error }`, códigos usados por el cliente, DTOs y paginación.
- Tablas y columnas existentes, IDs, BYTEA, nulls, TIMESTAMPTZ y restricciones.
- AES-256-GCM `ENC:ciphertext:iv:tag`, nonce histórico de 16 bytes, claves hexadecimales y valores legacy.
- bcrypt y SHA-256 sobre la cédula normalizada. Probar Unicode y contraseñas históricas largas antes de cambiar validaciones.
- JWT HS256, secretos de acceso/refresh independientes, derivación histórica SHA-256(secret + ':refresh') y tokenVersion persistente.
- Respaldos históricos: scrypt, gzip y disposición salt/iv/tag/ciphertext. Conservar originales.

## Entorno

PostgreSQL local 127.0.0.1:55432; Mailpit 127.0.0.1:1025 y 127.0.0.1:8025. Las pruebas Go utilizan exclusivamente logmaster_go_test; logmaster_go_dev sirve para la interfaz, logmaster_test conserva la validación del servidor anterior y logmaster_restore_test es el único destino de restauración. La retención está desactivada. Los comandos raíz utilizan Go; los comandos del servidor anterior tienen el sufijo `:legacy`.

## Verificación de etapas 3 y 4

En server-go, con DOTENV_CONFIG_PATH apuntando al entorno ignorado de logmaster_go_test y LOGMASTER_DB_TEST=true: `go test ./... -count=1`, `go test -race ./... -count=1` (CGO_ENABLED=1) y `go vet ./...`. Las pruebas montan las rutas Go reales y PostgreSQL; los fallos de auditoría se provocan con triggers limitados al actor ficticio. Cada prueba elimina sus propios registros. El consentimiento se almacena en columnas independientes. La cancelación sustituye el hash por una referencia aleatoria y borra PII asociada dentro de la misma transacción.

## Evidencia de cierre — 9 de octubre de 2026

| Verificación | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | Aprobada con pnpm 12.4.2 |
| `pnpm build`, comprobaciones de tipos y lint del cliente | Aprobadas |
| `pnpm local:prepare`, `pnpm test:integration` | Aprobadas sobre bases independientes |
| `go test -race ./... -count=1 -coverprofile=coverage.out` | Aprobada: 30 funciones de prueba, con subcasos y PostgreSQL real; HTTP 64,7 %, base 72,1 %, configuración 80,7 % |
| `go vet ./...`, `go mod verify` | Aprobadas |
| sqlc 1.31.1 | Regeneración sin diferencias en los bindings |
| govulncheck 1.8.0 | Cero vulnerabilidades alcanzables; una en un módulo requerido sin llamadas afectadas |
| React / Testing Library / Vitest | 141 pruebas en 21 archivos aprobadas |
| Regresión TypeScript | 184 pruebas en 18 archivos y comprobación de tipos aprobadas |
| Ensayo Node → respaldo Go → restauración Go → lectura Node | Aprobado, sin modificar la base fuente |
| Interfaz real | Registro ficticio, consentimiento, dos fotos, vehículo, acompañante, admisión, salida temporal, regreso y cierre |
| Exportaciones reales | PDF leído con pypdf; Excel leído con openpyxl: hojas Resumen/Visitas, fechas, filtros y encabezados conservados |
| Pantalla móvil de operaciones y administración | Comprobada a 390 píxeles, sin desbordamiento horizontal de la página |
| CI | [Ejecución 37962616176](https://github.com/Suggus1899/Visitors/actions/runs/37962616176), commit b1c26a5: ambos jobs aprobados en Ubuntu, con PostgreSQL 16, Mailpit, carreras, sqlc, govulncheck, cliente y regresión Node |

El formulario root muestra su rol fijo y omite el rol al guardar correo/usuario; una prueba del cliente y un subcaso PostgreSQL cubren esa edición. Los controles de auditoría y cuentas tienen nombres accesibles. Vite escucha en loopback y su proxy apunta a la API IPv4; no redirige fotografías públicas mediante `/data`.

La actualización de `golang.org/x/image` a 0.45.0 corrige los avisos WebP alcanzables detectados durante la verificación. El código SQL generado tiene cobertura directa cero: las pruebas lo ejercitan a través de la API real. El CLI se valida mediante preparación, arranque y ensayos; no se interpreta la cobertura parcial como una auditoría exhaustiva de seguridad.

## Cambios de API y esquema

Se conservan las 53 rutas. Las escrituras exigen rol y actor de sesión; cada edición requiere `editPassword`. Las fotografías y el SSE usan Authorization, las imágenes son privadas y el historial incluye bloqueo, observaciones y el contexto nullable. Los usuarios tienen `email` y `tokenVersion`; los visitantes anonimizados exponen cédula null. Cancelar con visitas abiertas devuelve 409.

La versión Goose 1 conserva las 117 columnas de la baseline estabilizada. La versión 2 amplía `purpose`, separa el consentimiento y su responsable, añade el responsable del reingreso y restringe los intervalos abiertos duplicados. Los duplicados previos detienen la migración con sus IDs; no se eliminan registros para hacerla pasar. La preparación explícita cifra el historial antiguo de forma idempotente y elimina valores binarios del historial de fotos. El arranque no migra ni siembra.

## Ensayo y reversión

El ensayo utilizó `logmaster_test` como fuente de lectura y `logmaster_restore_test` como copia desechable. Confirmó que Go acepta los JWT y los campos cifrados de Node, y que el servidor Node puede leer JWT y visitas creadas por Go. La fuente conservó sus conteos y versión de migración.

Para volver al servidor anterior sobre una copia comprobada: detener Go, seleccionar el archivo privado mediante `DOTENV_CONFIG_PATH` y ejecutar `pnpm local:start:legacy`. Conservar las claves AES/JWT originales; no ejecutar semillas ni sincronización contra la base operativa. `adopt` y `migrate` se ensayan explícitamente en la copia antes del arranque Go. No se ofrecen migraciones descendentes que borren consentimiento o historial.

La restauración prepara el SQL en un archivo privado y reemplaza esquema/datos mediante `psql --single-transaction`. La revocación de sesiones y la auditoría posterior se confirman en otra transacción; si esa fase falla, revisar la base de ensayo. Los respaldos históricos pueden conservar PII cancelada.

## Estructura y limpieza

`server-go/` contiene el backend vigente; `server/` conserva el backend anterior necesario para el ensayo de reversión. `docs/legacy/` reúne siete guías históricas; las guías Go quedan en la raíz de `docs/`. Se eliminaron un contexto de tema sin referencias y dos imágenes sin uso, conservando `client/public/logo.png`. Se revisaron importaciones, scripts y cargas dinámicas: migraciones, fixtures y seeders referenciados permanecen.

`.gitignore` excluye `.claude/`, `.devin/`, `.codebase-memory/`, `graphify-out/`, entornos privados, dependencias, datos, respaldos, binarios, cobertura y cachés TypeScript. Los archivos locales de asistentes se conservan en disco. `.github/` y `.husky/` permanecen versionados; el hook comprueba también Go y deja de omitir main. `.env.example` contiene placeholders y el buzón local, sin contraseñas de prueba reutilizables.

## Límites pendientes de operación

El proveedor SMTP externo y el despliegue institucional no forman parte del ensayo. La búsqueda por nombre descifra perfiles y tiene coste lineal; se revisará para volúmenes grandes. El panel administrativo conserva un chunk diferido de aproximadamente 1,63 MB: la carga inicial se redujo de aproximadamente 2,4 MB a 570 KB, pero queda margen para optimizar ese panel. No se modificaron las bases operativas ni los respaldos originales.

## Retirada del entorno auxiliar solicitada por el usuario

Después de completar las pruebas se detuvieron Go, Vite, PostgreSQL y Mailpit. `F:\Proyectos\Visitors-local` se envió a la Papelera y se comprobó que ya no existe en su ubicación original. Contenía los binarios descargados, las bases ficticias y los ensayos; los respaldos de `backups/`, las ramas y el stash del repositorio permanecen. La aplicación local está detenida. `pnpm local:setup` y `pnpm local:prepare` pueden recrear un entorno vacío; las credenciales locales ignoradas siguen conservadas.

La eliminación permanente fue rechazada por la revisión automática de la sesión; la retirada a la Papelera ofrece recuperación. La captura del recorrido se conserva en `logs/migration-verification/logmaster-go-admin.jpg`, ignorada por Git. Las pruebas anteriores describen el entorno antes de esta retirada, y la CI usa servicios independientes de GitHub.

El primer runner detectó una dependencia de las pruebas Node respecto al JWT del archivo privado local. `server/vitest.config.ts` ahora proporciona configuración ficticia explícita y un puerto de base cerrado para esas pruebas unitarias; la ejecución completa posterior quedó aprobada. Codebase Memory y Graphify se actualizaron para incluir Go y la documentación vigente. El grafo Graphify no incluye AST SQL por falta de `tree_sitter_sql`; el SQL se corroboró mediante lectura y PostgreSQL real.
