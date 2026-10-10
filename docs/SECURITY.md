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

La configuración exige credenciales explícitas, clave AES hexadecimal de 32 bytes y JWT de al menos 32 bytes. PostgreSQL con SSL verifica certificado y hostname. La IP procede del socket; X-Forwarded-For solo se acepta mediante TRUSTED_PROXY_CIDRS y Nginx reemplaza encabezados entrantes. El límite general predeterminado es 100 solicitudes/minuto (laboratorio: 6.000); autenticación global 100/15 minutos e intentos por IP/cuenta 20/15 minutos. El bloqueo por cuenta conserva 5 intentos/15 minutos. Las pruebas cubren 50 cuentas desde una IP compartida.

JSON rechaza campos desconocidos, cuerpos múltiples y cargas de más de 5 MB. Las imágenes se validan por formato y decodificación, con límite de dimensiones. Se incluyen cabeceras privadas, CORS explícito, protección de frames y contra detección de tipo. Las consultas tienen tiempo máximo y el cierre cancela SSE y espera las tareas activas.

Los respaldos requieren nombre contenido, metadatos y contraseña; conservan scrypt, gzip y AES-GCM. HTTP solo restaura en logmaster_restore_test. CLI operativa exige confirmación exacta y aplicación detenida: restaura/valida/actualiza staging antes de aplicar. Esquema/datos, validación de root, versiones de sesión por encima de las anteriores y auditoría comparten `psql --single-transaction`; fallos inducidos en revocación/auditoría prueban rollback completo. PostgreSQL se invoca sin shell. Copias y contraseñas cifradas se almacenan separadas y las tareas se serializan.

El índice de nombres almacena HMAC-SHA-256 de trigramas, sin nombres/fragmentos en claro, con contexto de clave exclusivo. Revela coincidencias y frecuencia de fragmentos entre perfiles; esa fuga sigue existiendo aunque no se conozca la clave. Se verifica coincidencia exacta tras descifrar candidatos. Cancelar elimina sus entradas; perder/cambiar clave requiere reconstrucción explícita compatible con los datos.

Secretos privados quedan fuera de Git y contexto Docker. La entrega usa HTTPS, pero el certificado ficticio de CI no sirve para puestos empresariales. SMTP distingue local, STARTTLS y TLS implícito; producción rechaza local y verifica certificados. Retención permanece desactivada hasta definir política institucional.

La CI ejecuta pruebas reales de autorización, transacciones, anonimización y correo, así como `go test -race`, `go vet` y `govulncheck`. El análisis de vulnerabilidades conocidas no demuestra por sí solo ausencia de vulnerabilidades. La configuración SMTP externa y la seguridad del despliegue real quedan para una validación institucional posterior.
