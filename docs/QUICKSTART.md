# LogMaster - Inicio Rápido

Guía mínima para ejecutar LogMaster en cualquier PC con Windows.

---

## Requisitos

- **Windows 10/11** (64-bit)
- **Docker Desktop** instalado y corriendo
  - Descargar: https://www.docker.com/products/docker-desktop
  - Durante instalación: activar WSL2 cuando lo solicite

---

## Instalación (Primera Vez)

1. **Descargar el proyecto**
   - Extraer el ZIP en cualquier carpeta (ej: `C:\LogMaster`)

2. **Ejecutar**
   - Doble clic en: `scripts\start.bat`
   - Esperar 3-5 minutos (construcción inicial)

3. **Acceder**
   - El navegador se abre automáticamente en `http://localhost`
   - Login: `1234567890` / `admin123`

---

## Uso Diario

| Acción | Comando |
|--------|---------|
| **Iniciar** | `scripts\start.bat` |
| **Detener** | `scripts\detener.bat` |
| **Ver estado** | `scripts\status.bat` |
| **Verificar sistema** | `scripts\verify-system.bat` |

---

## Acceso desde Otra PC (Red LAN)

1. Obtener IP del servidor:
   ```
   scripts\status.bat
   ```
   (muestra la IP, ej: `192.168.1.108`)

2. Desde otra PC en la misma red:
   - Abrir navegador: `http://192.168.1.108`

---

## Solución de Problemas

### "Docker Desktop no esta corriendo"
- Abrir Docker Desktop desde el menú Inicio
- Esperar que diga "Engine running" en verde
- Reintentar `scripts\start.bat`

### API no responde
```batch
scripts\monitor-health.bat
```
Ver logs en tiempo real.

### Base de datos corrupta
```batch
docker-compose down -v
scripts\start.bat
```
⚠️ Esto borra todos los datos.

---

## Estructura de Contenedores

```
┌─────────────────────────────────────┐
│         Docker Desktop              │
├─────────────┬───────────┬───────────┤
│  postgres   │  server   │  client   │
│   :5432     │  :3000    │   :80     │
│  (BLOBs)    │  (API)    │  (Web)    │
└─────────────┴───────────┴───────────┘
```

- **PostgreSQL**: Base de datos + fotos (BLOB)
- **Server**: API REST Node.js
- **Client**: Interfaz web React

---

## Credenciales de Prueba

| Rol | Cédula | Contraseña |
|-----|--------|------------|
| Admin | `1234567890` | `admin123` |
| Guardia | `0987654321` | `guard123` |

---

## Soporte

- Documentación completa: `docs/`
- Estado del sistema: `scripts\status.bat`
- Verificación completa: `scripts\verify-system.bat`
