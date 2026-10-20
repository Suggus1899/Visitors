# Instalación, mantenimiento y recuperación

## Configuración privada y Linux

Los ensayos usan datos ficticios independientes; no modifican bases ni respaldos anteriores. Instalar Docker Engine/Compose y OpenSSL mediante el procedimiento institucional, disponer el checkout en `/opt/logmaster` y la configuración en `/opt/logmaster/config`, con directorio modo 700. Los archivos de secretos deben ser legibles por los usuarios dedicados del contenedor; el directorio padre permanece privado. No incorporarlos a Git, imágenes ni artefactos.

```sh
export LOGMASTER_CONFIG_DIR=/opt/logmaster/config
sh deploy/scripts/configure.sh
docker compose --profile test build
docker compose --profile test up -d --wait postgres mailpit
docker compose run --rm ops migrate
docker compose run --rm ops seed
docker compose --profile test up -d --wait api web
```

Este procedimiento es un laboratorio vacío, accesible en https://localhost:8443. `configure.sh` se niega a sobrescribir `app.env`; genera credenciales independientes para mantenimiento, API y respaldo, staging y certificado temporal de dos días para `localhost`, `web` y `127.0.0.1`. El inicio de un volumen PostgreSQL vacío crea los roles `logmaster_runtime` (lectura y escritura de datos), `logmaster_backup` (lectura) y `logmaster_pilot` (mantenimiento). La API no monta el volumen de contraseñas de respaldo; `ops` y `backup` sí. No crea Visitors-local ni instala Docker. El perfil test captura correo sin entregarlo al exterior. `deploy/compose.test.yaml` habilita diagnósticos exclusivamente en 127.0.0.1.

Antes de uso empresarial: sustituir `tls.pem`/`tls.key` por certificado confiable del hostname, establecer APP_URL/CORS_ORIGINS con ese origen HTTPS y NODE_ENV=production. Configurar SMTP_HOST/PORT/USER/PASSWORD/EMAIL_FROM y SMTP_TLS_MODE=starttls o implicit; local se rechaza en producción. No utilizar el perfil test ni exponer Mailpit. Ajustar LOGMASTER_BIND, puerto y firewall tras configurar red/certificado. Al modificar LOGMASTER_SUBNET o LOGMASTER_PROXY_IP, asignar esta última a la dirección fija del servicio Next.js y actualizar TRUSTED_PROXY_CIDRS con esa misma dirección; Nginx reemplaza los encabezados recibidos del navegador y Next.js reenvía solo la IP recibida como `X-Real-IP`.

Las variables Compose se guardan en `.env` privado o entorno del servicio. LOGMASTER_CONFIG_DIR debe coincidir en shell y systemd. DOTENV_CONFIG_PATH selecciona el secreto `/run/secrets/app_env`. La API solo comprueba esquema e índice al arrancar. Mantener RETENTION_ENABLED=false hasta aprobar política empresarial.

Para un volumen existente, `init-roles.sh` no vuelve a ejecutarse. Conservar un respaldo verificable y una copia privada de la configuración; detener `web`, `frontend`, `api` y los timers. Mantener el `app.env` anterior mientras se preparan `maintenance.env` (credenciales actuales de mantenimiento), `runtime.db.password` y `backup.db.password` (48 caracteres hexadecimales aleatorios cada uno) y `backup.env` (misma configuración privada, pero `DB_USER=logmaster_backup` y su contraseña). Preparar aparte el nuevo `app.env` con `DB_USER=logmaster_runtime` y su contraseña. Con la aplicación detenida y los archivos nuevos disponibles para Compose, ejecutar:

```sh
docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops roles --runtime-password-file /run/secrets/runtime_db_password --backup-password-file /run/secrets/backup_db_password
docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops roles --runtime-password-file /run/secrets/runtime_db_password --backup-password-file /run/secrets/backup_db_password --apply --confirm-target postgres:5432/logmaster_pilot
```

Solo tras comprobar los roles y permisos, sustituir `app.env` por el archivo preparado y reiniciar los servicios. La orden es idempotente y concede privilegios sobre las tablas existentes y futuras; rechaza roles con membresías heredadas inesperadas. Guardar la configuración anterior para reversión controlada y no imprimir contraseñas en consola. El CLI exige que no haya otros clientes de la base durante `--apply`.

## Base operativa nueva

Con PostgreSQL saludable y API detenida:

```sh
docker compose run --rm ops ops preflight
docker compose run --rm ops ops migrate
docker compose run --rm ops ops migrate --apply --confirm-target postgres:5432/logmaster_pilot
```

Escribir una contraseña inicial privada en `config/maintenance.password` mediante un editor, sin argumentos ni logs: al menos 12 caracteres, mayúscula, minúscula, número y símbolo; máximo 72 bytes UTF-8. Sustituir el correo de ejemplo por el responsable:

```sh
docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops bootstrap-root --root root --email responsable@example.org --password-file /run/secrets/maintenance_password
docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops bootstrap-root --root root --email responsable@example.org --password-file /run/secrets/maintenance_password --apply --confirm-target postgres:5432/logmaster_pilot
docker compose up -d --wait api web
```

No ejecutar seed en bases operativas. Root debe cambiar la contraseña al entrar. Retirar el archivo temporal tras usarlo. Custodiar claves AES/JWT/respaldo fuera de los archivos de respaldo y definir responsables; perder claves o contraseña puede impedir la recuperación.

## Adopción y migración

1. Obtener un respaldo verificado y registrar versión, conteos y claves originales. Conservar la fuente intacta.
2. Restaurar en una copia independiente y configurar app.env para ella con las mismas claves. La confirmación es DB_HOST:DB_PORT/DB_NAME reales; no copiar a ciegas el ejemplo.
3. Detener la aplicación y otros clientes de la copia. Ejecutar `ops preflight` y `ops adopt` sin aplicar: comprueban descifrado, relaciones, columnas/restricciones y visitas abiertas duplicadas. Ante incompatibilidad detenerse y resolverla sobre la copia; no borrar registros para aprobar.
4. Ejecutar `ops adopt --apply --confirm-target ...`, después `ops migrate --apply --confirm-target ...`. Se registra la baseline validada, se ejecuta SQL completo, se cifra historial anterior y se reconstruye el índice por lotes con progreso persistente. Repetir es seguro.
5. Ejecutar check, contrastar conteos y probar roles, fotos, consentimiento, transiciones, búsquedas, informes y recuperación. Respaldar/restaurar la copia y ensayar reversión antes de autorizar un cambio operativo.

`backup/main-before-go-2026-10-09` conserva el estado previo a Go. El registro histórico documenta compatibilidad y lectura cruzada Node/Go. Revertir mediante un respaldo previo sobre una copia validada, con sus claves y versión correspondiente; no utilizar migraciones descendentes que borren consentimiento/historial.

## Actualización y reversión de la aplicación

1. Programar mantenimiento, avisar a los usuarios y crear un respaldo completo que aparezca como exitoso en `backup-status`. Conservar también la versión de imagen y la configuración privada actuales.
2. Descargar o construir la versión aprobada. Detener `web`, `frontend` y `api`, dejando PostgreSQL activo. Ejecutar primero la simulación de migración y confirmar que el destino corresponde al host/base esperados:

   ```sh
   docker compose stop web frontend api
   docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops migrate
   docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops migrate --apply --confirm-target postgres:5432/logmaster_pilot
   docker compose run --rm ops check
   docker compose up -d --wait api frontend web
   ```

3. Comprobar salud, acceso, consulta, registro de prueba acordado, auditoría y logs antes de reabrir el sistema. No usar datos reales en un ensayo.
4. Si la nueva imagen falla sin cambios incompatibles de esquema, detener los servicios y volver a la imagen anterior solo si esa versión admite el esquema ya migrado. Si el esquema o los datos deben revertirse, no ejecutes migraciones descendentes: restaura el respaldo en staging, valida cuentas/conteos y claves, y luego usa el procedimiento **Restauración operativa** de esta guía con confirmación explícita. Mantén el sistema detenido hasta verificar el resultado.

La aplicación no incluye rollback automático de esquema. Si falla una migración, `psql` la revierte dentro de su transacción; conserva la base detenida, revisa `journalctl` y no reinicies con una versión no compatible.

## Restauración operativa

Conservar un respaldo verificado del estado actual, comprobar espacio y confirmar que el mismo root existe en destino y archivo. Mantener operadores fuera durante todo el mantenimiento:

```sh
sudo systemctl stop logmaster-backup.timer logmaster-rehearsal.timer
docker compose stop web api
docker compose up -d --wait postgres postgres-restore
```

Colocar archivo cifrado y `.meta` juntos en el volumen backups; colocar su contraseña en `config/maintenance.password`, fuera de ese volumen. El nombre debe ser basename backup-....dump.enc. Las contraseñas automáticas se guardan cifradas en passwords; el ensayo semanal las consume internamente sin publicarlas.

```sh
docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops restore --archive backup-EJEMPLO.dump.enc --root root --password-file /run/secrets/maintenance_password --staging-env /run/secrets/staging_env
docker compose -f compose.yaml -f deploy/compose.admin.yaml run --rm ops ops restore --archive backup-EJEMPLO.dump.enc --root root --password-file /run/secrets/maintenance_password --staging-env /run/secrets/staging_env --apply --confirm-target postgres:5432/logmaster_pilot
docker compose run --rm ops check
docker compose up -d --wait api web
```

Para copias automáticas, omitir `--password-file` y el override admin: el CLI obtiene su contraseña cifrada del volumen privado sin imprimirla. Para copias manuales/importadas, usar el archivo privado como en el ejemplo.

La simulación valida destino/configuración/contraseña/archivo sin modificar. Aplicar restaura primero en logmaster_restore_test, prevalida y actualiza el esquema, y rearchiva esa copia. Solo después reemplaza el destino. Esquema/datos, validación de root, incremento de versiones de sesión y auditoría comparten `psql --single-transaction --set=ON_ERROR_STOP=1`. Un fallo revierte íntegramente el destino; staging puede haber cambiado y es desechable.

Verificar nuevo acceso, auditoría BACKUP_RESTORE_COMPLETED, búsquedas/conteos y rechazo de sesiones anteriores; retirar contraseña temporal, detener postgres-restore y reactivar timers tras revisión. Ante fallo mantener aplicación detenida y comprobar el estado antes de reintentar. HTTP solo permite restauración en ensayo. Revisar cancelaciones posteriores a la copia: restaurar puede reintroducir información cancelada y requiere tratamiento empresarial.

## Respaldos y supervisión

```sh
docker compose run --rm backup backup-daily
docker compose run --rm ops backup-status
docker compose run --rm ops backup-monitor
docker compose up -d --wait postgres-restore
docker compose run --rm ops rehearse
docker compose stop postgres-restore
```

`pnpm backup` utiliza el mismo servicio `backup` y su cuenta de solo lectura; las operaciones de restauración permanecen en `ops` con credenciales de mantenimiento.

La exclusión mutua serializa CLI/API. Se verifica la nueva copia antes de podar; se conservan 30 pares automáticos completos y exitosos, y se preservan manuales/incompletos. Archivo y metadatos son una unidad; los errores de E/S no se presentan como éxito. Las contraseñas se cifran en almacenamiento separado. Estado: fecha, duración, tamaño, último resultado y última fecha exitosa, sin contraseñas.

Las copias nuevas usan formato versionado 2 con cifrado autenticado por flujo y contraseña aleatoria propia; las copias anteriores con scrypt/gzip/AES-GCM siguen siendo legibles. Límite nuevo: 20 GiB de archivo y 80 GiB de SQL renderizado; formato anterior: 500 MiB. El manifiesto admite 1 MiB. El volumen `work` de mantenimiento debe tener espacio para el archivo descifrado y el SQL temporal; la API no lo monta. En Linux, los temporales con datos quedan desvinculados mientras están abiertos y se liberan al cerrar el proceso; un fallo de espacio produce error explícito. Las tareas de mantenimiento admiten hasta tres horas. Antes de retirar un posible `.backup.lock`, comprobar que no exista una operación activa; revisar también el espacio de `work` y el volumen de respaldos. El ensayo de gran tamaño sigue pendiente de ejecución en el laboratorio Linux.

Para inicio automático, respaldo 01:00 diario y ensayo domingo 03:00 Caracas:

```sh
sudo cp deploy/systemd/logmaster* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now logmaster.service logmaster-backup.timer logmaster-rehearsal.timer
systemctl list-timers 'logmaster*'
systemctl status logmaster.service logmaster-backup.service logmaster-rehearsal.service
journalctl -u logmaster-backup.service -u logmaster-rehearsal.service --since today
docker compose ps
docker compose logs --tail 100 api web
df -h
docker system df
```

El ensayo semanal usa otro PostgreSQL, rol y volumen. CI adelanta timers y comprueba ejecución real. Los servicios reinician salvo detención explícita y rotan logs en tres archivos de 10 MiB. Recuperar tras revisar error/espacio con `docker compose up -d --wait` y verificar health/login. No utilizar down -v en operación. El reinicio físico debe ensayarse en hardware empresarial.

## Evidencia y aceptación institucional

CI comprueba lock congelado, tipos/lint/build, Go con carreras, SQL generado, vulnerabilidades alcanzables, PostgreSQL, permisos/revocación, cifrado/cancelación, rollback, navegador HTTPS, Mailpit/SSE, persistencia y timers. El workflow manual genera 100.000 perfiles/1.000.000 visitas/50 sesiones, calienta dos minutos y mide quince. Publica recursos/hardware; objetivos p95 habitual/operación ≤1 s, búsqueda ≤2 s y errores inesperados <1 %.

La carga completa vigente requiere un runner Linux propio con las etiquetas `self-hosted, linux, x64, logmaster-load`, al menos 4 vCPU, 16 GiB de RAM y 512 GiB disponibles tanto en el workspace como en Docker. El workflow manual comprueba la capacidad antes de crear datos y usa volúmenes con nombre de proyecto único. Hasta que ese runner complete la ejecución, los objetivos y el escenario actualizado de 5.000 visitas abiertas son criterios pendientes, no resultados aceptados.

El orden de ejecución, la prueba de flujo de 2 GiB, los comandos de repetición y los artefactos exigidos están en [LINUX_VALIDATION](LINUX_VALIDATION.md).

Los objetivos provisionales de recuperación para el laboratorio son RPO de 24 horas y RTO de 2 horas. No están aprobados por la empresa; los responsables institucionales deben definirlos antes de uso operativo. Actualmente el seguimiento se realiza revisando timers, `backup-status`, healthchecks, espacio y journal de systemd; no hay notificación externa de alertas configurada.

Quedan condiciones institucionales independientes: servidor/capacidad, hostname/certificado, puestos/cámaras, SMTP real, responsables de claves/copias, política de conservación y aceptación de operadores. Las pruebas ficticias no constituyen aceptación empresarial.
