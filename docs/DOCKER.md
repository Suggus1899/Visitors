# Docker — LogMaster

Stack completo de 3 contenedores para produccion y desarrollo con Docker.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-compose.yml                        │
├──────────────┬──────────────────┬───────────────────────────┤
│  PostgreSQL  │     Server       │         Client            │
│  :5432       │     :3000        │    :80 (HTTP)             │
│              │  (Express API)   │    :443 (HTTPS/SSL)       │
│              │                  │  nginx + proxy → /api     │
└──────────────┴──────────────────┴───────────────────────────┘
```

| Contenedor           | Imagen                  | Funcion             |
| -------------------- | ----------------------- | ------------------- |
| `logmaster-postgres` | postgres:16-alpine      | Base de datos       |
| `logmaster-server`   | node:20-alpine (custom) | API REST            |
| `logmaster-client`   | nginx:alpine (custom)   | SPA + proxy reverso |

## Inicio Rapido

### Opcion 1: Script automatico (recomendado)

```bash
scripts\deploy.bat
```

Detecta IP, configura .env, crea directorios, construye imagenes y levanta todo.

### Opcion 2: Manual

```bash
# 1. Configurar entorno
scripts\auto-env.bat

# 2. Levantar servicios
docker-compose up -d --build

# 3. Verificar
docker-compose ps
```

## Comandos Utiles

```bash
# Levantar
docker-compose up -d

# Detener (datos persisten)
docker-compose down

# Ver logs en tiempo real
docker-compose logs -f

# Logs de un servicio especifico
docker-compose logs -f server

# Estado de contenedores
docker-compose ps

# Reset completo (BORRA DATOS)
docker-compose down -v
```

## Puertos

| Servicio     | Puerto Host | Puerto Container |
| ------------ | ----------- | ---------------- |
| PostgreSQL   | 5432        | 5432             |
| API Server   | 3000        | 3000             |
| Client HTTP  | 80          | 80               |
| Client HTTPS | 443         | 443              |

## Volumenes (datos persistentes)

| Volumen           | Ruta Host            | Proposito           |
| ----------------- | -------------------- | ------------------- |
| `postgres_data`   | `./data/postgres`    | Datos PostgreSQL    |
| `postgres_backup` | `./backups/postgres` | Backups DB          |
| `photos_data`     | `./data/photos`      | Fotos de visitantes |
| `server_logs`     | `./logs/server`      | Logs del backend    |
| `client_logs`     | `./logs/client`      | Logs nginx          |

## Backups

```bash
# Backup completo via la aplicacion (encriptado)
# Usar la interfaz web: Menu Admin > Backups

# Backup manual con pg_dump
docker exec logmaster-postgres pg_dump -Fc -U postgres visitors > backups/manual.dump

# Restaurar
docker exec -i logmaster-postgres pg_restore -U postgres -d visitors < backups/manual.dump
```

## Conexion Externa (pgAdmin / DBeaver)

- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `visitors`
- **User**: `postgres`
- **Password**: (ver `.env`)

```bash
# CLI psql
docker exec -it logmaster-postgres psql -U postgres -d visitors
```

## Troubleshooting

| Problema                  | Solucion                                                     |
| ------------------------- | ------------------------------------------------------------ |
| "Connection refused"      | PostgreSQL iniciando. Esperar 10-30s.                        |
| "Database does not exist" | `docker-compose down -v && docker-compose up -d`             |
| Client no carga           | Verificar que server este healthy: `docker-compose ps`       |
| Puertos ocupados          | Cambiar puertos en `.env`: `SERVER_PORT`, `CLIENT_HTTP_PORT` |

## Especificaciones

- **PostgreSQL**: v16-alpine, 256MB shared memory, UTF-8
- **Server**: node:20-alpine, max 512MB RAM, healthcheck en `/api/v1/health`
- **Client**: nginx:alpine, max 256MB RAM, SSL con certs en `./ssl/`
- **Red**: bridge network `logmaster-network`
