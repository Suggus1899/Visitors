# Manual de Instalacion — LogMaster

---

## 1. Requisitos del Sistema

### 1.1 Hardware Minimo

| Componente | Minimo | Recomendado |
|---|---|---|
| CPU | 2 nucleos | 4 nucleos |
| RAM | 4 GB | 8 GB |
| Disco | 10 GB libres | 50 GB SSD |
| Red | 100 Mbps | 1 Gbps |

### 1.2 Software Requerido

| Software | Version Minima | Descarga |
|---|---|---|
| Windows | 10 (64-bit) o 11 | N/A |
| Node.js | 20.x LTS | https://nodejs.org |
| PostgreSQL | 16.x | https://www.postgresql.org/download/windows/ |
| Git | 2.x | https://git-scm.com |

### 1.3 Puertos Requeridos

| Puerto | Servicio | Uso |
|---|---|---|
| 3000 | Server (API) | Backend REST |
| 5173 | Client (Vite) | Interfaz web (desarrollo) |
| 5432 | PostgreSQL | Base de datos |

---

## 2. Instalacion Local (Recomendado)

### 2.1 Verificar Requisitos

```batch
:: Verificar Node.js
node --version
npm --version

:: Verificar PostgreSQL
psql --version
```

### 2.2 Descargar el Proyecto

Opcion A — Clonar con Git:
```bash
git clone <url-del-repositorio>
cd Visitors
```

Opcion B — ZIP:
1. Extraer el ZIP en `C:\LogMaster` (o la ruta deseada)
2. Abrir PowerShell o CMD en esa carpeta

### 2.3 Instalar PostgreSQL

1. Descargar desde https://www.postgresql.org/download/windows/
2. Durante la instalacion, establecer contrasena para usuario `postgres`
3. Recordar el puerto (default: 5432)
4. Crear la base de datos `visitors`:
```bash
psql -U postgres -c "CREATE DATABASE visitors;"
```

### 2.4 Configurar Variables de Entorno

El proyecto incluye un `.env` con valores por defecto para desarrollo.

**PASO OBLIGATORIO para produccion**: Generar claves seguras:

```bash
:: Generar JWT_SECRET (64 bytes = 128 caracteres hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

:: Generar ENCRYPTION_KEY (32 bytes = 64 caracteres hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Editar `.env` y reemplazar:
```env
JWT_SECRET=<el-resultado-del-primer-comando>
ENCRYPTION_KEY=<el-resultado-del-segundo-comando>
NODE_ENV=development   # Cambiar a production para despliegue real
```

### 2.5 Instalar Dependencias e Iniciar el Sistema (Primera Vez)

```batch
:: Instalar TODAS las dependencias (root + server + client)
npm run install-all

:: Iniciar servidor (puerto 3000) + cliente (puerto 5173) simultaneamente
npm run dev
```

### 2.6 Verificar que Todo Funciona

Acceder a las siguientes URLs para confirmar:
- La BD responde (psql -U postgres -d visitors)
- La API responde (`http://localhost:3000/api/v1/health`)
- El cliente web responde (`http://localhost:5173`)

### 2.7 Acceder al Sistema

| URL | Descripcion |
|---|---|
| `http://localhost:5173` | Interfaz web (usar esta) |
| `http://localhost:3000/api/v1/health` | Health check API |
| `http://localhost:3000/api-docs` | Swagger UI (solo development) |

### 2.8 Credenciales por Defecto (Desarrollo)

| Rol | Usuario | Contrasena |
|---|---|---|
| Root | trebolmaster | TrebolMaster2026! |
| Admin | Admin@trebol.com | Trebol123* |
| Operador | operador | Operador2026! |
| Auditor | auditor | Audit2026!@# |
| Demo | demo | Demo123!@# |

**Importante**: En produccion, cambiar estas contrasenas via variables de entorno (`SEED_ROOT_PASSWORD`, `SEED_ADMIN_PASSWORD`, `SEED_OPERADOR_PASSWORD`, `SEED_AUDITOR_PASSWORD`, `SEED_DEMO_PASSWORD`)

---

## 3. Ejecutar Pruebas

```bash
:: Pruebas del servidor
cd server && npm test

:: Pruebas del cliente
cd client && npm test

:: Ambas
npm test
```

---

## 4. Configuracion de Red LAN

### 4.1 Obtener la IP del Servidor

```batch
ipconfig
:: Anotar la IPv4 (ej: 192.168.1.108)
```

### 4.2 Acceso desde Otra PC

Desde otra PC en la misma red, abrir:
- Frontend: `http://192.168.1.108:5173`
- API: `http://192.168.1.108:3000/api/v1`

### 4.3 Configurar ALLOWED_ORIGINS

Editar `.env` y agregar la IP en `ALLOWED_ORIGINS`:
```env
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.108:5173
```

Reiniciar el servidor con `npm run dev`.

### 4.4 DHCP: Cuando Cambia la IP

Si la IP del servidor cambia (tipico en DHCP), actualizar `ALLOWED_ORIGINS` en `.env` con la nueva IP y reiniciar.

---

## 5. Configuracion de Correo (SMTP)

Para habilitar el flujo de recuperacion de contrasena:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=tu-app-password
EMAIL_FROM=noreply@tudominio.com
APP_URL=http://localhost:5173   # URL base para enlaces de reset
```

**Nota**: Sin SMTP configurado, el sistema funciona pero los correos solo se registran en logs.

---

## 6. Respaldo y Restauracion

### 6.1 Respaldo Manual

```batch
:: Respaldo completo via web (interfaz Admin > Backups)
:: O via linea de comandos:

cd server
npm run backup:full
:: Genera archivo en ./backups/backup_YYYYMMDD_HHmmss.dump
```

### 6.2 Respaldo de Solo Esquema

```bash
cd server
npm run backup:schema
```

### 6.3 Respaldo Automatico (Programado)

Configurar una tarea programada en Windows:

```batch
:: Abrir Programador de Tareas
:: Crear tarea: Ejecutar diariamente
:: Comando: C:\LogMaster\server\node_modules\.bin\ts-node C:\LogMaster\server\src\scripts\backup.ts
```

### 6.4 Restauracion

Via web: Admin > Backups > Seleccionar respaldo > Restaurar

Via CLI:
```bash
pg_restore -U postgres -d visitors < ./backups/backup_20260311_120000.dump
```

---

## 7. Actualizacion del Sistema

### 7.1 Actualizar Desde Git

```bash
git pull
npm run install-all
npm run dev
```

### 7.2 Migraciones de Base de Datos

Las migraciones SQL se ejecutan automaticamente al iniciar el servidor. Si se agrega una nueva migracion:

```bash
cd server
npm run migrate
```

### 7.3 Verificar Version

```bash
:: La version actual se muestra en el footer de la interfaz web
```

---

## 8. Monitoreo y Mantenimiento

### 8.1 Estado del Sistema

```batch
:: Verificar procesos:
:: - PostgreSQL corriendo (puerto 5432)
:: - Server corriendo (puerto 3000)
:: - Client corriendo (puerto 5173)
curl http://localhost:3000/api/v1/health
```

### 8.2 Monitoreo Continuo

```batch
:: Muestra en tiempo real: HTTP status, uso de RAM, espacio en disco
scripts\monitor-health.bat
```

### 8.3 Logs

```bash
:: Logs del backend
.\logs\server\        # Winston daily rotate
```

### 8.4 Verificar Espacio en Disco

```bash
cd server && npm run backup:monitor
:: Muestra el tamano de la tabla Visitors
```

---

## 9. Solucion de Problemas

### 9.1 PostgreSQL no arranca

| Sintoma | Solucion |
|---|---|
| "Connection refused" a BD | Verificar que el servicio PostgreSQL este corriendo |
| Puerto 5432 ocupado | Detener otro proceso que use el puerto o cambiar DB_PORT en .env |
| Autenticacion fallida | Verificar DB_USER/DB_PASSWORD en .env coincidan con PostgreSQL |

### 9.2 Server no inicia

| Sintoma | Verificar | Solucion |
|---|---|---|
| server crash | Consola de `npm run dev` | Verificar JWT_SECRET en .env |
| client no responde | Consola de Vite | Verificar que server este corriendo |
| Puerto 3000 ocupado | `netstat -ano \| findstr :3000` | Detener otro proceso o cambiar PORT en .env |

### 9.3 "Connection refused" a BD

```
Verificar que PostgreSQL este corriendo (servicio de Windows)
  o
Verificar DB_HOST/DB_PORT en .env
```

### 9.4 Error "JWT_SECRET must be set"

```env
:: Agregar al .env:
JWT_SECRET=<generar-con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```

### 9.5 CORS error en navegador

```batch
:: Actualizar ALLOWED_ORIGINS en .env con la URL del cliente
:: Reiniciar el servidor con npm run dev
```

### 9.6 Error "ECONNREFUSED" desde el cliente

```batch
:: Verificar que el servidor este accesible
curl http://localhost:3000/api/v1/health

:: Si no responde, revisar la consola de npm run dev
```

### 9.7 Base de Datos Corrupta

```batch
:: ADVERTENCIA: Esto borra TODOS los datos
:: Detener el servidor (Ctrl+C en npm run dev)
:: Recrear la BD:
psql -U postgres -c "DROP DATABASE visitors;"
psql -U postgres -c "CREATE DATABASE visitors;"
:: Reiniciar con npm run dev
```

### 9.8 "Token has been revoked"

```batch
:: Cerrar sesion en el navegador y volver a iniciar
:: Si persiste, limpiar localStorage del navegador
```

### 9.9 "Too Many Requests" (429)

```
Esperar 1 minuto y reintentar (rate limit general)
  o
Esperar 5 minutos para operaciones admin
```

### 9.10 "PASSWORD_CHANGE_REQUIRED" (403)

```
La politica de seguridad exige cambiar la contrasena.
Usar: Configuracion > Cambiar Contrasena
```

---

## 10. Preguntas Frecuentes

**Q: Como cambio el puerto del cliente web?**  
R: Editar `vite.config.ts` del cliente y reiniciar.

**Q: Los datos se pierden al actualizar?**  
R: No. La base de datos PostgreSQL local persiste los datos. Solo se pierden si se elimina manualmente la BD `visitors`.

**Q: Puedo acceder desde internet?**  
R: Si, pero requiere exponer los puertos y configurar un proxy reverso con HTTPS. No recomendado sin HTTPS.

**Q: Como agrego un usuario?**  
R: Iniciar sesion como Root > SuperAdmin Dashboard > Usuarios > Crear usuario.

**Q: Que pasa si olvido mi contrasena?**  
R: Contactar al usuario Root para que la resetee desde SuperAdmin Dashboard > Usuarios > Reset Password.

**Q: Como hago una copia de seguridad?**  
R: Admin > Backups > Crear Backup. O via `npm run backup` desde la raiz.

---

## 11. Referencia Rapida de Comandos

```bash
# === DESARROLLO ===
npm run dev                     # Iniciar cliente + servidor
npm run install-all             # Instalar todas las dependencias
npm test                        # Ejecutar todas las pruebas
cd server && npm test           # Pruebas del servidor
cd client && npm test           # Pruebas del cliente

# === BASE DE DATOS ===
psql -U postgres -d visitors    # Conectar a la BD
cd server && npm run migrate    # Ejecutar migraciones

# === RESPALDOS ===
cd server && npm run backup:full      # Backup completo
cd server && npm run backup:schema    # Solo esquema
cd server && npm run backup:monitor   # Ver tamano BD
pg_restore -U postgres -d visitors < ./backups/backup.dump  # Restaurar

# === SCRIPTS WINDOWS ===
scripts\monitor-health.bat      # Monitoreo en vivo
```
