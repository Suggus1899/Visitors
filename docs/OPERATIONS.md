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

Este procedimiento es un laboratorio vacío, accesible en https://localhost:8443. `configure.sh` se niega a sobrescribir `app.env`; genera credenciales independientes, staging y certificado de localhost de dos días. No crea Visitors-local ni instala Docker. El perfil test captura correo sin entregarlo al exterior. `deploy/compose.test.yaml` habilita diagnósticos exclusivamente en 127.0.0.1.

Antes de uso empresarial: sustituir `tls.pem`/`tls.key` por certificado confiable del hostname, establecer APP_URL/CORS_ORIGINS con ese origen HTTPS y NODE_ENV=production. Configurar SMTP_HOST/PORT/USER/PASSWORD/EMAIL_FROM y SMTP_TLS_MODE=starttls o implicit; local se rechaza en producción. No utilizar el perfil test ni exponer Mailpit. Ajustar LOGMASTER_BIND, puerto y firewall tras configurar red/certificado. Al modificar LOGMASTER_SUBNET y LOGMASTER_PROXY_IP, actualizar TRUSTED_PROXY_CIDRS con la IP exacta del proxy; Nginx reemplaza los encabezados del navegador.

Las variables Compose se guardan en `.env` privado o entorno del servicio. LOGMASTER_CONFIG_DIR debe coincidir en shell y systemd. DOTENV_CONFIG_PATH selecciona el secreto `/run/secrets/app_env`. La API solo comprueba esquema e índice al arrancar. Mantener RETENTION_ENABLED=false hasta aprobar política empresarial.

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
docker compose run --rm ops backup-daily
docker compose run --rm ops backup-status
docker compose run --rm ops backup-monitor
docker compose up -d --wait postgres-restore
docker compose run --rm ops rehearse
docker compose stop postgres-restore
```

La exclusión mutua serializa CLI/API. Se verifica la nueva copia antes de podar; se conservan 30 pares automáticos completos y exitosos, y se preservan manuales/incompletos. Archivo y metadatos son una unidad; los errores de E/S no se presentan como éxito. Las contraseñas se cifran en almacenamiento separado. Estado: fecha, duración, tamaño, último resultado y última fecha exitosa, sin contraseñas.

Archivo comprimido/cifrado máximo 500 MiB, manifiesto 1 MiB, SQL temporal 4 GiB; tareas administrativas 30 minutos. El cifrado consume memoria: dimensionar RAM y espacio temporal con el ensayo grande y margen para verificar copias. Exceso o falta de espacio deben fallar explícitamente; se eliminan temporales al terminar. Un proceso interrumpido puede dejar `.backup.lock`: comprobar que no haya operación activa antes de retirarlo.

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

Quedan condiciones institucionales independientes: servidor/capacidad, hostname/certificado, puestos/cámaras, SMTP real, responsables de claves/copias, política de conservación y aceptación de operadores. Las pruebas ficticias no constituyen aceptación empresarial.
