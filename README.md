# LogMaster - Sistema de Gestión de Visitas

LogMaster es una aplicación web moderna y segura para la gestión de visitantes en empresas, desarrollada con React, Node.js, TypeScript y PostgreSQL. La versión integral conserva la estructura existente y añade controles de permisos, privacidad y sesiones verificados en un entorno independiente.

## 🚀 Características Principales

- **Control de Acceso Completo**: Check-in/check-out de visitantes con registro fotográfico
- **Seguridad Robusta**: Base de datos PostgreSQL con cifrado de campos sensibles con AES-256-GCM
- **Gestión de Usuarios**: Sistema de roles (Root, Admin, Operador, Auditor, Demo) con autenticación JWT
- **Reportes Avanzados**: Exportación a PDF y Excel con filtros personalizables
- **Auditoría Completa**: Registro detallado de todas las operaciones del sistema
- **Respaldos Automáticos**: Copias de seguridad cifradas programables
- **Interfaz Moderna**: UI responsive con React y Tailwind CSS

## 📋 Requisitos del Sistema

- **Sistema Operativo**: Windows 10/11 (64-bit)
- **RAM**: Mínimo 4GB
- **Espacio en Disco**: 2 GB para dependencias y entorno local + espacio para datos
- **Resolución**: Mínimo 1366x768
- **Node.js**: 22.12 o superior (o 20.19 o superior)
- **PostgreSQL**: 16
- **PowerShell**: 7 para los comandos locales
- **pnpm**: 12.4.2 (fijado en packageManager)

## ⚡ Inicio Rápido

El entorno de validación usa PostgreSQL 16 en `127.0.0.1:55432` y Mailpit en `127.0.0.1:1025`. Sus binarios, datos, correo y respaldos quedan fuera del repositorio, en `../Visitors-local`. Las bases `logmaster_dev`, `logmaster_test` y `logmaster_restore_test` tienen roles y claves independientes.

Desde PowerShell 7, en la raíz del proyecto:

```powershell
pnpm install --frozen-lockfile
pnpm run local:setup
pnpm run local:prepare
pnpm run local:start
```

El cliente abre en http://localhost:5173 y la API en http://localhost:3000. El buzón de pruebas abre en http://127.0.0.1:8025 y captura los mensajes sin entregarlos a destinatarios externos. La primera descarga de PostgreSQL y Mailpit requiere conexión a Internet.

`local:setup` genera `.env.logmaster-dev.local`, `.env.logmaster-test.local` y `.env.logmaster-restore_test.local`, ignorados por Git. Estos archivos contienen las credenciales locales, la contraseña adicional `EDIT_PASSWORD` y las claves de semillas `SEED_*_PASSWORD`. El usuario root inicial es `trebolmaster`; su contraseña inicial proviene de `SEED_ROOT_PASSWORD` y exige un cambio al entrar. Las cuentas operativas nuevas requieren correo; las existentes pueden mantenerlo vacío.

`local:prepare` crea el esquema únicamente en una base local vacía, ejecuta migraciones y prepara usuarios ficticios. El arranque habitual comprueba conexión y migraciones pendientes sin sincronizar tablas ni insertar semillas. `DOTENV_CONFIG_PATH` selecciona el entorno explícitamente; la retención está desactivada en validación. Los comandos locales no leen la base anterior ni sus respaldos.

Para uso diario: `pnpm run local:start`. Para validar:

```powershell
pnpm run test
pnpm run test:integration
pnpm run build
pnpm run typecheck:client
```

Las pruebas de integración vacían solo `logmaster_test`, utilizan datos ficticios y restauran los respaldos exclusivamente en `logmaster_restore_test`. No configures ese comando con una base operativa.

### Cambios de API y esquema

- La edición y rectificación exigen `editPassword` en cada guardado y obtienen el actor de la sesión. Operador, admin y root pueden editar; solo admin y root pueden bloquear, cancelar datos y administrar respaldos. Root administra cuentas. Auditor y demo consultan sin modificar información operativa.
- Ambas rutas de fotografías exigen Bearer token y responden con `Cache-Control: private, no-store`. El cliente usa Blob y revoca las URLs temporales al cerrar sus vistas.
- Las consultas incluyen bloqueo, observaciones, historial, anfitrión, departamento, vehículo y fechas. Las listas y formularios conservan el perfil completo al editar.
- El reporte mensual devuelve visitantes únicos, porcentaje de cierre y duración promedio en su resumen; el cliente adapta ese resumen y los motivos para mostrar y exportar las mismas cifras.
- La migración `009-stabilization.ts` agrega `Users.email`, `Users.tokenVersion` y `Visitors.anonymizedAt`; permite `VisitorEditHistories.visitId = null`, cifra el historial previo y elimina valores de fotografías del historial. Normaliza las columnas antiguas de fechas escritas en UTC a TIMESTAMPTZ y amplía el cargo cifrado a TEXT.
- Un índice parcial impide dos visitas abiertas por visitante. La migración informa los IDs duplicados y se detiene sin eliminarlos.
- Cancelar con una visita en espera, activa o intermitente devuelve `409 OPEN_VISIT_EXISTS`. Después del cierre, la cancelación elimina datos personales y fotos de la base activa en una transacción, conserva eventos anonimizados y permite crear un perfil independiente al registrar la misma cédula.
- Cambiar o restablecer una contraseña invalida sesiones anteriores mediante una versión persistente, incluso tras reiniciar. La recuperación utiliza enlaces `/#/reset-password?token=...`, hash del token, vencimiento de 15 minutos y uso único. El restablecimiento por root exige cambio obligatorio posterior.

El SMTP de producción necesita configuración y prueba con el proveedor elegido. Los respaldos históricos pueden conservar datos personales cancelados: deben revisarse antes de restaurarlos. Las guías anteriores en `docs/` conservan instrucciones de la versión previa; esta sección describe el entorno y contratos de estabilización.

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
- **Tailwind CSS 3 y shadcn/ui** - Estilos, controles y diálogos accesibles
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
| **Demo**      | Consulta de visitas; sin modificaciones operativas                                  |

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

© 2026 Gustavo Colina (@Suggus1899). Todos los derechos reservados.

Este software y su código fuente son propiedad exclusiva de Gustavo Colina (@Suggus1899).

No está permitido copiar, modificar, distribuir, sublicenciar ni usar este código, total o parcialmente, sin autorización expresa y por escrito del autor.
No está permitido usar este código con fines comerciales ni privados sin una licencia válida.
Cualquier uso no autorizado constituye una violación de los derechos de autor y será perseguido conforme a la ley.
Este es un software propietario. No es código abierto (open source) ni software libre.

## 👥 Soporte

Para reportar problemas o solicitar características:

- Abre un issue en GitHub
- Contacta al equipo de desarrollo

## 🔄 Actualizaciones

El sistema verifica automáticamente actualizaciones al iniciar. Las actualizaciones se descargan e instalan de forma segura.

---

**Versión**: 1.0.0  
**Última actualización**: 2026
