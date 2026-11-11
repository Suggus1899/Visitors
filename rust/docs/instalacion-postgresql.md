# Instalación de PostgreSQL 16 para LogMaster (Windows)

Guía paso a paso para dejar PostgreSQL listo para `logmaster.exe`
en el equipo donde corre el servicio. No hace falta experiencia
previa con PostgreSQL: cada paso dice qué comprobar antes de
seguir.

> Si vas a usar el modo por defecto (SQLite embebido), no necesitas
> nada de esto: el .exe ya lleva la base dentro. Esta guía es solo
> para el motor PostgreSQL elegible por configuración (ver
> [«Doble motor por configuración»](../README.md#doble-motor-por-configuración-entre-fase-3-y-fase-4)
> en el README).

## 1. Descargar el instalador oficial

1. Abre <https://www.postgresql.org/download/windows/> y descarga
   el instalador de **PostgreSQL 16** (EDB).
2. Ejecuta el instalador como administrador.

## 2. Instalar

1. **Directorio de instalación**: deja el propuesto
   (`C:\Program Files\PostgreSQL\16`).
2. **Componentes**: deja todos marcados (PostgreSQL Server,
   pgAdmin 4, Stack Builder, Command Line Tools).
3. **Directorio de datos**: deja el propuesto
   (`C:\Program Files\PostgreSQL\16\data`).
4. **Contraseña del superusuario `postgres`**: elígela y apúntala
   en un lugar seguro. La necesitarás en los pasos 3 y 4 y cada vez
   que entres a pgAdmin o a `psql` como `postgres`. No es la
   contraseña que usará LogMaster: esa es otra, creada en el paso 4.
5. **Puerto**: deja **5432**.
6. **Configuración regional**: deja la propuesta.
7. Completa la instalación. Si Stack Builder se abre al final,
   ciérralo: no hace falta nada más.

## 3. Comprobar el servicio

PostgreSQL se instala como servicio de Windows
(`postgresql-x64-16`) con arranque automático.

```powershell
Get-Service postgresql-x64-16
# Status debe ser Running
```

Si no está en ejecución:

```powershell
Start-Service postgresql-x64-16
```

## 4. Crear la base y los roles de LogMaster

Abre **SQL Shell (psql)** desde el menú Inicio (está en la carpeta
PostgreSQL 16). Te pedirá, en orden: servidor (`localhost`),
base (`postgres`), puerto (`5432`), usuario (`postgres`) y la
contraseña del superusuario del paso 2. Pulsa Enter para aceptar
cada valor propuesto.

> Las contraseñas de los roles de LogMaster deben tener
> **48 caracteres hexadecimales en minúscula** en producción
> (así las exige `deploy/postgres/init-roles.sh`). Genera una con
> PowerShell y apúntala:
>
> ```powershell
> -join ((0..47) | ForEach-Object { '0123456789abcdef'[(Get-Random -Maximum 16)] })
> ```
>
> Ejecútalo una vez por rol (`logmaster_pilot`,
> `logmaster_runtime`, `logmaster_backup`,
> `logmaster_restore_test`). En esta guía se escriben como
> `<clave-pilot-48-hex>`, `<clave-runtime-48-hex>`,
> `<clave-backup-48-hex>` y `<clave-restore-48-hex>`.

Crea la base piloto y sus roles (copia y pega el bloque entero;
sustituye las claves):

```sql
-- Dueño de la base piloto: el usuario que la crea y la administra.
-- En el despliegue Docker de la línea base es logmaster_pilot.
CREATE ROLE logmaster_pilot LOGIN
  PASSWORD '<clave-pilot-48-hex>';
CREATE DATABASE logmaster OWNER logmaster_pilot;
CREATE ROLE logmaster_runtime LOGIN
  PASSWORD '<clave-runtime-48-hex>';
CREATE ROLE logmaster_backup LOGIN
  PASSWORD '<clave-backup-48-hex>';

-- Base de pruebas de restauración (la usa la fase 6 de operación).
CREATE DATABASE logmaster_restore_test;
CREATE ROLE logmaster_restore_test LOGIN
  PASSWORD '<clave-restore-48-hex>';
ALTER DATABASE logmaster_restore_test OWNER TO logmaster_restore_test;
```

Conéctate a la base piloto y da los privilegios mínimos:

```sql
\c logmaster
GRANT CONNECT ON DATABASE logmaster
  TO logmaster_runtime, logmaster_backup;
GRANT USAGE ON SCHEMA public
  TO logmaster_runtime, logmaster_backup;
-- Tiempo de ejecución: leer, crear, modificar y borrar filas,
-- y usar las secuencias (ids).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO logmaster_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO logmaster_runtime;
-- Respaldo: solo lectura.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO logmaster_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO logmaster_backup;
-- Que los objetos que se creen después hereden los mismos permisos.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO logmaster_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO logmaster_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO logmaster_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO logmaster_backup;
```

> `logmaster.exe` **no** necesita el superusuario `postgres`: se
> conecta siempre como `logmaster_runtime`, con los permisos mínimos
> de arriba. No pongas la clave de `postgres` en el `config.toml`.

Comprueba los roles:

```sql
\du
-- logmaster_runtime y logmaster_backup deben aparecer con "Login".
\l
-- logmaster y logmaster_restore_test deben aparecer en la lista.
```

## 5. Probar la conexión con psql

```powershell
psql -h 127.0.0.1 -p 5432 -U logmaster_runtime -d logmaster
-- Escribe la clave de logmaster_runtime cuando la pida.
-- Si entra, el prompt cambia a: logmaster=>
SELECT version();
-- Debe mostrar: PostgreSQL 16.x ...
\q
```

Si este paso falla, no sigas: resuelve el error con la tabla del
apartado 8 y repite.

## 6. Configurar el .exe para usar PostgreSQL

1. Copia `logmaster.exe` a `C:\LogMaster` (ver «Primer arranque»
   en el README: el propio .exe ofrece copiarse allí).
2. Junto al .exe debe haber un `config.toml` (el .exe lo crea solo
   la primera vez desde el ejemplo, o cópialo de
   `rust/config.example.toml`). Edita su sección de base de datos:

   ```toml
   [database]
   engine = "postgres"
   url = "postgres://logmaster_runtime:<clave-runtime-48-hex>@127.0.0.1:5432/logmaster"
   test_on_startup = true
   ```

   - `engine = "postgres"` es el único cambio necesario además de
     la `url`: con solo esas dos líneas el .exe usa PostgreSQL.
   - La `url` es formato URL (`postgres://usuario:clave@host:5432/base`).
     No uses el formato `clave=valor` (`host=... dbname=...`): el
     .exe no lo acepta.
   - `test_on_startup = true` es obligatorio: la prueba de conexión
     al arrancar no se puede desactivar. No pongas `false`: el .exe
     rechaza la configuración.
   - La clave queda en el `config.toml`. Es la clave del rol
     `logmaster_runtime`, no la del superusuario. En un equipo
     compartido, limita quién puede leer `C:\LogMaster`.
   - Si la base vive en otro equipo de la misma red de confianza,
     cambia `127.0.0.1` por su host. Esta compilación **no usa TLS**
     con PostgreSQL: úsala solo en el mismo host o en una red de
     confianza.
3. Para volver a SQLite, basta cambiar `engine = "sqlite"` (y la
   línea `path` de la base). No hay sincronización entre motores:
   cada uno tiene sus propios datos.

## 7. Comprobar el resultado en el log y en `/health`

Arranca el .exe en consola:

```powershell
C:\LogMaster\logmaster.exe serve
```

En el log de arranque debe aparecer una línea como esta:

```text
base de datos verificada engine="postgres" base=logmaster@127.0.0.1:5432 version="PostgreSQL 16..." latency_ms=1 schema_version=6
```

Y en el navegador o con `curl`:

```powershell
curl http://127.0.0.1:8443/api/v1/health
```

```json
{"data": {"database": "ok", "engine": "postgres", "host": "127.0.0.1", "port": 5432, "database_name": "logmaster", "version": "PostgreSQL 16...", "latency_ms": 1, "schema_version": 6, "status": "ok"}, "success": true}
```

- `database: "ok"` aparece **solo si la prueba real pasa**.
- Si la conexión falla, el .exe **no arranca**: termina con el
  motivo concreto (credenciales, host inalcanzable, base
  inexistente). No sigue como si nada.
- `logmaster.exe check` imprime el mismo informe en texto
  (motor, base, versión, latencia, esquema, integridad, huellas).

## 8. Errores típicos y su solución

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `password authentication failed for user "logmaster_runtime"` | Clave del rol mal copiada en la `url` del `config.toml`, o rol creado con otra clave. | Repite el paso 5 con esa clave. Si `psql` tampoco entra, recrea el rol: `DROP ROLE logmaster_runtime;` y vuelve a crearlo con la clave correcta (paso 4). |
| `connection refused` / `no se pudo conectar con el servidor` | El servicio de PostgreSQL no corre, o el puerto no es 5432. | Paso 3: `Get-Service postgresql-x64-16` y arráncalo. Comprueba el puerto: `netstat -ano \| findstr 5432`. |
| `database "logmaster" does not exist` | La base no se creó, o la `url` apunta a otra base. | Paso 4: `\l` en `psql` y crea la base que falta. Revisa el nombre en la `url`. |
| `role "logmaster_runtime" does not exist` | Los roles no se crearon (o se crearon en otra base). | Paso 4: `\du` en `psql`. Los roles son del clúster, no de una base: créalos conectado a `postgres`. |
| `permission denied for table ...` | Faltan los `GRANT` del paso 4, o las migraciones se aplicaron con otro usuario. | Repite los `GRANT` del paso 4 conectado a `logmaster`. Las migraciones del .exe las aplica `logmaster_runtime` al arrancar. |
| `pg_hba.conf rejects connection` / `no pg_hba.conf entry for host` | PostgreSQL no admite esa forma de conexión (usuario/host/método). | En `C:\Program Files\PostgreSQL\16\data\pg_hba.conf` debe haber una línea `host all all 127.0.0.1/32 scram-sha-256`. Si la editas, reinicia el servicio. No abras el acceso a toda la red: solo `127.0.0.1/32` si la base es local. |
| El puerto 5432 ya está ocupado al instalar | Otro PostgreSQL (u otro servicio) ya lo usa. | `netstat -ano \| findstr 5432` muestra el PID; `Get-Process -Id <pid>` dice quién es. Desinstala el otro PostgreSQL o instala este en otro puerto y refleja ese puerto en la `url`. |
| El firewall bloquea desde otro equipo | El puerto 5432 no está abierto en el equipo de la base. | Abre el 5432 **solo** para el equipo de LogMaster (regla de entrada TCP 5432 con origen = esa IP), no para toda la red. Si base y .exe están en el mismo equipo, no hace falta abrir nada. |
| `test_on_startup = false` | La configuración rechaza desactivar la prueba. | Déjalo en `true` o quita la línea: siempre está activo por diseño. |
| `database = "postgres" necesita una cadena de conexión` | Falta la `url` en `[database]`. | Añade la `url` en formato `postgres://...` (paso 6). |
| El .exe crea su `config.toml` en otra carpeta | Se ejecutó desde Descargas o el escritorio. | Es el flujo de primer arranque: acepta la copia a `C:\LogMaster` y edita el `config.toml` de allí, no el de Descargas. |

## 9. Volver a SQLite

Si quieres dejar de usar PostgreSQL, cambia en el `config.toml`
junto al .exe:

```toml
[database]
engine = "sqlite"
path = "C:\\ProgramData\\LogMaster\\data\\logmaster.db"
```

La base PostgreSQL queda intacta (con sus datos) por si vuelves.
Recuerda: no hay sincronización entre motores; lo que se registró
en uno no aparece en el otro.
