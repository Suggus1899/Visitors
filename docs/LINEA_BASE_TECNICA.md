# LogMaster · Línea base técnica antes de la refactorización

Referencia para desarrollar, mantener y verificar el sistema de control de acceso de visitantes.

| Dato | Referencia |
| --- | --- |
| Fecha de corte | 10 de noviembre de 2026, America/Caracas |
| Checkout | main |
| Revisión del código | b760bc84a8a7a2b2d1527f8bd086f1137aa4597d |
| Alcance | Repositorio y laboratorio reproducible con datos ficticios |
| Propósito | Comparar una futura rama de refactorización con el comportamiento vigente |

## 1. Alcance y fuentes

LogMaster registra el ingreso, la permanencia y la salida de visitantes en un punto de control. Incluye perfiles y fotografías, consentimiento, trazabilidad, consultas, reportes, gestión de usuarios, solicitudes de privacidad y respaldos. La referencia es el código y la configuración versionados en la revisión indicada. Los resultados de ejecución se atribuyen a su commit y entorno. La infraestructura empresarial, sus bases activas, la validación con operadores y el material académico local quedan fuera del corte.

Las guías de [API](API.md), [arquitectura](ARCHITECTURE.md), [seguridad](SECURITY.md), [operaciones](OPERATIONS.md), [usuario](USER_MANUAL.md) y [validación](OPERATIONAL_VALIDATION.md) conservan el detalle de su área. Esta síntesis fija cómo encajan y qué preservar al cambiar código. [Migración Go](BACKEND_GO_MIGRATION.md), [plan de salida](GO_LIVE_PLAN.md) y [archivo histórico](legacy/README.md) se interpretan según la revisión que describen.

## 2. Arquitectura y límites de responsabilidad

LogMaster tiene una API de dominio en Go, un frontend Next.js y PostgreSQL. Next.js sirve las vistas y actúa como BFF, el backend para el frontend que media entre el navegador y la API privada. El repositorio contiene también un CLI de mantenimiento y un arnés de laboratorio. Node.js ejecuta Next.js y sus herramientas. El servidor Express anterior fue retirado. Los fixtures conservan contratos y formatos previos para verificar compatibilidad.

    Navegador
        │ HTTPS, cookies, imágenes y eventos
        ▼
    Nginx ── HTTP interno ── Next.js (SSR y BFF)
                                │ Bearer entre servidores
                                ▼
                           API Go / Chi ── pgx ── PostgreSQL
                                │ SMTP
                                ▼
                             Mailpit (laboratorio)

    CLI ops / backup ── PostgreSQL y volúmenes privados
           └────────── PostgreSQL de restauración separado

| Frontera | Responsabilidad y fuente |
| --- | --- |
| Navegador / Next.js | Interfaz, navegación, caché de consultas, captura y archivos. [Cliente](../client/package.json) |
| Next.js / Go | SSR consulta sesión. El BFF valida origen de escrituras y transporta JSON, binarios y SSE (eventos del servidor). [BFF](../client/src/app/api/v1/%5B...path%5D/route.ts) |
| Go / PostgreSQL | Go decide permisos y reglas. PostgreSQL persiste datos y aplica restricciones, bloqueos e integridad transaccional. [Router](../server-go/internal/httpapi/app.go#L267) · [SQL](../server-go/db/queries.sql) |
| Aplicación / mantenimiento | Cuenta runtime de privilegios limitados. Adopción, migración, permisos y restauración usan comandos y configuración separados. [CLI](../server-go/cmd/logmaster/operations.go) |
| Correo y ensayos | Mailpit captura correo ficticio. Generador y base desechable se activan para ensayos específicos. [Compose](../compose.yaml) · [Carga](../deploy/compose.load.yaml) |

| Capa | Versiones de la revisión |
| --- | --- |
| Web | Next.js 16.4.3, App Router y salida standalone. React 19.3.1, TypeScript 5.9, HeroUI 3.2.7, Tailwind CSS 4.3 y TanStack Query 5. |
| Herramientas JS | Node 22 en imagen y CI, pnpm 12.4.2, Playwright 1.64.1, Vite 7.3.7 y Vitest 4.1.12 para pruebas. |
| API | Go 1.27, toolchain 1.27.3. Chi v5, pgx v5, Goose v3, JWT v5, go-mail y age. sqlc genera los bindings SQL. |
| Infraestructura | PostgreSQL 16 Bookworm, Nginx 1.28 Alpine y Mailpit 1.31.4. Imágenes base fijadas por digest. |

Valores exactos en [cliente](../client/package.json), [Go](../server-go/go.mod), [workspace](../package.json), [lockfile](../pnpm-lock.yaml) y Dockerfiles de [Next](../client/Dockerfile), [Go](../server-go/Dockerfile) y [Nginx](../deploy/nginx.Dockerfile).

## 3. Operación y reglas del dominio

### Registro y ciclo de visita

El formulario consulta por cédula y separa identificación, información personal, extras y datos de visita. Go valida los campos y el consentimiento explícito con aceptación, versión de política y fecha. La acción es Carga, Descarga o Ninguna. Cada acompañante requiere su propia visita y consentimiento. Los campos históricos de acompañantes se mantienen para lectura. Registrar otra visita de un perfil conocido conserva sus fotos existentes.

| Estado inicial | Operación | Estado final y efecto |
| --- | --- | --- |
| Sin visita abierta | Registro | waiting o active. Se asocian visitante, datos operativos y consentimiento. La API usa active si se omite el estado. |
| waiting | Admisión | active. Se marca la hora efectiva de entrada. |
| waiting | Cancelar visita | cancelled. Exige motivo y registra VISIT_CANCELLED. |
| active | Salida temporal | intermittent. Abre un registro en IntermittentLogs. |
| intermittent | Reingreso | active. Cierra el intervalo abierto. |
| active | Salida definitiva | completed. Registra las horas de salida. |

Las transiciones bloquean la fila y comprueban el estado esperado. La base impide dos visitas abiertas para la misma identidad y dos intervalos abiertos para la misma visita. La mutación y su auditoría se confirman juntas. El aviso SSE se publica después del commit. Los conflictos devuelven 409, con códigos como OPEN_VISIT_EXISTS e INVALID_VISIT_STATE. [Visitas](../server-go/internal/httpapi/visits.go#L70) · [Visita abierta](../server-go/db/migrations/00001_baseline.sql#L719) · [Intervalo abierto y consentimiento](../server-go/db/migrations/00002_visit_integrity.sql)

Cancelar una visita en espera cierra el trámite con un motivo. La cancelación ARCO anonimiza el perfil y sus referencias tras verificar identidad y comprobar que no hay visitas abiertas. ARCO agrupa acceso, rectificación, cancelación y oposición sobre datos personales. [Cancelación de datos](../server-go/internal/httpapi/privacy.go#L282)

### Roles y autorización

| Operación | Control en Go |
| --- | --- |
| Consultar visitas, perfiles, reportes, fotos y eventos | Sesión vigente y restricciones aplicables. Las vistas del cliente tienen filtros adicionales. |
| Registrar, admitir, cancelar una visita en espera y moverla por su ciclo | operador, admin o root. |
| Editar perfil/fotos o rectificar | operador, admin o root con contraseña adicional en cada guardado. Se valida el vínculo si se indica una visita. |
| Bloquear/desbloquear visitantes | admin o root con contraseña adicional. |
| Crear solicitud ARCO u oposición | operador, admin o root. |
| Consultar solicitudes o datos del titular | admin, root o auditor. |
| Cambiar estado de solicitudes o cancelar datos | admin o root. La cancelación requiere constancia de verificación de identidad. |
| Auditoría general | admin, root o auditor. |
| Respaldos HTTP | admin o root, con restricciones del entorno para crear o restaurar. |
| Cuentas, reset administrativo y auditoría del panel root | root. |

Demo usa la vista guiada de operación. Las escrituras del dominio se reservan a los roles autorizados. El cliente muestra acciones según rol y Go comprueba las solicitudes. [Auth](../server-go/internal/httpapi/auth.go#L111) · [Privacidad](../server-go/internal/httpapi/privacy.go#L17) · [Prueba de roles](../server-go/internal/httpapi/permissions_test.go)

## 4. Frontend, rutas y transporte

| Ruta | Propósito y acceso |
| --- | --- |
| /login, /forgot-password, /reset-password | Autenticación y recuperación. El enlace de recuperación lleva el token de un uso a la pantalla de restablecimiento. |
| /auth/renew | Renovación por cookie y regreso a un destino interno validado. |
| / | Registro y listas de espera, activas e intermitentes. operador, admin, root y demo. |
| /admin | Historial, filtros, visitantes, calendario, estadísticas y respaldos. admin y root. |
| /audit | Actividad, filtros, estadísticas y exportación. admin, auditor y root. |
| /privacy | Solicitudes ARCO y consulta del titular según rol. operador, admin, auditor y root. |
| /root | Cuentas, roles y auditoría de administración. root. |
| /change-password | Cambio propio, incluido el flujo obligatorio para sesiones restringidas. |
| /health | Salud de Next.js. /api/v1/health llega a Go y comprueba PostgreSQL. |

El layout global entrega el usuario inicial a los proveedores de tema, autenticación y consultas. Las páginas protegidas llaman a requireUser en SSR. readCurrentUser usa la caché de React del render y consulta /auth/session con no-store. La renovación y el cierre actualizan o limpian sesión, caché y eventos. [Sesión SSR](../client/src/server/session.ts) · [Proveedores](../client/src/app/providers.tsx) · [Rutas](../client/src/app)

- Los servicios usan /api/v1 del mismo origen. TanStack Query mantiene caché e invalida listas tras mutaciones y eventos. El hook SSE reintenta, renueva ante 401 y aborta al salir. Las listas recurren a sondeo cada 15 segundos si se pierde la conexión. [Eventos](../client/src/hooks/useVisitEvents.ts) · [Operación](../client/src/App.tsx)
- Login, refresh y logout tienen rutas BFF propias. Next guarda acceso y renovación en cookies Secure, HttpOnly y SameSite=Lax. El navegador recibe el usuario y la API privada recibe el Bearer. [Cookies](../client/src/server/auth-cookies.ts)
- Las fotografías remotas se solicitan como binarios autenticados y usan URLs temporales de Blob que se revocan. El cliente limita la lectura de archivos y el avatar de respaldo es local. La cámara necesita permisos y un contexto seguro, provisto por HTTPS en laboratorio. [Imagen autenticada](../client/src/components/AuthenticatedImage.tsx) · [Captura](../client/src/components/PhotoCapture.tsx)
- Administración carga paneles al abrirlos y ExcelJS/jsPDF al exportar. La API entrega una instantánea y el cliente produce el archivo con filtros y orden. El flujo es cancelable. Los límites son 2.000 visitas para PDF y 20.000 para XLSX. El PDF de calendario comparte el límite de PDF. Go genera el CSV de auditoría. [Administración](../client/src/components/AdminDashboard.tsx) · [Exportación](../client/src/components/admin/VisitsTable.tsx)
- Calendario y reportes usan America/Caracas. El calendario agrupa por día y obtiene detalle paginado. La prueba de navegador comprueba descargas reales y carga diferida. [Calendario](../client/src/components/admin/CalendarView.tsx) · [Navegador](../tests/browser/operations.spec.ts)

## 5. Backend, contratos y tiempo real

| Ruta | Función |
| --- | --- |
| server-go/cmd/logmaster | Arranque, check, migración, semilla ficticia, mantenimiento y respaldo. |
| server-go/internal/httpapi | Router Chi, middleware, autorización, validación, DTO, operaciones, transacciones y SSE. |
| server-go/internal/config | Entorno, conexión PostgreSQL, límites y guardas de laboratorio. |
| server-go/internal/security e internal/search | Contraseñas, formatos criptográficos, identidad y búsqueda HMAC. |
| server-go/internal/backup | Archivos cifrados, metadatos, verificación, rotación y restauración. |
| server-go/db e internal/store | Goose, preparación de datos, SQL de origen y bindings generados por sqlc. |
| server-go/contracts | Inventario y fixtures ficticios del esquema y criptografía anteriores. |
| server-go/cmd/lab | Generación y medición de carga con guardas de destino ficticio. |

serve carga configuración, conecta a PostgreSQL y comprueba versión y preparación de índices antes de escuchar. La migración es explícita. El proceso inicia el planificador de retención cuando se habilita, cancela SSE al apagarse y espera el cierre de tareas. La API usa un pool pgx de hasta 10 conexiones. [Entrada](../server-go/cmd/logmaster/main.go) · [Pool y router](../server-go/internal/httpapi/app.go#L90)

### Contrato HTTP

Prefijo /api/v1. Los éxitos JSON usan success y data. Los fallos incluyen success: false y error.code/error.message. Las listas incluyen paginación según ruta. Fotos, CSV y SSE tienen formatos propios. Códigos habituales: 400 validación, 401 sesión/credencial, 403 permiso/restricción, 404 recurso, 409 conflicto, 413 tamaño, 429 límite y 503 indisponibilidad de la base.

| Familia | Rutas | Alcance |
| --- | ---: | --- |
| auth | 7 | Login, refresh, recuperación, reset, logout, sesión y cambio de contraseña. |
| visits | 16 | Registro, transiciones y alias, listas, calendario, exportación e historial por visita. |
| visitors | 8 | Empresas, consulta, detalle, edición, verificación, historial y fotos. |
| privacy | 7 | Solicitudes, estados, acceso, rectificación, cancelación y oposición. |
| audit | 6 | Actividad, estadísticas, configuración, filtros y CSV. |
| superadmin | 6 | Cuentas, reset administrativo y auditoría root. |
| reports | 4 | Estadística, mensual, comparativo y alertas. |
| backups | 3 | Listado, creación controlada y restauración restringida. |
| events | 1 | SSE de visitas autenticado. |
| health | 1 | Comprobación de PostgreSQL. |

El fixture suma 59 rutas, 53 protegidas por middleware y 6 sin esa marca. Logout comprueba las credenciales dentro del handler para revocar la sesión. Los campos source del fixture pueden apuntar al servidor retirado. El inventario detallado está en [API](API.md), [contrato de rutas](../server-go/contracts/routes.json) y [prueba de paridad](../server-go/internal/httpapi/app_test.go#L72).

### Consultas y eventos

Los filtros y el orden permitido se aplican en SQL antes de paginar. La búsqueda general exige al menos tres caracteres normalizados. La cédula tiene consulta directa. Exportar cuenta y lee en una transacción de solo lectura REPEATABLE READ, aplica el límite de formato y omite binarios. Los reportes agrupan en PostgreSQL por día local, motivo y estado, y Go arma las series. Las canceladas quedan fuera de las métricas de admisión y duración. Calendario admite hasta 62 días por rango. [Consultas](../server-go/internal/httpapi/queries.go) · [Reportes](../server-go/internal/httpapi/reports.go) · [Calendario](../server-go/internal/httpapi/calendar.go)

El SSE revalida usuario y sesión durante la conexión. El aviso comunica un cambio y el cliente vuelve a consultar. Suscriptores y contadores de límite residen en memoria del proceso. Si una refactorización introduce múltiples réplicas, habrá que revisar cómo se distribuyen eventos y cuotas. [SSE](../server-go/internal/httpapi/events.go) · [Límites](../server-go/internal/httpapi/app.go#L173)


## 6. Base de datos, migraciones y compatibilidad

### Modelo y relaciones

| Tabla o grupo | Función y relación |
| --- | --- |
| Users | Cuentas, rol, bloqueo, cambio obligatorio, versión de sesión y recuperación. Actor de las operaciones de auditoría y privacidad. |
| Visitors | Perfil, identificador protegido y datos de contacto, estado de bloqueo y anonimización, referencias de imágenes y binarios. |
| Visits | Estado, horarios, consentimiento, persona anfitriona, departamento, vehículo y datos de operación. visitor_id referencia a Visitors y puede quedar nulo. visitor_cedula enlaza lógicamente con la identidad protegida o anónima. |
| IntermittentLogs | Intervalos de salida temporal y reingreso con responsables. La referencia a Visits tiene borrado en cascada. |
| VisitorEditHistories | Historial de cambios, actor y visita opcional. Los vínculos de identidad/historial deben preservarse en las operaciones que los actualizan. |
| ActivityLogs | Bitácora de acciones, actor, entidad, resultado y datos para consulta y exportación. |
| ArcoRequests | Solicitudes y resolución, con vínculo lógico por identidad del titular. Puede conservar referencia anónima. |
| Departments y VisitPurposes | Catálogos del esquema heredado. El contrato de visitas también usa campos textuales. |
| VisitorSearchTokens | Trigramas protegidos por perfil. La referencia a Visitors se borra en cascada. |
| SearchIndexState e IdentityIndexState | Preparación, progreso según índice y huella de clave. |
| SequelizeMeta y goose_db_version | Metadatos de compatibilidad histórica y registro efectivo de migraciones Goose. |

El SQL de la revisión usa TIMESTAMPTZ. La conexión establece UTC y las consultas convierten los límites de día a America/Caracas. Se conservan claves, referencias lógicas, índices parciales y las distinciones entre valores nulos y anonimizados. [Esquema histórico](../server-go/db/schema.sql) · [SQL fuente](../server-go/db/queries.sql) · [Consultas Go](../server-go/internal/httpapi/queries.go)

### Versión y evolución

| Versión | Cambio |
| --- | --- |
| 00001 | Línea base compatible con el esquema anterior. |
| 00002 | Consentimiento separado, propósito TEXT y reglas de visitas e intervalos abiertos. |
| 00003 | Tabla y estado del índice de trigramas protegidos, más índice temporal de visitas. |
| 00004 | Índices de estado y fecha para consultas. |
| 00005 | Estado de la identidad protegida. La conversión de referencias se prepara en Go. |
| 00006 | Estado cancelled y motivo de cancelación de visita. |

La versión esperada se deriva de las migraciones incorporadas al binario. db.Check exige versión vigente e índices de identidad y búsqueda preparados con las huellas correspondientes a la clave. schema.sql es un insumo de compatibilidad. sqlc combina el esquema y las migraciones declaradas en sqlc.yaml para generar internal/store. Parte del SQL especializado reside en los handlers. Los cambios de SQL generado parten de sus fuentes, se regeneran y se comparan en CI. [Migraciones](../server-go/db/migrations) · [Comprobación y adopción](../server-go/db/migrations.go) · [sqlc](../server-go/sqlc.yaml)

La preparación explícita ejecuta Goose, cifra valores históricos pendientes, reconstruye vínculos de identidad y reconstruye búsqueda. La adopción registra la línea base sobre una copia solo después de validar el contrato anterior. Preflight comprueba descifrado, relaciones y visitas abiertas duplicadas. La reconstrucción de búsqueda guarda progreso por lotes. Los perfiles, las visitas y ARCO deben conservar vínculos consistentes durante la conversión. [Preflight](../server-go/db/preflight.go) · [Identidad](../server-go/db/identity.go) · [Búsqueda](../server-go/db/search.go)

### Cuentas y transacciones

| Cuenta de laboratorio | Alcance |
| --- | --- |
| logmaster_pilot | Propiedad y mantenimiento de la base piloto. Aprueba y aplica migraciones, permisos y operaciones explícitas. |
| logmaster_runtime | API. Lectura y escritura sobre datos y uso de secuencias, con privilegios limitados. |
| logmaster_backup | Copias administradas. Lectura de tablas y secuencias. |
| logmaster_restore_test | Destino independiente para ensayos de restauración. |

La inicialización de roles corre sobre un volumen nuevo. Con volúmenes existentes, ops roles valida y concede privilegios de forma explícita. Runtime y respaldo se definen sin superusuario ni membresías imprevistas. Los bloqueos de fila y las transacciones agrupan operaciones de negocio con auditoría. Restauración usa la transacción de PostgreSQL descrita en la sección 10. [Roles iniciales](../deploy/postgres/init-roles.sh) · [Concesiones CLI](../server-go/cmd/logmaster/roles.go)

## 7. Seguridad, datos personales y conservación

| Control | Comportamiento de referencia |
| --- | --- |
| Sesión | Next usa cookies seguras por host. Go consulta la cuenta actual y su tokenVersion, verifica rol y cambio obligatorio y revoca sesiones tras cambios de contraseña, logout y restauración. |
| Duración | Acceso predeterminado de 15 minutos y renovación predeterminada de 7 días. La sesión tiene máximo absoluto de siete días desde el inicio. Refresh usa secreto independiente. |
| Contraseña | Mínimo 12 caracteres y máximo 72 bytes UTF-8 para bcrypt, con mayúscula, minúscula, número y símbolo. Se verifican formatos históricos. Los cambios de perfil sensibles exigen contraseña adicional. |
| Recuperación | Respuesta genérica, token aleatorio con hash, vencimiento de 15 minutos y consumo único. La actualización de cuenta invalida un reset pendiente. El correo del laboratorio se queda en Mailpit. |
| Validación HTTP | JSON estricto, rechazo de campos desconocidos y cuerpos múltiples, máximo total de 5 MiB. Las imágenes válidas se decodifican y controlan por formato, 16 millones de píxeles y tamaño binario. El JSON con base64 debe caber completo. |
| Origen, IP y privacidad de logs | BFF valida origen de escrituras. Nginx sustituye encabezados de IP y correlación. Go confía en el proxy configurado y aplica cuotas generales, de autenticación y por cuenta. Los logs del proxy redactan rutas sensibles y excluyen query strings. |
| Fotografías | Endpoints autenticados, respuesta privada sin caché, URLs Blob temporales en el navegador. Los binarios se guardan en BYTEA. |
| Identidad y búsqueda | Cédula normalizada vinculada por HMAC-SHA-256. Trigramas HMAC de búsqueda con contexto de clave separado, coincidencia comprobada al descifrar candidatos. Se conserva distinción de acentos. |
| Cifrado y custodia | AES-256-GCM en campos seleccionados del perfil e historial, con formato histórico compatible. Secretos de sesión, clave de datos y contraseña de edición se custodian fuera del repo. |

El cifrado de campos tiene alcance definido. Cédula, nombres, cargo, contacto y observaciones del perfil se cifran. Empresa, imágenes BYTEA y determinados campos libres de visitas y ARCO se almacenan sin cifrado individual en estas escrituras. Los trigramas HMAC revelan igualdad y frecuencia entre registros. Los controles de acceso, custodia de claves y protección de almacenamiento siguen siendo necesarios. [Criptografía](../server-go/internal/security/crypto.go) · [Perfil](../server-go/internal/httpapi/visitors.go) · [Búsqueda](../server-go/internal/search/tokens.go)

La cancelación ARCO bloquea perfiles con visitas abiertas. Con identidad verificada, reemplaza las referencias por un identificador anónimo y limpia datos personales, fotos, tokens de búsqueda y valores de historial relacionados en la misma transacción. Mantiene la trazabilidad histórica anonimizada y permite registrar después la cédula como perfil independiente. Una copia anterior puede contener datos que luego se cancelaron. Se revisa ese caso al planificar una restauración. [Cancelación](../server-go/internal/httpapi/privacy.go#L282) · [Prueba de privacidad](../server-go/internal/httpapi/privacy_test.go)

La retención automática permanece desactivada en el laboratorio. Habilitada, se programa a las 02:00 de Caracas y usa un bloqueo asesor. Sus reglas abarcan actividad antigua, visitas completadas, solicitudes resueltas y perfiles elegibles sin referencias vigentes. Las visitas canceladas y la purga directa del historial de ediciones quedan fuera de esa lógica actual. [Retención](../server-go/internal/httpapi/retention.go) · [Seguridad](SECURITY.md)

## 8. Contenedores, red y configuración

| Servicio | Imagen o entrada | Alcance |
| --- | --- | --- |
| postgres | PostgreSQL 16 | Base piloto, puerto interno 5432, volumen postgres y healthcheck pg_isready. |
| api | Binario Go en imagen con utilidades PostgreSQL 16 | Cuenta runtime, comprueba base y esquema con logmaster check. Sin publicación base al host. |
| frontend | Next.js standalone sobre Node 22 | SSR y BFF, puerto interno 3000 y dirección fija del proxy de confianza. Depende de API saludable. |
| web | Nginx 1.28 | TLS y proxy hacia Next. Publicación por defecto 127.0.0.1:8443. Depende de frontend saludable. |
| mailpit | Mailpit 1.31.4 | Perfil test. Captura SMTP en red Compose, con interfaz de diagnóstico en el override de pruebas. |
| ops | Misma imagen Go, configuración de mantenimiento | Perfil ops. Migración, permisos, revisión y restauración. |
| backup | Misma imagen Go, cuenta de solo lectura | Perfil ops. Ejecuta backup-daily y conserva metadatos/contraseñas en volúmenes separados. |
| postgres-restore | PostgreSQL 16 | Perfil ops. Base desechable y volumen restore separado. |
| lab | Binario Go de carga | Override load. Genera datos ficticios y ejercita API o la cadena completa según escenario. |

La red bridge backend usa una subred configurable. Next tiene IP fija por LOGMASTER_PROXY_IP. Esa IP debe coincidir con la lista de confianza de Go. Los puertos diagnósticos de PostgreSQL (55432), API (3000) y Mailpit (8025) se publican solo en loopback al usar compose.test.yaml. La configuración base publica HTTPS. El proxy permite TLS 1.2 y 1.3, limita el cuerpo a 5 MiB y desactiva buffering de SSE. Nginx, Next y Go usan usuarios dedicados, raíz de contenedor de solo lectura, tmpfs, capacidades retiradas y no-new-privileges. La rotación de logs Compose mantiene hasta tres archivos de 10 MB por servicio configurado. [Compose](../compose.yaml) · [Override de pruebas](../deploy/compose.test.yaml) · [Nginx global](../deploy/nginx.conf) · [Sitio Nginx](../client/nginx.conf)

Los volúmenes postgres, restore, backups, passwords y work separan los datos, las copias, la custodia de contraseñas y temporales. La API monta backups. ops y backup también montan passwords y work. Los secretos se montan desde archivos preparados en LOGMASTER_CONFIG_DIR. El perfil test permite SMTP local con Mailpit. Producción exige un modo TLS SMTP compatible y un origen HTTPS configurado.

| Configuración | Variables o archivos |
| --- | --- |
| Compose y red | LOGMASTER_CONFIG_DIR, COMPOSE_PROJECT_NAME, LOGMASTER_BIND, LOGMASTER_HTTPS_PORT, LOGMASTER_PROXY_IP, LOGMASTER_SUBNET y LOGMASTER_TAG. |
| Web y API | APP_URL, GO_API_URL (Next), CORS_ORIGINS, TRUSTED_PROXY_CIDRS, NODE_ENV, HTTP_HOST y PORT. |
| Base | DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD y DB_SSL. Con DB_SSL se verifica certificado y hostname. |
| Sesión y protección de datos | JWT_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRATION, JWT_REFRESH_EXPIRATION, ENCRYPTION_KEY (alias PII_ENCRYPTION_KEY) y EDIT_PASSWORD. |
| Correo y conservación | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_TLS_MODE, EMAIL_FROM y RETENTION_ENABLED. DATA_RETENTION_DAYS (60) y AUDIT_LOG_RETENTION_DAYS (365) son valores predeterminados del código cuando se habilita la retención. |
| Mantenimiento | DOTENV_CONFIG_PATH, LOGMASTER_STAGING_ENV, BACKUP_PATH, BACKUP_PASSWORD, BACKUP_PASSWORD_PATH y archivos de secretos por rol. |

Leer [configuración Go](../server-go/internal/config/config.go), [configuración de Next](../client/src/server/auth-cookies.ts), [script de preparación](../deploy/scripts/configure.sh), [Compose de administración](../deploy/compose.admin.yaml) y [operaciones](OPERATIONS.md) al cambiar parámetros. Los nombres anteriores describen el contrato de configuración. Los valores privados se gestionan en el entorno de ejecución.


## 9. Reproducir el laboratorio

Usar Linux con Docker Engine y Compose V2, Git, OpenSSL, Node 22 y pnpm 12.4.2. Reservar el puerto 8443 en loopback y una subred sin conflicto. Ejecutar desde la raíz del checkout. Usar un proyecto Compose y un directorio de configuración nuevos para separar el ensayo de instalaciones anteriores.

    git rev-parse HEAD
    git status --short
    export COMPOSE_PROJECT_NAME="logmaster-baseline-$(date -u +%Y%m%d%H%M%S)"
    export LOGMASTER_CONFIG_DIR="$(mktemp -d /tmp/logmaster-config.XXXXXX)"
    pnpm install --frozen-lockfile
    pnpm local:setup
    pnpm local:prepare
    pnpm local:start
    docker compose ps
    curl --fail --cacert "$LOGMASTER_CONFIG_DIR/tls.pem" \
      https://localhost:8443/api/v1/health

local:setup prepara configuración ficticia, secretos independientes y certificado temporal. El script se detiene si ya existe app.env. local:prepare construye, inicia PostgreSQL y Mailpit, migra, aplica roles y carga la semilla. local:start inicia la aplicación. Abrir https://localhost:8443. La cuenta inicial del laboratorio requiere cambio de contraseña. Consultar SEED_ROOT_PASSWORD en el archivo privado LOGMASTER_CONFIG_DIR/app.env y conservarlo fuera de la evidencia.

Para repetir smoke y navegador, seguir la secuencia de [validación Linux](LINUX_VALIDATION.md). smoke inicializa su propio escenario aislado y comprueba persistencia, copia y restauración. Usar configuración nueva para ese recorrido. El override de diagnóstico expone servicios de ensayo en loopback. Playwright requiere Chromium y las dependencias Linux indicadas en la guía.

    pnpm exec playwright install --with-deps chromium
    pnpm exec playwright test tests/browser/operations.spec.ts

Detener conservando volúmenes y datos ficticios con docker compose --profile test --profile ops down. Identificar por nombre el proyecto y guardar evidencia antes de cualquier limpieza de volúmenes. Para diagnosticar un arranque, comprobar en orden salud de PostgreSQL, logmaster check, /health de Next y HTTPS. Revisar docker compose ps y logs de los servicios pertinentes evitando divulgar datos y secretos.

Fuentes: [inicio rápido](QUICKSTART.md) · [scripts pnpm](../package.json) · [smoke](../deploy/scripts/smoke.sh) · [validación Linux](LINUX_VALIDATION.md).

## 10. Mantenimiento, respaldos y restauración

### Operaciones de mantenimiento

| Operación | Uso |
| --- | --- |
| check | Comprueba versión, conectividad y preparación. Forma parte del arranque y del healthcheck de la API. |
| migrate, seed | Preparan un laboratorio autorizado. La semilla se restringe a bases ficticias. |
| ops preflight, adopt, migrate | Comprueban, adoptan y actualizan el esquema en la secuencia apropiada. Aplicar requiere destino confirmado y ausencia de otros clientes. |
| ops roles, bootstrap-root | Conceden permisos o crean la cuenta inicial con contraseña suministrada por archivo privado. |
| backup-daily, backup-status, backup-monitor | Crean copia administrada, muestran estado de recuperación o consultan tamaño de la base. |
| rehearse, ops restore | Ensayo de restauración y restauración operativa validada en staging. |

El CLI de operaciones simula por defecto. Las mutaciones exigen --apply y --confirm-target con host:puerto/base exactos. La adopción y las migraciones se ensayan sobre una copia, con conteos, claves y copia previa registrados. Las actualizaciones de imagen y de esquema tienen reversión distinta. Usar una imagen anterior solo cuando admite el esquema presente. Si cambian los datos o el esquema de forma incompatible, recuperar en staging con el respaldo y la clave de la revisión correspondiente. [Operaciones](OPERATIONS.md) · [CLI](../server-go/cmd/logmaster/operations.go)

### Copias y ensayo

El respaldo usa pg_dump en formato custom, metadatos y verificación del archivo. El formato v2 cifra por flujo con age y contraseña aleatoria por copia. Se conserva lectura del formato scrypt/gzip/AES-GCM anterior. Los límites actuales son 20 GiB de archivo y 80 GiB de SQL renderizado para el formato nuevo, 500 MiB para el legado y 1 MiB de manifiesto. Son límites de implementación. El flujo de 2 GiB aún requiere evidencia de laboratorio para esta revisión.

Las tareas serializan el acceso, validan una copia nueva antes de podar y conservan hasta 30 pares automáticos completos y exitosos. Se preservan los manuales e incompletos para revisión. La contraseña se guarda cifrada por separado. Se requiere espacio para el archivo descifrado y SQL temporal. Los comandos no deben exponer contraseñas en argumentos ni artefactos. [Flujo](../server-go/internal/backup/stream.go) · [Gestión](../server-go/internal/backup/managed.go)

    pnpm backup
    docker compose run --rm ops backup-status
    docker compose run --rm ops backup-monitor

systemd define copia diaria a las 01:00 y ensayo el domingo a las 03:00, zona Caracas. Usa PostgreSQL de restauración independiente. Supervisión disponible mediante healthchecks, estado de copia, espacio, logs y journal. RPO de 24 horas (pérdida de datos tolerada) y RTO de 2 horas (tiempo objetivo de recuperación) son metas de laboratorio. [Timers y servicios](../deploy/systemd) · [Operaciones](OPERATIONS.md)

### Recuperación controlada

La restauración operativa prepara una copia desechable, valida sus datos y versión, ejecuta adopción/migración si corresponde y vuelve a generar el archivo antes de aplicar al destino. Con la aplicación detenida, la aplicación final reemplaza el esquema public, repone permisos, verifica root, eleva la versión de las sesiones y escribe auditoría en una transacción. Un fallo revierte el destino y el staging puede descartarse. La restauración por HTTP se restringe a logmaster_restore_test. En producción, la creación de copia por HTTP se deriva a mantenimiento.

Después de restaurar, comprobar logmaster check, acceso nuevo, rechazo de sesiones anteriores, evento BACKUP_RESTORE_COMPLETED, relaciones, conteos y consultas. Revisar cancelaciones posteriores a la fecha de la copia. El procedimiento y las condiciones de parada están en [Operaciones](OPERATIONS.md). Implementación en [CLI](../server-go/cmd/logmaster/operations.go), [respaldo](../server-go/internal/backup/backup.go) y [guardas HTTP](../server-go/internal/httpapi/backups.go).

## 11. Pruebas, evidencia y límites

| Evidencia | Estado y alcance |
| --- | --- |
| CI del corte b760bc8 | Éxito en los jobs backend-go y client. Instalación congelada, tipos, lint, build, Vitest y auditoría de dependencias. Go con PostgreSQL/Mailpit ficticios, detector de carreras, vet, bindings y govulncheck. [Run 41173114215](https://github.com/Suggus1899/Visitors/actions/runs/41173114215) |
| Containers del corte b760bc8 | Éxito en smoke y small-load. Instalación, HTTPS, persistencia, adopción, restauración, timers, Chromium y carga pequeña de API. [Run 41173114219](https://github.com/Suggus1899/Visitors/actions/runs/41173114219) |
| Evidencia detallada del cambio previo | 171 pruebas de cliente en 30 archivos registradas para 79952e4. El commit b760bc8 posterior actualiza documentación. Mantener la atribución por commit. [Registro](OPERATIONAL_VALIDATION.md) |
| Carga pequeña | 100 perfiles y 1.000 visitas ficticias sobre la API. Es una regresión corta. |
| Carga completa del corte | Pendiente de una ejecución aprobada. Incluye flujo de 2 GiB, 100.000 perfiles, 1.000.000 de visitas, 5.000 abiertas, 50 sesiones vía HTTPS/Nginx/Next/BFF, cinco navegadores, respaldo y restauración. |
| Verificación de este documento | Inspección estática de Git, código, configuración, contratos y resultados registrados. Docker y Podman no se localizaron en el PATH de este equipo. Los enlaces y la edición PDF se comprueban de forma independiente. |

El workflow CI se ejecuta en pushes de main y codex/**, pull requests y ejecución manual. Containers se ejecuta al publicar en main o manualmente. La futura rama puede validar CI y ejecutar Containers manualmente sobre su revisión. Full laboratory load es manual y requiere runner Linux x64 con etiqueta logmaster-load, 4 vCPU, 16 GiB de RAM y 512 GiB libres en RUNNER_TEMP y Docker. Usa dos minutos de calentamiento y quince de medición. Los criterios son p95 habitual ≤ 1 s, búsqueda ≤ 2 s, errores inesperados < 1 % y cero sesiones perdidas. Conservar hardware, métricas, resultados de navegador y recuperación asociados al commit. La disponibilidad actual del runner no se pudo confirmar. [CI](../.github/workflows/ci.yml) · [Containers](../.github/workflows/containers.yml) · [Carga](../.github/workflows/load.yml) · [Guía Linux](LINUX_VALIDATION.md)

| Superficie | Evidencia automatizada |
| --- | --- |
| API y datos | Go cubre inventario, roles, autenticación, revocación, ciclo de visita, concurrencia, privacidad, migración, búsqueda y restauración. La integración PostgreSQL requiere el entorno ficticio preparado y LOGMASTER_DB_TEST=true. |
| Cliente | Vitest y Testing Library cubren sesión/BFF, formulario, fotos, estado, reportes y utilidades. Queda sin prueba directa la deduplicación de sesión en un mismo render SSR. |
| Navegador | Cuatro recorridos de operación prueban cámara simulada, consentimiento, ciclo, fotografías, reset Mailpit, roles, SSE y descargas de PDF/XLSX. El recorrido adicional de carga se habilita de forma explícita. |
| Riesgo y capacidad | Las auditorías de dependencias reflejan los avisos disponibles al ejecutarse. Métricas históricas y cámara simulada tienen alcance limitado al entorno registrado. |

Fuentes: [pruebas Go](../server-go/internal/httpapi) · [pruebas del cliente](../client/src/__tests__) · [recorridos](../tests/browser/operations.spec.ts) · [carga navegador](../tests/browser/load.spec.ts).

## 12. Punto de partida para la refactorización

La futura rama debe partir de un commit registrado que incluya esta documentación. El código de referencia es b760bc8. Si hay cambios funcionales entre ese commit y el punto de partida, registrar su delta antes de comparar resultados. Mantener cambios de estructura, comportamiento y esquema en pasos identificables para facilitar revisión y reversión.

| Área | Invariante y comprobación |
| --- | --- |
| Contrato HTTP | Comparar métodos, paths, formatos, paginación, estados y errores contra el router y su fixture. Preservar alias mientras haya consumidores. |
| Sesión y roles | Comprobar SSR, cookie, origen, renovación concurrente, cambio obligatorio, caducidad, revocación, limpieza del cliente y permisos de Go. |
| Visitas | Ensayar check-in y consentimiento individual, admisión, cancelación de espera, salida temporal, reingreso, salida definitiva y escrituras concurrentes. |
| Datos | Ensayar base vacía y adopción de copia anterior con claves ficticias. Confirmar constraints, huellas, conteos, integridad, anonimización y consulta directa. Regenerar bindings si se cambia SQL. |
| Privacidad | Verificar edición con contraseña, perfiles bloqueados, fotos privadas, solicitudes ARCO, cancelación de datos y alcance de retención. |
| Consultas | Comparar paginación y orden global, filtros, fechas Caracas, topes, exportación y cancelación de descarga. Medir escenarios representativos antes de atribuir mejoras. |
| Infraestructura | Repetir arranque, salud, TLS, carga SSE, persistencia tras recreación, segregación de roles y ausencia de secretos en logs/artefactos. |
| Recuperación | Ensayar respaldo, restauración y fallo controlado en base ficticia. Comprobar que se mantienen permisos y auditoría y que se invalidan sesiones previas. |

Los puntos con mayor impacto cruzado son los handlers que mezclan HTTP, reglas y SQL, la coherencia entre esquema migrado y sqlc, las fronteras BFF/sesión, y las operaciones de restauración. Si se reorganizan, migrar un flujo a la vez y usar sus pruebas existentes como comparación. Conservar las métricas del mismo conjunto de datos y entorno cuando se evalúe rendimiento. La aceptación de un cambio de contrato o de datos requiere una decisión explícita en la rama futura.

## 13. Trazabilidad de la revisión

La inspección usó Codebase Memory para localizar símbolos y límites. El servidor MCP estuvo disponible y Visitors figura listo en main con la revisión del corte. La cobertura informó metadatos cambiados, SQL parcial y rutas de despliegue excluidas o con análisis incompleto. Se corroboraron esos archivos en fuente y Git. Graphify estuvo disponible y su grafo coincide con el commit, con 2.285 nodos y 5.153 relaciones (88 % extraídas, 12 % inferidas). Sirvió para relacionar guías y código. La fuente directa prevalece cuando una relación está incompleta o un documento es histórico.

Esta línea base registra la configuración y evidencia del laboratorio. Quedan pendientes la medición completa sobre el corte y la aceptación empresarial, con hardware, SMTP externo, política de conservación y operadores propios.

## Anexo. Inventario de rutas HTTP

Rutas relativas a /api/v1 en Go. La columna indica el requisito de sesión, además de los permisos por operación de la sección 3. Next.js añade el contrato de cookies, origen y transporte descrito en la sección 4.

| Método | Ruta relativa | Acceso |
| --- | --- | --- |
| GET | /audit/actions | Sesión |
| GET | /audit/config | Sesión |
| GET | /audit/export | Sesión |
| GET | /audit/logs | Sesión |
| GET | /audit/stats | Sesión |
| GET | /audit/users | Sesión |
| POST | /auth/change-password | Sesión |
| POST | /auth/forgot-password | Pública |
| POST | /auth/login | Pública |
| POST | /auth/logout | Credencial en el handler |
| POST | /auth/refresh | Pública |
| POST | /auth/reset-password | Pública |
| GET | /auth/session | Sesión |
| GET | /backups | Sesión |
| POST | /backups | Sesión |
| POST | /backups/:filename/restore | Sesión |
| GET | /events/visits | Sesión |
| GET | /health | Pública |
| GET | /privacy/arco-requests | Sesión |
| POST | /privacy/arco-requests | Sesión |
| PATCH | /privacy/arco-requests/:id/status | Sesión |
| DELETE | /privacy/subjects/:cedula | Sesión |
| GET | /privacy/subjects/:cedula | Sesión |
| PATCH | /privacy/subjects/:cedula | Sesión |
| POST | /privacy/subjects/:cedula/opposition | Sesión |
| GET | /reports/alerts | Sesión |
| GET | /reports/comparison | Sesión |
| GET | /reports/stats | Sesión |
| GET | /reports/stats/monthly | Sesión |
| GET | /superadmin/audit-logs | Sesión |
| GET | /superadmin/users | Sesión |
| POST | /superadmin/users | Sesión |
| DELETE | /superadmin/users/:id | Sesión |
| PUT | /superadmin/users/:id | Sesión |
| POST | /superadmin/users/:id/reset-password | Sesión |
| GET | /visitors | Sesión |
| GET | /visitors/:cedula | Sesión |
| PATCH | /visitors/:cedula | Sesión |
| GET | /visitors/:cedula/edit-history | Sesión |
| GET | /visitors/:cedula/id-photo | Sesión |
| GET | /visitors/:cedula/photo | Sesión |
| GET | /visitors/companies | Sesión |
| POST | /visitors/verify-edit-password | Sesión |
| GET | /visits | Sesión |
| POST | /visits/:id/admit | Sesión |
| POST | /visits/:id/cancel | Sesión |
| POST | /visits/:id/checkout | Sesión |
| POST | /visits/:id/intermittent | Sesión |
| POST | /visits/:id/intermittent-exit | Sesión |
| POST | /visits/:id/intermittent-reentry | Sesión |
| POST | /visits/:id/reactivate | Sesión |
| GET | /visits/:visitId/edit-history | Sesión |
| GET | /visits/active | Sesión |
| GET | /visits/calendar | Sesión |
| GET | /visits/cancelled | Sesión |
| POST | /visits/checkin | Sesión |
| GET | /visits/export | Sesión |
| GET | /visits/intermittent | Sesión |
| GET | /visits/waiting | Sesión |

Origen del corte: [inventario versionado](../server-go/contracts/routes.json).
