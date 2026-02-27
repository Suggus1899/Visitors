# Cambios detallados (2026-02-09)

## Alcance
- Este documento resume los cambios actuales segun archivos modificados recientemente en el workspace.
- Se enfocan los cambios funcionales en backend y frontend. No se describen binarios ni dependencias instaladas.

## Backend (server)

### Configuracion y entorno
- Configuracion centralizada en [server/src/config/AppConfig.ts](server/src/config/AppConfig.ts).
  - Carga .env desde la raiz del proyecto.
  - Define rutas de base de datos y respaldos, claves de cifrado, JWT y limites de seguridad.
  - Incluye validacion estricta cuando NODE_ENV=production (exige claves sensibles).

### Base de datos cifrada (SQLCipher)
- Inicializacion y validacion de cifrado en [server/src/database.ts](server/src/database.ts).
  - Usa el driver @journeyapps/sqlcipher como reemplazo de sqlite3.
  - Aplica PRAGMA key, cipher_compatibility y cipher_migrate antes de cualquier consulta.
  - Falla el arranque si falta DB_ENCRYPTION_KEY o si la base no se puede abrir con la clave.

### Script de migracion a SQLCipher
- Migracion de base de datos plano -> cifrado en [server/src/scripts/migrate-sqlcipher.ts](server/src/scripts/migrate-sqlcipher.ts).
  - Adjunta una base cifrada, exporta con sqlcipher_export y genera un archivo visits.encrypted.sqlite.
  - Permite definir rutas por variables de entorno (SQLCIPHER_SOURCE/SQLCIPHER_TARGET).

### Arranque del servidor y performance
- Flujo de arranque en [server/src/server.ts](server/src/server.ts).
  - Inicializa cifrado, limpia tabla temporal de migraciones y aplica sync con alter.
  - Crea indices en visitas y actividad para acelerar consultas y reportes.
  - Ejecuta el seeding para datos de demo y luego inicia Express.

### Seeder de datos y usuarios demo
- Generacion de usuarios y datos en [server/src/utils/seeder.ts](server/src/utils/seeder.ts).
  - Crea Admin@puig.com, guard y admin legacy si no existen.
  - Asegura un usuario demo (demo/demo123).
  - Genera 30 visitantes y 90 visitas en enero 2026 si hay menos de 50 visitas.
  - Genera 30 visitas en febrero (25 activas + 5 completadas) para probar tablero.

### Modelo de Visitante cifrado
- Cifrado de campos sensibles en [server/src/models/Visitor.ts](server/src/models/Visitor.ts).
  - La PK es el hash de la cedula; se guarda encrypted_cedula para mostrarla.
  - Hooks beforeSave encriptan nombres, email, telefono y cargo.
  - getDecrypted() entrega datos descifrados al dominio.

### Repositorio de Visitantes (Clean Architecture)
- Implementacion Sequelize en [server/src/infrastructure/database/repositories/SequelizeVisitorRepository.ts](server/src/infrastructure/database/repositories/SequelizeVisitorRepository.ts).
  - Busqueda por cedula usando hash; busqueda parcial limitada por cifrado.
  - Filtros por empresa (no cifrada), email y telefono.
  - Mapea entidades del dominio usando datos descifrados.

### Controladores Clean Architecture
- Visitas en [server/src/controllers/VisitCleanController.ts](server/src/controllers/VisitCleanController.ts).
  - Check-in/check-out via use cases.
  - Validacion del id en check-out y uso de notas.
  - Listado paginado con filtros y meta (page, limit, totalPages).
- Visitantes en [server/src/controllers/VisitorCleanController.ts](server/src/controllers/VisitorCleanController.ts).
  - Obtiene visitantes por cedula y lista empresas con busqueda.

### Middlewares de seguridad y auditoria
- Roles de auditor en [server/src/middleware/auditor.ts](server/src/middleware/auditor.ts).
  - verifyAuditor permite auditor o admin.
  - denyAuditorOnly bloquea rutas operativas para auditor.
- JWT y rol admin en [server/src/middleware/auth.ts](server/src/middleware/auth.ts).
  - Verificacion de token Bearer y validacion de rol.
- Rate limits ajustados en [server/src/middleware/rateLimiter.ts](server/src/middleware/rateLimiter.ts).
  - Limites mas altos para uso en desarrollo.

### Respaldos cifrados
- Servicio de backups en [server/src/infrastructure/services/SqliteBackupService.ts](server/src/infrastructure/services/SqliteBackupService.ts).
  - Crea backups .sqlite.enc con AES-256-GCM + gzip.
  - Guarda IV al inicio y AuthTag al final del archivo.
  - Restaura backups cifrados o legacy .sqlite.

## Frontend (client)

### Capa de API y adaptacion de datos
- Cliente API en [client/src/services/api.v1.ts](client/src/services/api.v1.ts).
  - Axios con token Bearer y helper unwrapResponse estandar.
  - adaptVisit transforma payload V1 a estructura usada por UI.
  - Normaliza URL de foto y agrega cache-busting.

### Admin Dashboard
- Tablero principal en [client/src/components/AdminDashboard.tsx](client/src/components/AdminDashboard.tsx).
  - Tabs: Reportes, Calendario, Respaldos, Log de Actividades.
  - Filtros por estado, fechas y busqueda; paginacion server-side.
  - Ordenamiento por columnas en la pagina actual.
  - Exportacion a PDF y Excel desde el listado.
  - Calendario con react-big-calendar, toolbar personalizado y leyenda.
  - Modal de evento con checkout directo desde el calendario.
  - Colores de eventos por estado y motivo; resaltado de dias con mucha carga.
  - Alerta visual en header cuando hay alertas activas.
  - Manejo de timeout de sesion con modal de advertencia.

### Login y acceso
- Login mejorado en [client/src/components/Login.tsx](client/src/components/Login.tsx).
  - Validaciones con mensajes y toasts.
  - Redireccion segun rol (auditor -> /audit, resto -> /).
  - Carga rapida de credenciales demo y auditoria.

### Recuperacion de contrasena (UI)
- Pantalla de solicitud en [client/src/components/ForgotPassword.tsx](client/src/components/ForgotPassword.tsx).
  - Envia solicitud a /auth/forgot-password y muestra mensaje simulado.
- Pantalla de reset en [client/src/components/ResetPassword.tsx](client/src/components/ResetPassword.tsx).
  - Envia token + nueva clave a /auth/reset-password y confirma exito.

### Paneles auxiliares
- Respaldos en [client/src/components/BackupPanel.tsx](client/src/components/BackupPanel.tsx).
  - Lista backups desde /backups y permite ejecutar un backup manual.
  - Mensajes de estado y refresco rapido.
- Auditoria en [client/src/components/ActivityLogPanel.tsx](client/src/components/ActivityLogPanel.tsx).
  - Lista logs con filtro por accion y paginacion.
- Historial de visitante en [client/src/components/VisitorHistoryModal.tsx](client/src/components/VisitorHistoryModal.tsx).
  - Modal con timeline y estados de visitas recientes.

## Dependencias y scripts relevantes
- Backend: se usa SQLCipher via @journeyapps/sqlcipher y un script npm para migracion.
  - Script: migrate:sqlcipher en [server/package.json](server/package.json).
- Frontend: se apoya en react-big-calendar, jsPDF, XLSX, chart.js, react-hot-toast.

## Datos y respaldos
- Se trabaja con base cifrada (visits.sqlite) y backups .sqlite.enc en Backups/.
- La migracion a SQLCipher genera visits.encrypted.sqlite y se renombra a visits.sqlite para uso en runtime.
