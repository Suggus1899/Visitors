# LogMaster - Inicio Rápido

Guía mínima para ejecutar LogMaster en cualquier PC con Windows.

---

## Requisitos

- **Windows 10/11** (64-bit)
- **Node.js 20.x LTS** instalado
- **PostgreSQL 16** instalado y corriendo en el puerto 5432

---

## Instalación (Primera Vez)

1. **Descargar el proyecto**
   - Extraer el ZIP en cualquier carpeta (ej: `C:\LogMaster`)

2. **Instalar dependencias**
   ```bash
   npm run install-all
   ```

3. **Configurar entorno**
   ```bash
   copy .env.example .env
   ```
   - Edita `.env` con tu contraseña de PostgreSQL y claves de seguridad

4. **Crear la base de datos**
   ```bash
   createdb -U postgres visitors
   ```

5. **Ejecutar**
   ```bash
   npm run dev
   ```

6. **Acceder**
   - Cliente: `http://localhost:5173`
   - API: `http://localhost:3000/api/v1`

---

## Uso Diario

| Acción | Comando |
|--------|---------|
| **Iniciar** | `npm run dev` |
| **Ver estado** | `scripts\status.bat` |

---

## Acceso desde Otra PC (Red LAN)

1. Obtener IP del servidor:
   ```
   scripts\status.bat
   ```
   (muestra la IP, ej: `192.168.1.108`)

2. Desde otra PC en la misma red:
   - Abrir navegador: `http://192.168.1.108:5173`

---

## Solución de Problemas

### API no responde
- Verifica que PostgreSQL esté corriendo: `pg_isready -h localhost -p 5432`
- Revisa que el puerto 3000 esté libre
- Verifica que `.env` tenga `DB_PASSWORD` configurada

### Base de datos corrupta
```bash
psql -U postgres -c "DROP DATABASE visitors;"
createdb -U postgres visitors
npm run dev
```
⚠️ Esto borra todos los datos.

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────┐
│         Navegador / Electron         │
└──────────────┬──────────────────────┘
               │ :5173 (Vite dev)
┌──────────────▼──────────────────────┐
│  Cliente React + TypeScript         │
│  (Vite + Tailwind CSS)              │
└──────────────┬──────────────────────┘
               │ /api/* → proxy :3000
┌──────────────▼──────────────────────┐
│  Servidor Express + TypeScript      │
│  (API REST + JWT + SSE)             │
└──────────────┬──────────────────────┘
               │ :5432
┌──────────────▼──────────────────────┐
│  PostgreSQL 16                      │
│  (Datos + fotos BLOB + cifrado PII) │
└─────────────────────────────────────┘
```

- **PostgreSQL**: Base de datos + fotos (BLOB) + cifrado AES-256-GCM
- **Server**: API REST Node.js en puerto 3000
- **Client**: Interfaz web React en puerto 5173

---

## Credenciales de Prueba

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| Root | `trebolmaster` | `TrebolMaster2026!` |
| Admin | `Admin@trebol.com` | `Trebol123*` |
| Operador | `operador` | `Operador2026!` |
| Auditor | `auditor` | `Audit2026!@#` |
| Demo | `demo` | `Demo123!@#` |

---

## Soporte

- Documentación completa: `docs/`
- Estado del sistema: `scripts\status.bat`
