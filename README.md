# LogMaster - Sistema de Gestión de Visitas

LogMaster es una aplicación web moderna y segura para la gestión de visitantes en empresas, desarrollada con React, Node.js, TypeScript y PostgreSQL. Sistema perfeccionado con seguridad de nivel empresarial, monitoreo completo y CI/CD automatizado.

## 🚀 Características Principales

- **Control de Acceso Completo**: Check-in/check-out de visitantes con registro fotográfico
- **Seguridad Robusta**: Base de datos PostgreSQL con cifrado de campos sensibles con AES-256-GCM
- **Gestión de Usuarios**: Sistema de roles (Root, Admin, Operador, Auditor, Demo) con autenticación JWT
- **Reportes Avanzados**: Exportación a PDF y Excel con filtros personalizables
- **Auditoría Completa**: Registro detallado de todas las operaciones del sistema
- **Respaldos Automáticos**: Copias de seguridad cifradas programables
- **Interfaz Moderna**: UI responsive con React y Tailwind CSS
- **Aplicación de Escritorio**: Ejecutable standalone sin dependencias externas

## 📋 Requisitos del Sistema

- **Sistema Operativo**: Windows 10/11 (64-bit)
- **RAM**: Mínimo 4GB
- **Espacio en Disco**: 500MB para instalación + espacio para datos
- **Resolución**: Mínimo 1366x768
- **Node.js**: 20.x LTS
- **PostgreSQL**: 16

## ⚡ Inicio Rápido

### Requisitos

- Node.js 20.x LTS instalado
- PostgreSQL 16 instalado y corriendo en el puerto 5432

### Ejecutar (Primera vez)

```bash
# 1. Clonar el repositorio
git clone https://github.com/Suggus1899/Visitors.git
cd Visitors

# 2. Instalar dependencias en todos los módulos
pnpm run install-all

# 3. Configurar variables de entorno
copy .env.example .env
# Edita .env con tu contraseña de PostgreSQL y claves de seguridad

# 4. Crear la base de datos
createdb -U postgres visitors

# 5. Iniciar en modo desarrollo
pnpm run dev
```

El servidor corre en `http://localhost:3000` y el cliente en `http://localhost:5173`.

### Uso Diario

```bash
pnpm run dev    # Inicia cliente y servidor
```

O usa el script de Windows:

```bash
scripts\start.bat    # Inicia el sistema
scripts\status.bat   # Ver estado y URLs
```

### Acceso desde Red LAN

1. Ejecutar `scripts\status.bat` para ver la IP (ej: `192.168.1.108`)
2. Desde otra PC: `http://192.168.1.108:5173`

Ver guía completa: [`docs/QUICKSTART.md`](docs/QUICKSTART.md)

## 🔐 Configuración de Seguridad

**IMPORTANTE**: Antes de usar en producción, genera claves seguras:

```bash
# Generar secreto JWT (128 caracteres hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generar clave de cifrado de campos (64 caracteres hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Agrega estas claves a tu archivo `.env`:

```env
JWT_SECRET=tu_secreto_jwt_de_128_caracteres_aqui
ENCRYPTION_KEY=tu_clave_de_cifrado_de_64_caracteres_aqui
DB_HOST=localhost
DB_PORT=5432
DB_NAME=visitors
DB_USER=postgres
DB_PASSWORD=tu_contraseña_postgres
```

## 📚 Documentación

- **[Manual Tecnico](docs/MANUAL_TECNICO.md)**: Arquitectura, base de datos, API, seguridad, despliegue
- **[Manual de Instalacion](docs/MANUAL_INSTALACION.md)**: Instalacion completa desde cero, troubleshooting
- **[Manual de Usuario](docs/USER_MANUAL.md)**: Guia operativa completa por rol
- **[Inicio Rapido](docs/QUICKSTART.md)**: Guia minima para ejecutar en cualquier PC
- **[Guia de Instalacion](docs/SETUP.md)**: Instrucciones detalladas de instalacion
- **[API](docs/API.md)**: Documentacion de endpoints REST
- **[Seguridad](docs/SECURITY.md)**: Configuracion de seguridad, JWT, cifrado, firewall
- **[LAN](docs/LAN_SETUP.md)**: Acceso desde red local
- **[Arquitectura](docs/ARCHITECTURE.md)**: Estructura del sistema y flujo de datos
- **[Roadmap](docs/ROADMAP.md)**: Plan de desarrollo y caracteristicas futuras
- **[Credenciales Seed](docs/SEED_CREDENTIALS.md)**: Usuarios y contrasenas de desarrollo

## 🏗️ Stack Tecnológico

### Frontend

- **React 18** - Framework UI
- **TypeScript** - Tipado estático
- **Tailwind CSS** - Estilos
- **Vite** - Build tool
- **Lucide React** - Iconos

### Backend

- **Node.js** - Runtime
- **Express** - Framework web
- **Sequelize** - ORM
- **PostgreSQL** - Base de datos relacional
- **JWT** - Autenticación

## 🎯 Roles y Permisos

| Rol           | Permisos                                                                            |
| ------------- | ----------------------------------------------------------------------------------- |
| **Root**      | Acceso total: dashboard SuperAdmin (`/root`), gestión de usuarios, ops, auditoría   |
| **Admin**     | Gestión completa: respaldos, reportes, auditoría. No crea/modifica/elimina usuarios |
| **Operador**  | Check-in/check-out de visitantes, ver visitas activas, reportes básicos             |
| **Auditor**   | Solo lectura: ver logs de auditoría, generar reportes, sin modificar datos          |
| **Demo**      | Operaciones con auto-tour guiado interactivo                                        |

## 📦 Scripts Disponibles

```bash
# Desarrollo
pnpm run dev              # Inicia cliente y servidor en modo desarrollo
pnpm run client           # Solo cliente React
pnpm run server           # Solo servidor Express

# Producción
pnpm run build:server     # Compila servidor TypeScript

# Instalación
pnpm run install-all      # Instala dependencias en todos los módulos

# Scripts Windows (Batch)
scripts\start.bat         # Iniciar sistema
scripts\status.bat        # Ver estado y URLs de acceso
```

## 🗂️ Estructura del Proyecto

```
Visitors/
├── scripts/             # Scripts de automatización (Windows)
│   ├── start.bat          # Iniciar sistema
│   └── status.bat         # Ver estado y URLs de acceso
├── docs/                # Documentación centralizada
│   ├── QUICKSTART.md      # Guía mínima para ejecutar
│   ├── SETUP.md           # Guía completa de instalación
│   ├── API.md             # Documentación de endpoints
│   ├── USER_MANUAL.md     # Manual operativo por rol
│   ├── ROADMAP.md         # Plan de desarrollo
│   └── SEED_CREDENTIALS.md # Usuarios/contraseñas de desarrollo
├── client/              # Frontend React
│   ├── src/
│   │   ├── components/  # Componentes UI
│   │   ├── context/     # Estado global
│   │   └── types/       # Tipos TypeScript
│   └── package.json
├── server/              # Backend Node.js
│   ├── src/
│   │   ├── domain/      # Entidades y lógica de negocio
│   │   ├── application/ # Casos de uso
│   │   ├── infrastructure/ # Implementaciones
│   │   ├── controllers/ # Controladores HTTP
│   │   └── routes/      # Definición de rutas
│   └── package.json
├── backups/             # Respaldos automáticos
├── README.md            # Documentación principal
└── .env                 # Variables de entorno (no commitear)
```

## 🔄 Flujo de Trabajo Típico

1. **Operador inicia sesión** con sus credenciales
2. **Registra visitante** con foto y datos personales
3. **Check-in** al ingresar a las instalaciones
4. **Check-out** al salir
5. **Admin revisa reportes** diarios/semanales
6. **Auditor consulta logs** para auditorías de seguridad

## 🛡️ Características de Seguridad

- ✅ Base de datos PostgreSQL con conexión segura
- ✅ Cifrado de campos sensibles (nombres, documentos, emails)
- ✅ Autenticación JWT con tokens de acceso y refresh
- ✅ Rate limiting para prevenir ataques de fuerza bruta
- ✅ Validación de entrada en todos los endpoints
- ✅ Logs de auditoría inmutables
- ✅ Respaldos cifrados con contraseña
- ✅ Protección contra inyección SQL (ORM)
- ✅ CORS configurado para seguridad

## 🐛 Solución de Problemas

### La aplicación no inicia

- Verifica que el puerto 3000 esté disponible
- Revisa los logs en `server/server_health.log`
- Asegúrate de tener todas las dependencias instaladas

### Error de base de datos

- Verifica que PostgreSQL esté corriendo en el puerto 5432
- Comprueba que las variables de entorno `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` estén configuradas
- Verifica que la base de datos `visitors` exista

### Problemas de autenticación

- Verifica que `JWT_SECRET` esté configurado
- Limpia cookies del navegador
- Revisa que el usuario no esté bloqueado (max intentos)

## 📝 Licencia

Este proyecto es privado y propietario. Todos los derechos reservados.

## 👥 Soporte

Para reportar problemas o solicitar características:

- Abre un issue en GitHub
- Contacta al equipo de desarrollo

## 🔄 Actualizaciones

El sistema verifica automáticamente actualizaciones al iniciar. Las actualizaciones se descargan e instalan de forma segura.

---

**Versión**: 1.0.0  
**Última actualización**: 2026
