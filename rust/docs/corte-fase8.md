# Fase 8 · Runbook de corte (Go + PostgreSQL → Rust + SQLite)

Fecha del ensayo: 2026-11-11. Rama `rust-migration`. El corte real se
ejecuta en el equipo destino (Windows, `C:\LogMaster`); este runbook
recoge los pasos y los tiempos y conteos medidos en el ensayo de esta
VM (Linux, PostgreSQL 16, datos realistas: 152 visitantes y 1.052
visitas sembrados por el arnés de fase 7, 100 perfiles / 1.000 visitas
+ recorridos).

## 0. Qué se corta y qué queda archivado

- **Se corta**: el sistema pasa a `logmaster.exe` (Rust) con SQLite
  embebido en WAL, servicio de Windows con arranque automático
  retrasado. La interfaz, la API y la base las atiende el mismo
  ejecutable.
- **Queda archivado**: la base PostgreSQL original, intacta, sin
  borrar. Es la reversión durante el periodo de observación
  (documento, §11): el `convert` solo lee, nunca escribe en origen.
- **No hay vuelta atrás automática**: la reversión es un procedimiento
  manual (sección 9), ensayado en la sección 8.

## 1. Precondiciones

1. El `logmaster.exe` de release está en `C:\LogMaster` con su
   `config.toml` (motor `sqlite` por defecto) y los secretos ya
   guardados (`init` + `secrets set`, o entorno). Las claves son las
   de siempre: `ENCRYPTION_KEY` (datos), `JWT_SECRET` /
   `JWT_REFRESH_SECRET` (sesión) y `EDIT_PASSWORD`. Sin la clave de
   datos correcta, `check` falla con la huella y el corte no sigue.
2. El equipo destino tiene copia del instalador y de este runbook.
3. Hay ventana de corte acordada: el sistema Go se detiene para
   escrituras durante la conversión (en el ensayo, con 152
   visitantes / 1.052 visitas, la conversión tardó ~1 s; con datos
   reales de producción el tiempo crece linealmente por tabla y se
   mide antes con el paso 4 en una copia).
4. Nadie escribe en Go desde que se toma el respaldo del paso 2.

## 2. Respaldo de Go (el archivo de reversión)

Con Go todavía en marcha, dos archivos independientes:

```powershell
# 1) Respaldo age de Go (el de siempre): por API o por CLI.
#    Por API (como root): POST /api/v1/backups -> {filePath, restorePassword}
#    Guardar la contraseña: se muestra una sola vez.
# 2) Volcado PostgreSQL completo, por si el respaldo age no basta:
pg_dump -Fc -h <host> -p 5432 -U logmaster_runtime -d logmaster -f pg-archivo.dump
```

Medido en el ensayo (1.052 visitas): `pg_dump` 0,23 s, 155.701
bytes; respaldo age por API 0,56 s, 155.981 bytes. Verificar los dos
antes de seguir: el age con `rehearse` de Go (o su prueba de
restauración) y el volcado restaurándolo en una base de ensayo
(sección 8). Si alguno falla, no se corta.

## 3. Preflight del origen

```powershell
logmaster.exe preflight --from-postgres "postgres://<usuario>:<clave>@<host>:5432/<base>"
```

Comprueba descifrado de identidades, visitas abiertas duplicadas,
relaciones rotas, longitudes de tokens y estados de índice. En el
ensayo: todo correcto (152 perfiles descifrados, 0 duplicados).
Si algo falla, se resuelve en Go antes de convertir; `convert` no
deja parciales si se cancela.

## 4. Conversión

```powershell
logmaster.exe convert --from-postgres "postgres://<usuario>:<clave>@<host>:5432/<base>" --to C:\LogMaster\data\logmaster.db
```

- Lee PostgreSQL en modo solo lectura y escribe el SQLite nuevo,
  tabla por tabla, en orden de dependencias, dentro de una sola
  transacción. El destino no debe existir.
- Los campos cifrados viajan byte a byte (mismo formato AES-GCM /
  HMAC); las fechas pasan a ISO 8601 UTC, los booleanos a 0/1 y los
  `BYTEA` (fotos) a BLOB.
- Al final verifica conteos origen/destino y corre el preflight del
  destino. Medido en el ensayo: **1,0 s** para 4 usuarios, 152
  visitantes, 1.052 visitas, 1 intervalo, 2.020 registros de
  auditoría, 1 solicitud ARCO y 3.220 tokens; preflight del destino
  0,08 s, todo correcto.
- La diferencia de 2 registros de auditoría entre la instantánea
  previa (2.018) y la conversión (2.020) corresponde al login y a la
  creación del respaldo age, posteriores a la instantánea: es
  actividad real, no pérdida.

## 5. Verificación del destino

```powershell
logmaster.exe check
logmaster.exe preflight --db C:\LogMaster\data\logmaster.db
```

`check` debe decir `huellas de clave: ok`, `integridad: ok` y
`esquema: 7`. Si dice `huellas de clave: pendientes (índices sin
preparar)`, es que los índices vienen sin preparar (base heredada
sin preparar o cambio de clave): ejecutar el paso 6.

## 6. Índices (`ops reindex`, solo si hace falta)

```powershell
logmaster.exe ops reindex          # no rehace lo ya listo
logmaster.exe ops reindex --force  # rehace los dos índices
```

Con el servicio detenido. En el ensayo sobre la base convertida
(índices ya listos, heredados de Go): sin `--force` no toca nada;
con `--force` regenera 152 perfiles / 3.220 tokens en 0,42 s, con 0
cambios de identidad (las referencias ya eran HMAC). En PostgreSQL
(mismo comando, motor `postgres`): 152 perfiles / 3.220 tokens en
~1,0 s, y `check` pasa de `pendientes` a `ok`. La segunda pasada sin
`--force` no toca nada en ninguno de los dos motores.

## 7. Servicio en el equipo destino

```powershell
logmaster.exe init                          # carpetas, config, secretos, root
logmaster.exe service install               # arranque automático retrasado + recuperación
logmaster.exe service start
```

- El primer arranque fuera de `C:` ofrece copiarse a `C:\LogMaster`
  con su `config.toml` y crea el acceso directo `LogMaster.lnk` en
  el escritorio.
- La cuenta virtual `NT SERVICE\LogMaster` y los permisos NTFS se
  configuran en el equipo destino (pendiente de ejecutar allí; ver
  `docs/aceptacion-fase8.md`).
- Humo post-corte (con la clave y usuarios reales): `GET /health`
  200, `GET /api/v1/health` 200 con `database: ok`, login de root,
  lista de visitas con el total convertido (en el ensayo: 1.052),
  búsqueda por cédula (`V-20000001` → 1 perfil), lista de espera
  (100 en el ensayo) y una exportación. En el ensayo, todo en verde
  contra la base convertida servida por Rust.

## 8. Ensayo de reversión (hecho en esta VM, 2026-11-11)

1. `pg_restore` del volcado del paso 2 en una base nueva
   (`logmaster_f8_revert`): 0,22 s; conteos 1.052 visitas, 152
   visitantes, 3.220 tokens, idénticos a la instantánea.
2. Go levantado contra esa base: `GET /api/v1/health` 200, login de
   root, `GET /api/v1/visits?limit=1` con `total: 1052` y detalle
   del visitante `V-20000001` / `Perfil1`, idéntico al origen.
3. Conclusión: la reversión desde el archivo funciona y devuelve el
   sistema al estado previo al corte, con los mismos datos.

La reversión también es posible sin restaurar nada: basta apuntar
Go a la base PostgreSQL archivada intacta (paso 9) y arrancar. El
volcado es el segundo archivo de seguridad, no el primero.

## 9. Observación con PostgreSQL archivado

- **Cómo se archiva**: la base PostgreSQL queda detenida pero
  intacta en su equipo (o su volumen copiado a un disco externo),
  junto con los dos archivos del paso 2 (`pg-archivo.dump` y el
  respaldo age de Go con su contraseña guardada aparte, no en el
  mismo disco que el volcado). No se borra nada durante la
  observación.
- **Cómo se consulta**: sin tocar el archivo: se restaura el volcado
  en una base de ensayo (`pg_restore` a una base nueva) y se levanta
  Go contra ella, solo para consultar; o se levanta Go contra la
  base archivada en modo lectura si hace falta verificar un dato
  puntual. Nunca se escribe en el archivo durante la observación.
- **Cuánto tiempo**: propuesta **30 días** (un ciclo mensual
  completo de operación, con 4 ensayos dominicales de respaldo del
  sistema nuevo). La duración final la fija Gustavo; el archivo no
  se borra sin su confirmación explícita. Pasado el plazo y con el
  checklist de la sección 10 en verde, se archiva el volcado fuera
  del equipo y se retira la base PostgreSQL.
- **Durante la observación**: respaldo diario automático del Rust
  (01:00) y ensayo dominical (03:00) activos; se vigila el log de
  arranque (`huellas de clave: ok`) y `/api/v1/health`.

## 10. Criterios para dar el corte por terminado

- `check` en verde y humo post-corte en verde (sección 7).
- Respaldo diario y ensayo dominical demostrados en el equipo
  destino (al menos un ciclo completo de cada uno).
- Reinicio de Windows sin iniciar sesión: el servicio arranca solo
  y responde.
- Reversión ensayada una vez (sección 8) y archivos del paso 2
  guardados en dos sitios distintos.
- Periodo de observación cumplido sin incidencias, o con las
  incidencias resueltas y registradas.

## 11. Si algo sale mal durante el corte

| Momento | Acción |
| --- | --- |
| Antes de `convert` | No se ha tocado nada: seguir en Go. |
| `convert` o `preflight` falla | El destino parcial se borra solo; revisar el error, corregir en Go y repetir desde el paso 2. |
| `check` con huellas pendientes | Ejecutar el paso 6 (`ops reindex`). |
| `check` con otra huella | La clave de datos no es la de Go: corregir `ENCRYPTION_KEY`, no forzar. |
| Ya sirviendo Rust y hay que volver | Sección 9: parar el servicio Rust, levantar Go contra la base archivada (o restaurar el volcado) y verificar los totales antes de avisar que se volvió. |
