# Seguridad de LogMaster con Go

El backend vigente valida las sesiones en PostgreSQL mediante `tokenVersion`. La revocación de contraseñas y el estado de cambio obligatorio sobreviven al reinicio; la renovación utiliza un secreto independiente. La política de contraseña exige al menos 12 caracteres, mayúscula, minúscula, número y símbolo, con máximo 72 bytes UTF-8 para nuevas contraseñas bcrypt. Se conservan verificaciones de hashes históricos.

| Operación | Autorización |
|---|---|
| Consultar visitantes y visitas; fotografías | Sesión vigente |
| Editar perfil, fotografías y rectificar | Operador, admin o root + contraseña adicional en cada guardado |
| Bloquear/desbloquear | Admin o root + contraseña adicional |
| Cancelar y administrar respaldos | Admin o root |
| Administrar cuentas y restablecer a otros usuarios | Root |
| Auditoría y solicitudes ARCO administrativas | Admin, root o auditor; escritura según la operación |
| Operaciones de escritura con auditor o demo | Rechazadas |

La comprobación del rol y del cambio obligatorio se aplica después de autenticar. Go sigue exigiendo Authorization en el SSE y verifica de nuevo el usuario y la expiración; no utiliza tokens en URL. El navegador se conecta al BFF de Next.js con cookies HttpOnly y nunca recibe access o refresh tokens. Las solicitudes mutables al BFF validan el origen antes de reenviar la petición.

## Dependencias revisadas — 31 de octubre de 2026

El runtime del servidor usa Go 1.27.3; el cliente usa Next.js 16.4.3, React 19.3.1 y HeroUI 3.2.7. Las dependencias de desarrollo conservan Vite 7 y Vitest 4.1.12 para mantener la combinación validada por el proyecto. El lockfile fija DOMPurify 3.4.17, follow-redirects 1.16.2 y minimatch 11.0.1, versiones que contienen las correcciones publicadas para [DOMPurify](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7), [follow-redirects](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p) y [minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). Vitest 4.1.12 incorpora las correcciones de [GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) y [GHSA-qxg6-89mg-rqv8](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8).

La ejecución del 31 de octubre de `pnpm audit --audit-level moderate` y `govulncheck ./...` no reportó vulnerabilidades conocidas alcanzables. `govulncheck` sí señala un aviso a nivel de módulo para `golang.org/x/crypto/openpgp`, que no está mantenido; el código de LogMaster no importa ni invoca ese paquete. Estos resultados describen los scanners y sus bases de datos al momento de la revisión, no certifican que el software esté libre de vulnerabilidades.

Los datos personales cifrados conservan AES-256-GCM y el formato Node `ENC:ciphertext:iv:tag`. La cancelación elimina los datos identificativos, las fotos y los valores personales del historial, mantiene eventos anonimizados y rechaza perfiles con visitas abiertas. Los respaldos históricos pueden contener valores anteriores; la cancelación no los reescribe.

La configuración exige credenciales explícitas, clave AES hexadecimal de 32 bytes y JWT de al menos 32 bytes. PostgreSQL con SSL verifica certificado y hostname. Go confía únicamente en la IP fija del servicio Next.js configurada en `TRUSTED_PROXY_CIDRS`; Nginx reemplaza los encabezados recibidos del navegador y el BFF reenvía solo `X-Real-IP` como `X-Forwarded-For`. Un cliente no puede imponer su IP mediante esos encabezados. El límite general predeterminado es 100 solicitudes/minuto (laboratorio: 6.000); autenticación global 100/15 minutos e intentos por IP/cuenta 20/15 minutos. El bloqueo por cuenta conserva 5 intentos/15 minutos. Las pruebas cubren 50 cuentas desde una IP compartida.

JSON rechaza campos desconocidos, cuerpos múltiples y cargas de más de 5 MiB (5.242.880 bytes) por solicitud. Las imágenes se validan por formato y decodificación, tienen un máximo binario de 5 MiB y 16 millones de píxeles; en solicitudes JSON base64, el tamaño combinado de texto e imágenes debe caber en el límite total de 5 MiB. Se incluyen cabeceras privadas, CORS explícito, protección de frames y contra detección de tipo. Las consultas tienen tiempo máximo y el cierre cancela SSE y espera las tareas activas.

Los respaldos requieren nombre contenido, metadatos y contraseña. El formato nuevo (v2) utiliza `age` con contraseña aleatoria por copia y autenticación por flujo; el lector conserva el formato histórico scrypt/gzip/AES-GCM. La API usa un rol PostgreSQL de operación sin volumen de contraseñas; el servicio de respaldo usa un rol de solo lectura y la restauración usa mantenimiento. En producción, crear copias requiere el comando de mantenimiento y HTTP solo restaura en logmaster_restore_test. CLI operativa exige confirmación exacta y aplicación detenida: restaura/valida/actualiza staging antes de aplicar. Esquema/datos, permisos, validación de root, versiones de sesión por encima de las anteriores y auditoría comparten `psql --single-transaction`; fallos inducidos en revocación/auditoría prueban rollback completo. PostgreSQL se invoca sin shell. Copias y contraseñas cifradas se almacenan separadas y las tareas se serializan.

El índice de nombres almacena HMAC-SHA-256 de trigramas, sin nombres/fragmentos en claro, con contexto de clave exclusivo. Revela coincidencias y frecuencia de fragmentos entre perfiles; esa fuga sigue existiendo aunque no se conozca la clave. Se verifica coincidencia exacta tras descifrar candidatos. Cancelar elimina sus entradas; perder/cambiar clave requiere reconstrucción explícita compatible con los datos.

Secretos privados quedan fuera de Git y contexto Docker. La entrega usa HTTPS, pero el certificado ficticio de CI no sirve para puestos empresariales. SMTP distingue local, STARTTLS y TLS implícito; producción rechaza local y verifica certificados. Retención permanece desactivada hasta definir política institucional.

La CI ejecuta pruebas reales de autorización, transacciones, anonimización y correo, así como `go test -race`, `go vet` y `govulncheck`. El análisis de vulnerabilidades conocidas no demuestra por sí solo ausencia de vulnerabilidades. La configuración SMTP externa y la seguridad del despliegue real quedan para una validación institucional posterior.
