# LogMaster — control integral de visitantes

LogMaster registra visitantes, fotografías y consentimiento, controla espera, admisión, salida temporal, reingreso y salida definitiva, y ofrece administración, auditoría y exportaciones PDF/Excel. Es una aplicación integral para Industrias de Alimentos el Trébol.

El backend predeterminado es **Go** en `server-go/`. El cliente conserva React, TypeScript, Vite, Tailwind y los componentes shadcn/ui existentes. PostgreSQL 16 conserva las tablas y formatos criptográficos compatibles con el servidor anterior. `server/` se mantiene como referencia y posibilidad de reversión controlada durante la validación.

Al cerrar la validación, por petición del usuario, se detuvieron los servicios locales y se envió `F:\Proyectos\Visitors-local` a la Papelera. La carpeta ya no existe en esa ubicación y la aplicación de ensayo está detenida. Los comandos siguientes preparan un entorno nuevo y recrean esa carpeta; no recuperan automáticamente sus datos anteriores.

## Ejecutar en Windows

Requiere PowerShell 7, Node.js 22.12 o superior, pnpm 12.4.2 y Go. `server-go/go.mod` fija el toolchain 1.27.2; Go puede descargarlo automáticamente. La instalación inicial necesita Internet.

```powershell
pnpm install --frozen-lockfile
pnpm local:setup
pnpm local:prepare
pnpm local:start
```

Cliente: http://localhost:5173. API: http://127.0.0.1:3000/api/v1/health. Buzón ficticio: http://127.0.0.1:8025. PostgreSQL escucha exclusivamente en `127.0.0.1:55432`; Mailpit en `127.0.0.1:1025` y captura el correo sin entregarlo al exterior. Binarios, datos, correos y respaldos quedan fuera del repositorio en `../Visitors-local`.

`local:setup` conserva los archivos locales existentes y crea bases y credenciales independientes:

| Base | Uso |
|---|---|
| `logmaster_go_dev` | Desarrollo y recorrido de la interfaz Go |
| `logmaster_go_test` | Integración automática Go con datos ficticios |
| `logmaster_restore_test` | Único destino autorizado de restauración |
| `logmaster_dev`, `logmaster_test` | Entornos anteriores, conservados |

Los archivos `.env.logmaster-*.local` están ignorados por Git. El usuario inicial de una **base Go nueva** es `root`, con la contraseña del campo `SEED_ROOT_PASSWORD` de `.env.logmaster-go_dev.local`. Debe cambiarla al entrar. Una base adoptada conserva sus nombres de usuario y contraseñas; las semillas no reemplazan cuentas existentes. No publiques archivos de entorno.

`local:prepare` aplica las migraciones explícitas, protege el historial antiguo y crea únicamente las cuentas locales ausentes. El arranque normal comprueba la versión del esquema y la conexión; no modifica el esquema ni ejecuta semillas. `DOTENV_CONFIG_PATH` permite seleccionar un entorno explícito. La retención está desactivada por defecto.

## Validar

```powershell
pnpm test                  # Go sin integración + cliente
pnpm test:integration      # PostgreSQL y Mailpit locales; respaldo en base de ensayo
pnpm build                 # Compilación Go y producción React
pnpm typecheck:client
pnpm test:legacy            # Regresión del servidor TypeScript conservado
```

Para detectar condiciones de carrera se requiere CGO y un compilador C. Desde `server-go`, con las variables del entorno de integración:

```powershell
$env:DOTENV_CONFIG_PATH='../.env.logmaster-go_test.local'
$env:LOGMASTER_DB_TEST='true'
$env:LOGMASTER_RESTORE_ENV='../.env.logmaster-restore_test.local'
$env:PG_BIN_PATH='../../Visitors-local/pgsql/bin'
$env:CGO_ENABLED='1'
go test -race ./... -count=1
go vet ./...
```

Las pruebas rechazan cualquier destino distinto de `logmaster_go_test` en el puerto local independiente. La restauración exige `logmaster_restore_test`. Cada prueba elimina sus registros ficticios; no se vacían bases operativas.

## Backend y contratos

Go utiliza `net/http`, Chi, pgx y consultas generadas con sqlc; Goose ejecuta migraciones SQL completas y transaccionales. Los contratos, fixtures de interoperabilidad y baseline del esquema están en `server-go/contracts` y `server-go/db`. La CI comprueba PostgreSQL real, Mailpit, carreras, tipos, compilación, código SQL generado y vulnerabilidades alcanzables.

- Se conservan 53 rutas `/api/v1` y la respuesta general `{ success, data, error }`.
- Las fotografías y SSE exigen Bearer token en una cabecera. Las fotografías se sirven como contenido privado sin caché; el cliente usa Blob y revoca las URLs.
- Operador, admin y root pueden editar con `editPassword` en **cada guardado**. Solo admin y root bloquean, cancelan y administran respaldos; root administra cuentas. Auditor y demo no modifican datos operativos.
- Perfil, historial cifrado, visita, intervalo y auditoría se confirman juntos en las operaciones correspondientes. Un fallo de auditoría revierte las modificaciones transaccionales.
- El consentimiento permanece en columnas propias. La salida definitiva persiste su fecha; solo puede existir una visita abierta por visitante y un intervalo abierto por visita.
- Cancelar con una visita abierta devuelve `409 OPEN_VISIT_EXISTS`. La cancelación elimina fotos, datos personales y valores del historial; conserva eventos anonimizados. Un registro posterior de la misma cédula crea otro perfil.
- Cambiar/restablecer contraseñas revoca acceso y refresh con `tokenVersion` persistente. La recuperación guarda el hash del token, vence en 15 minutos y permite un uso. La contraseña nueva requiere 12 caracteres y admite hasta 72 bytes UTF-8.
- Los informes, rangos de fechas y retención usan `America/Caracas`. La búsqueda de nombres descifra perfiles para comparar, sin descargar fotos; su coste crece con el número de perfiles.
- Los respaldos son binarios cifrados, con metadatos obligatorios, verificación de integridad y rutas contenidas. Una restauración invalida las sesiones y exige entrar de nuevo.

Consulta [arquitectura](docs/ARCHITECTURE.md), [API](docs/API.md), [seguridad](docs/SECURITY.md) y el [registro de etapas y reversión](docs/BACKEND_GO_MIGRATION.md).

## Operación y límites

`pnpm backup` crea un respaldo cifrado del entorno seleccionado y muestra una sola vez su contraseña de restauración. `pnpm backup:monitor` informa el tamaño de esa base. No hay redirección de binarios mediante PowerShell ni nombre fijo de base. Configura `PG_BIN_PATH` cuando los ejecutables PostgreSQL estén fuera del PATH.

Las migraciones y semillas están restringidas al entorno local independiente en esta entrega. La restauración del ensayo puede reemplazar todos los datos de `logmaster_restore_test`; si el proceso falla después de restaurar y antes de registrar el cierre, debe revisarse esa base antes de volver a usarla. No se habilita restauración en una base operativa.

Para una adopción futura, conservar un respaldo verificado, utilizar las mismas claves criptográficas, ensayar `adopt` y `migrate` sobre una copia y comprobar el esquema antes de cambiar el proceso del servidor. No ejecutar migraciones hacia atrás para eliminar consentimiento o historial. Las bases y respaldos originales no se modificaron durante esta implementación.

El SMTP de un proveedor real y el despliegue institucional requieren configuración y validación posteriores. Los respaldos históricos pueden conservar información personal cancelada y deben revisarse antes de restaurarlos. Las guías anteriores se conservan en [docs/legacy](docs/legacy/); los comandos vigentes son los de este README.
