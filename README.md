# LogMaster - Sistema de Gestión de Visitas

LogMaster es una aplicación web moderna y segura para la gestión de visitantes en empresas, desarrollada con React, Node.js, TypeScript y Docker. Sistema perfeccionado con seguridad de nivel empresarial, monitoreo completo y CI/CD automatizado.

## 🚀 Características Principales

- **Control de Acceso Completo**: Check-in/check-out de visitantes con registro fotográfico
- **Seguridad Robusta**: Base de datos PostgreSQL con cifrado de campos sensibles con AES-256-GCM
- **Gestión de Usuarios**: Sistema de roles (Admin, Guardia, Auditor) con autenticación JWT
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

## ⚡ Inicio Rápido (Docker Portable)

Sistema completo en 3 contenedores. Solo necesitas Docker Desktop.

### Requisitos

- Docker Desktop instalado y corriendo: https://www.docker.com/products/docker-desktop

### Ejecutar (Primera vez)

```bash
# Doble clic en:
scripts\start.bat

# Esperar 3-5 minutos (construcción inicial)
# Navegador se abre automáticamente en http://localhost
```

### Uso Diario

| Acción            | Script                      |
| ----------------- | --------------------------- |
| Iniciar           | `scripts\start.bat`         |
| Detener           | `scripts\detener.bat`       |
| Ver estado        | `scripts\status.bat`        |
| Verificar sistema | `scripts\verify-system.bat` |

### Acceso desde Red LAN

1. Ejecutar `scripts\status.bat` para ver la IP (ej: `192.168.1.108`)
2. Desde otra PC: `http://192.168.1.108`

Ver guía completa: [`docs/QUICKSTART.md`](docs/QUICKSTART.md)

### Instalación para Desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/logmaster.git
cd logmaster

# Instalar dependencias en todos los módulos
npm run install-all

# Configurar variables de entorno
cp .env.example .env
# Edita .env con tus claves de seguridad

# Iniciar en modo desarrollo
npm run dev
```

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

- **[Inicio Rápido](docs/QUICKSTART.md)** 🚀: Guía mínima para ejecutar en cualquier PC
- **[Guía de Instalación](docs/SETUP.md)**: Instrucciones detallas de instalación
- **[Docker](docs/DOCKER.md)**: Stack de 3 contenedores y despliegue
- **[API](docs/API.md)**: Documentación de endpoints REST
- **[Manual de Usuario](docs/USER_MANUAL.md)**: Guía operativa por rol
- **[Roadmap](docs/ROADMAP.md)**: Plan de desarrollo y características futuras
- **[Credenciales Seed](docs/SEED_CREDENTIALS.md)**: Usuarios y contraseñas de desarrollo

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

### Desktop

- **Electron** - Wrapper de aplicación de escritorio
- **Electron Builder** - Empaquetado

## 🎯 Roles y Permisos

| Rol         | Permisos                                                                            |
| ----------- | ----------------------------------------------------------------------------------- |
| **Admin**   | Acceso completo: gestión de usuarios, configuración del sistema, todos los reportes |
| **Guardia** | Check-in/check-out de visitantes, ver visitas activas, reportes básicos             |
| **Auditor** | Solo lectura: ver logs de auditoría, generar reportes, sin modificar datos          |

## 📦 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Inicia cliente y servidor en modo desarrollo
npm run client           # Solo cliente React
npm run server           # Solo servidor Express

# Producción
npm run dist             # Genera ejecutable de producción
npm run build:server     # Compila servidor TypeScript

# Electron
npm run electron:dev     # Inicia aplicación Electron en desarrollo
npm run electron:start   # Inicia Electron (requiere build previo)

# Instalación
npm run install-all      # Instala dependencias en todos los módulos

# Scripts Windows (Batch)
scripts\start.bat         # Iniciar todo (detecta primera vez o reinicio)
scripts\detener.bat       # Detener servicios
scripts\status.bat        # Ver estado de contenedores y URLs
scripts\verify-system.bat # Verificación completa del sistema
scripts\auto-env.bat      # Reconfigurar IP y entorno
scripts\setup-ssl.bat     # Generar certificados SSL
scripts\monitor-health.bat # Monitoreo continuo avanzado
```

## 🗂️ Estructura del Proyecto

```
logmaster/
├── scripts/             # Scripts de automatización (Windows)
│   ├── start.bat          # Iniciar todo (inteligente: build si es primera vez)
│   ├── detener.bat        # Detener servicios
│   ├── status.bat         # Ver estado y URLs de acceso
│   ├── verify-system.bat  # Verificación completa del sistema
│   ├── auto-env.bat       # Auto-detecta IP y configura .env
│   ├── setup-ssl.bat      # Generar certificados SSL
│   └── monitor-health.bat # Monitoreo continuo
├── docs/                # Documentación centralizada (7 archivos)
│   ├── QUICKSTART.md      # 🚀 Guía mínima (Docker Portable)
│   ├── SETUP.md           # Guía completa de instalación
│   ├── DOCKER.md          # Stack de 3 contenedores
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
├── electron/            # Configuración Electron
├── data/                # Base de datos PostgreSQL
├── backups/             # Respaldos automáticos
├── README.md            # Documentación principal
└── docker-compose.yml   # Configuración Docker
```

## 🔄 Flujo de Trabajo Típico

1. **Guardia inicia sesión** con sus credenciales
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

- Verifica que PostgreSQL esté corriendo en el puerto configurado
- Comprueba que las variables de entorno `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` estén configuradas
- Revisa que Docker esté corriendo si usas docker-compose

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
