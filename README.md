# Sistema de Gestión de Visitantes

Sistema de escritorio profesional para el control de acceso y gestión de visitantes en instalaciones corporativas. Construido con Electron, React y Node.js, con arquitectura limpia y seguridad de nivel empresarial.

## 🚀 Características Principales

- **Control de Acceso Completo**: Check-in/check-out de visitantes con registro fotográfico
- **Seguridad Robusta**: Cifrado de base de datos con SQLCipher y cifrado de campos sensibles con AES-256-GCM
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

## ⚡ Inicio Rápido

### Instalación para Usuarios

1. Descarga el instalador desde [Releases](https://github.com/tu-usuario/visitor-system/releases)
2. Ejecuta `Visitor System-1.0.0-win.zip`
3. Extrae y ejecuta `Visitor System.exe`
4. Crea tu cuenta de administrador en el primer inicio

### Instalación para Desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/visitor-system.git
cd visitor-system

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
# Generar clave de cifrado de base de datos (64 caracteres hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generar secreto JWT (128 caracteres hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generar clave de cifrado de campos (64 caracteres hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Agrega estas claves a tu archivo `.env`:

```env
DB_ENCRYPTION_KEY=tu_clave_de_64_caracteres_aqui
JWT_SECRET=tu_secreto_jwt_de_128_caracteres_aqui
ENCRYPTION_KEY=tu_clave_de_cifrado_de_64_caracteres_aqui
```

## 📚 Documentación

- **[Arquitectura](docs/ARCHITECTURE.md)**: Estructura del sistema y patrones de diseño
- **[Seguridad](docs/SECURITY_AUDIT_REPORT.md)**: Hallazgos y estado de hardening de seguridad
- **[Guía de Instalación](docs/SETUP.md)**: Instrucciones detalladas de instalación y configuración
- **[API](docs/API.md)**: Documentación completa de endpoints REST
- **[Manual de Usuario](docs/USER_MANUAL.md)**: Guía operativa por rol

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
- **SQLCipher** - Base de datos cifrada
- **JWT** - Autenticación

### Desktop
- **Electron** - Wrapper de aplicación de escritorio
- **Electron Builder** - Empaquetado

## 🎯 Roles y Permisos

| Rol | Permisos |
|-----|----------|
| **Admin** | Acceso completo: gestión de usuarios, configuración del sistema, todos los reportes |
| **Guardia** | Check-in/check-out de visitantes, ver visitas activas, reportes básicos |
| **Auditor** | Solo lectura: ver logs de auditoría, generar reportes, sin modificar datos |

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
```

## 🗂️ Estructura del Proyecto

```
visitor-system/
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
├── docs/                # Documentación
├── data/                # Base de datos SQLite
└── Backups/             # Respaldos automáticos
```

## 🔄 Flujo de Trabajo Típico

1. **Guardia inicia sesión** con sus credenciales
2. **Registra visitante** con foto y datos personales
3. **Check-in** al ingresar a las instalaciones
4. **Check-out** al salir
5. **Admin revisa reportes** diarios/semanales
6. **Auditor consulta logs** para auditorías de seguridad

## 🛡️ Características de Seguridad

- ✅ Base de datos cifrada con SQLCipher (AES-256)
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
- Verifica que `DB_ENCRYPTION_KEY` esté configurada
- Comprueba permisos de escritura en carpeta `data/`
- Revisa que SQLCipher esté instalado correctamente

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
