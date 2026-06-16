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
| Docker Desktop | 4.x | https://www.docker.com/products/docker-desktop |
| Node.js (solo dev) | 20.x LTS | https://nodejs.org |
| Git (solo dev) | 2.x | https://git-scm.com |

### 1.3 Puertos Requeridos

| Puerto | Servicio | Uso |
|---|---|---|
| 80 | Client (HTTP) | Interfaz web |
| 443 | Client (HTTPS) | SSL |
| 3000 | Server (API) | Backend REST |
| 5432 | PostgreSQL (host) | Base de datos (solo si accede externamente) |

---

## 2. Metodo 1: Instalacion con Docker (Recomendado)

### 2.1 Verificar Requisitos

```batch
:: Verificar que Docker Desktop este instalado y corriendo
docker --version
docker info
```

Si `docker info` muestra error, abrir Docker Desktop desde el menu inicio y esperar a que diga "Engine running".

### 2.2 Descargar el Proyecto

Opcion A — Clonar con Git:
```bash
git clone <url-del-repositorio>
cd Visitors
```

Opcion B — ZIP:
1. Extraer el ZIP en `C:\LogMaster` (o la ruta deseada)
2. Abrir PowerShell o CMD en esa carpeta

### 2.3 Configurar Variables de Entorno

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

### 2.4 Iniciar el Sistema (Primera Vez)

```batch
:: Ejecutar como Administrador (unico comando necesario)
scripts\start.bat
```

Este comando:
1. Ejecuta `auto-env.bat` para detectar la IP local
2. Construye las imagenes Docker (3-5 minutos la primera vez)
3. Inicia los contenedores: postgres, server, client
4. Abre el navegador en `http://localhost`

### 2.5 Verificar que Todo Funciona

```batch
scripts\verify-system.bat
```

Este comando verifica:
- Docker Desktop esta corriendo
- Los 3 contenedores estan activos
- La BD responde
- La API responde
- El cliente web responde

### 2.6 Acceder al Sistema

| URL | Descripcion |
|---|---|
| `http://localhost` | Interfaz web (usar esta) |
| `http://localhost:3000/api/v1/health` | Health check API |
| `http://localhost:3000/api-docs` | Swagger UI (solo development) |

### 2.7 Credenciales por Defecto (Desarrollo)

| Rol | Usuario | Contrasena |
|---|---|---|
| Admin | Admin@trebol.com | Trebol123* |
| Guardia | guard | Guard123!@# |
| Auditor | auditor | Audit2026!@# |
| SuperAdmin | superadmin | TrebolMaster2026! |

**Importante**: En produccion, cambiar estas contrasenas via variables de entorno (`SEED_ADMIN_PASSWORD`, etc.)

---

## 3. Metodo 2: Instalacion Manual (Desarrollo)

### 3.1 Instalar Node.js

Descargar e instalar Node.js 20.x LTS desde https://nodejs.org

Verificar:
```bash
node --version   # Debe mostrar v20.x
npm --version    # Debe mostrar 10.x
```

### 3.2 Instalar PostgreSQL

Opcion A — Instalar PostgreSQL local:
1. Descargar desde https://www.postgresql.org/download/windows/
2. Durante la instalacion, establecer contrasena para usuario `postgres`
3. Recordar el puerto (default: 5432)

Opcion B — Usar Docker (recomendado para desarrollo):
```bash
docker run -d --name logmaster-postgres ^
  -e POSTGRES_DB=visitors ^
  -e POSTGRES_USER=postgres ^
  -e POSTGRES_PASSWORD=postgres ^
  -p 5432:5432 ^
  postgres:16-alpine
```

### 3.3 Clonar e Instalar Dependencias

```bash
git clone <url-del-repositorio>
cd Visitors

:: Instalar TODAS las dependencias (root + server + client)
npm run install-all
```

### 3.4 Configurar .env

Copiar `.env.example` a `.env` y ajustar:

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=visitors
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=<generar-con-node-e-comando>
ENCRYPTION_KEY=<generar-con-node-e-comando>
```

### 3.5 Iniciar en Modo Desarrollo

```bash
:: Inicia servidor (puerto 3000) + cliente (puerto 5173) simultaneamente
npm run dev
```

Acceder a:
- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`

### 3.6 Ejecutar Pruebas

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

### 4.1 Acceso Automatico

Simplemente ejecutar `scripts\start.bat` — el script `auto-env.bat` se ejecuta automaticamente y configura la IP actual en `ALLOWED_ORIGINS`.

### 4.2 Acceso Manual

```batch
scripts\status.bat
:: Anotar la IP que aparece (ej: 192.168.1.108)
:: Desde otra PC en la misma red, abrir:
:: http://192.168.1.108
```

### 4.3 DHCP: Cuando Cambia la IP

Si la IP del servidor cambia (tipico en DHCP):

```batch
:: Solucion: simplemente reiniciar
scripts\start.bat
:: Esto re-ejecuta auto-env.bat con la nueva IP
```

---

## 5. Configuracion de SSL / HTTPS

### 5.1 SSL Autofirmado (Desarrollo / LAN)

```batch
scripts\setup-ssl.bat
:: Genera certificados en ./ssl/
:: Luego reiniciar: scripts\start.bat
```

Acceder via `https://<IP>` (el navegador mostrara advertencia de seguridad — aceptar).

### 5.2 SSL con Let's Encrypt (Produccion con Dominio Real)

```bash
:: Instalar certbot en el servidor
:: https://certbot.eff.org/

:: Generar certificado
certbot certonly --standalone -d tudominio.com -d www.tudominio.com

:: Copiar certificados a ./ssl/
copy C:\Certbot\live\tudominio.com\fullchain.pem ssl\cert.pem
copy C:\Certbot\live\tudominio.com\privkey.pem ssl\key.pem

:: Establecer PRODUCTION_DOMAIN en .env
PRODUCTION_DOMAIN=tudominio.com
```

---

## 6. Configuracion de Correo (SMTP)

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

## 7. Respaldo y Restauracion

### 7.1 Respaldo Manual

```batch
:: Respaldo completo via web (interfaz Admin > Backups)
:: O via linea de comandos:

cd server
npm run backup:full
:: Genera archivo en ./backups/backup_YYYYMMDD_HHmmss.dump
```

### 7.2 Respaldo de Solo Esquema

```bash
cd server
npm run backup:schema
```

### 7.3 Respaldo Automatico (Programado)

Configurar una tarea programada en Windows:

```batch
:: Abrir Programador de Tareas
:: Crear tarea: Ejecutar diariamente
:: Comando: C:\LogMaster\server\node_modules\.bin\ts-node C:\LogMaster\server\src\scripts\backup.ts
```

### 7.4 Restauracion

Via web: Admin > Backups > Seleccionar respaldo > Restaurar

Via CLI:
```bash
docker exec -i logmaster-postgres pg_restore -U postgres -d visitors < ./backups/backup_20260311_120000.dump
```

---

## 8. Actualizacion del Sistema

### 8.1 Actualizar Desde Git

```bash
git pull
docker-compose down
docker-compose up -d --build
```

### 8.2 Migraciones de Base de Datos

Las migraciones SQL se ejecutan automaticamente al iniciar el servidor. Si se agrega una nueva migracion:

```bash
cd server
npm run migrate
```

### 8.3 Verificar Version

```bash
:: La version actual se muestra en:
scripts\status.bat
:: O en el footer de la interfaz web
```

---

## 9. Monitoreo y Mantenimiento

### 9.1 Estado del Sistema

```batch
scripts\status.bat
:: Muestra: contenedores, IPs, URLs, versión
```

### 9.2 Monitoreo Continuo

```batch
scripts\monitor-health.bat
:: Muestra en tiempo real: HTTP status, uso de RAM, espacio en disco
```

### 9.3 Logs

```bash
docker-compose logs -f server   # Logs del backend
docker-compose logs -f client   # Logs de nginx
docker-compose logs -f postgres # Logs de BD

:: Logs locales (montados en host)
.\logs\server\        # Winston daily rotate
.\logs\client\        # nginx access/error
```

### 9.4 Verificar Espacio en Disco

```bash
cd server && npm run backup:monitor
:: Muestra el tamano de la tabla Visitors
```

---

## 10. Solucion de Problemas

### 10.1 Docker Desktop no arranca

| Sintoma | Solucion |
|---|---|
| "Docker Desktop is not running" | Abrir Docker Desktop desde menu inicio, esperar "Engine running" |
| WSL2 error | `wsl --update` desde PowerShell como Admin |
| Virtualizacion desactivada | Activar VT-x en BIOS |

### 10.2 Contenedor no inicia

| Sintoma | Verificar | Solucion |
|---|---|---|
| postgres crash | `docker-compose logs postgres` | `docker-compose down -v && docker-compose up -d` |
| server crash | `docker-compose logs server` | Verificar JWT_SECRET en .env |
| client no responde | `docker-compose logs client` | Verificar que server este healthy |

### 10.3 "Connection refused" a BD

```
Esperar 10-30s a que PostgreSQL termine de iniciar.
  o
docker-compose restart postgres
  o
Verificar DB_HOST/DB_PORT en .env
```

### 10.4 Error "JWT_SECRET must be set"

```env
:: Agregar al .env:
JWT_SECRET=<generar-con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```

### 10.5 CORS error en navegador

```batch
:: Re-ejecutar configuracion de red
scripts\auto-env.bat
docker-compose restart server
```

### 10.6 Error "ECONNREFUSED" desde el cliente

```batch
:: Verificar que el servidor este accesible
curl http://localhost:3000/api/v1/health

:: Si no responde, revisar logs del servidor
docker-compose logs server
```

### 10.7 Base de Datos Corrupta

```batch
:: ADVERTENCIA: Esto borra TODOS los datos
docker-compose down -v
scripts\start.bat
```

### 10.8 "Token has been revoked"

```batch
:: Cerrar sesion en el navegador y volver a iniciar
:: Si persiste, limpiar localStorage del navegador
```

### 10.9 "Too Many Requests" (429)

```
Esperar 1 minuto y reintentar (rate limit general)
  o
Esperar 5 minutos para operaciones admin
```

### 10.10 "PASSWORD_CHANGE_REQUIRED" (403)

```
La politica de seguridad exige cambiar la contrasena.
Usar: Configuracion > Cambiar Contrasena
```

---

## 11. Preguntas Frecuentes

**Q: Puedo ejecutar sin Docker?**  
R: Si, es el Metodo 2 (Instalacion Manual). Requiere Node.js y PostgreSQL instalados.

**Q: Como cambio el puerto del cliente web?**  
R: Editar `.env`: `CLIENT_HTTP_PORT=8080` y reiniciar.

**Q: Los datos se pierden al actualizar?**  
R: No. Los volumenes Docker persisten los datos. Usar `docker-compose down -v` SOLO si se desea resetear.

**Q: Puedo acceder desde internet?**  
R: Si, pero requiere dominio, SSL configurado y `PRODUCTION_DOMAIN` en .env. No recomendado sin HTTPS.

**Q: Como agrego un usuario?**  
R: Iniciar sesion como Admin > Usuarios > Crear usuario.

**Q: Que pasa si olvido mi contrasena?**  
R: Contactar al SuperAdmin para que la resetee desde Admin > Usuarios > Reset Password.

**Q: Como hago una copia de seguridad?**  
R: Admin > Backups > Crear Backup. O via `npm run backup` desde la raiz.

---

## 12. Referencia Rapida de Comandos

```bash
# === DOCKER ===
docker-compose up -d            # Iniciar servicios
docker-compose down             # Detener (datos persisten)
docker-compose down -v          # Detener y borrar datos
docker-compose logs -f server   # Ver logs del backend
docker-compose ps               # Estado de contenedores

# === DESARROLLO ===
npm run dev                     # Iniciar cliente + servidor
npm run install-all             # Instalar todas las dependencias
npm test                        # Ejecutar todas las pruebas
cd server && npm test           # Pruebas del servidor
cd client && npm test           # Pruebas del cliente

# === RESPALDOS ===
cd server && npm run backup:full      # Backup completo
cd server && npm run backup:schema    # Solo esquema
cd server && npm run backup:monitor   # Ver tamano BD

# === SCRIPTS WINDOWS ===
scripts\start.bat               # Iniciar todo
scripts\detener.bat             # Detener todo
scripts\status.bat              # Estado del sistema
scripts\verify-system.bat       # Verificacion completa
scripts\auto-env.bat            # Reconfigurar IP
scripts\setup-ssl.bat           # Generar SSL
scripts\monitor-health.bat      # Monitoreo en vivo
scripts\deploy.bat              # Despliegue completo
```
