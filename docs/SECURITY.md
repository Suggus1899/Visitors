# Seguridad de LogMaster con Go

El backend vigente valida las sesiones en PostgreSQL mediante `tokenVersion`. La revocación de contraseñas y el estado de cambio obligatorio sobreviven al reinicio; la renovación utiliza un secreto independiente. La política de contraseña exige 12 caracteres, mayúscula, minúscula, número y símbolo, con máximo 72 bytes UTF-8 para nuevas contraseñas bcrypt. Se conservan verificaciones de hashes históricos.

| Operación | Autorización |
|---|---|
| Consultar visitantes y visitas; fotografías | Sesión vigente |
| Editar perfil, fotografías y rectificar | Operador, admin o root + contraseña adicional en cada guardado |
| Bloquear/desbloquear | Admin o root + contraseña adicional |
| Cancelar y administrar respaldos | Admin o root |
| Administrar cuentas y restablecer a otros usuarios | Root |
| Auditoría y solicitudes ARCO administrativas | Admin, root o auditor; escritura según la operación |
| Operaciones de escritura con auditor o demo | Rechazadas |

La comprobación del rol y del cambio obligatorio se aplica después de autenticar. El SSE usa Authorization y verifica de nuevo el usuario y la expiración; no utiliza tokens en URL. El cliente comparte la renovación concurrente y evita que una respuesta tardía restablezca una sesión cerrada.

Los datos personales cifrados conservan AES-256-GCM y el formato Node `ENC:ciphertext:iv:tag`. La cancelación elimina los datos identificativos, las fotos y los valores personales del historial, mantiene eventos anonimizados y rechaza perfiles con visitas abiertas. Los respaldos históricos pueden contener valores anteriores; la cancelación no los reescribe.

La configuración exige base y credenciales explícitas, una clave AES hexadecimal de 32 bytes y JWT de al menos 32 bytes. PostgreSQL con SSL verifica certificado y nombre del servidor; no se permite `InsecureSkipVerify`. La IP procede del socket; `X-Forwarded-For` solo se acepta a través de `TRUSTED_PROXY_CIDRS` validado explícitamente. El límite general predeterminado es 100 solicitudes por minuto e intentos de autenticación 20 por 15 minutos; el bloqueo de cuenta es de 5 intentos por 15 minutos.

JSON rechaza campos desconocidos, cuerpos múltiples y cargas de más de 5 MB. Las imágenes se validan por formato y decodificación, con límite de dimensiones. Se incluyen cabeceras privadas, CORS explícito, protección de frames y contra detección de tipo. Las consultas tienen tiempo máximo y el cierre cancela SSE y espera las tareas activas.

Los respaldos requieren nombre contenido, metadatos y contraseña de restauración; el formato conserva scrypt, gzip y AES-GCM. Solo se permite restaurar en `logmaster_restore_test`. `pg_restore` prepara el SQL completo en un archivo temporal privado y `psql --single-transaction` reemplaza el esquema y los datos de forma atómica. Después se incrementan las versiones de sesión por encima de las existentes y se registra el cierre de la operación en otra transacción. Si esa última fase falla, debe revisarse la base de ensayo antes de utilizarla. No se usan redirecciones de PowerShell ni comandos construidos mediante shell.

La CI ejecuta pruebas reales de autorización, transacciones, anonimización y correo, así como `go test -race`, `go vet` y `govulncheck`. El análisis de vulnerabilidades conocidas no demuestra por sí solo ausencia de vulnerabilidades. La configuración SMTP externa y la seguridad del despliegue real quedan para una validación institucional posterior.
