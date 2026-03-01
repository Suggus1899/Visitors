# Documento de Requerimientos: Mejoras de Seguridad Críticas y de Alta Prioridad

## Introducción

Este documento especifica los requerimientos para implementar las mejoras de seguridad CRÍTICAS (C-1 a C-5) y de ALTA prioridad (A-1 a A-7) identificadas en el informe de auditoría de seguridad del AF Visitor System. El objetivo es elevar el sistema a un nivel de seguridad empresarial y lograr cumplimiento con ISO 27001.

El sistema actualmente presenta vulnerabilidades críticas en gestión de secretos, almacenamiento de tokens, políticas de contraseñas y auditoría de eventos. Estas mejoras son esenciales antes de cualquier despliegue en producción o presentación del proyecto de grado.

## Glosario

- **System**: AF Visitor System - Sistema de control de acceso de visitantes
- **Keytar**: Biblioteca para acceso seguro al keychain del sistema operativo
- **JWT**: JSON Web Token - Token de autenticación
- **Access_Token**: Token JWT de corta duración almacenado en memoria
- **Refresh_Token**: Token JWT de larga duración para renovar Access_Token
- **CSP**: Content Security Policy - Política de seguridad de contenido
- **XSS**: Cross-Site Scripting - Ataque de inyección de scripts
- **DOMPurify**: Biblioteca de sanitización de HTML/texto
- **Bcrypt**: Algoritmo de hashing de contraseñas
- **Bcrypt_Rounds**: Número de iteraciones del algoritmo bcrypt (factor de costo)
- **Account_Lockout**: Bloqueo temporal de cuenta tras intentos fallidos
- **Audit_Log**: Registro de auditoría de eventos de seguridad
- **Email_Service**: Servicio de envío de correos electrónicos
- **Password_Policy**: Política de complejidad y seguridad de contraseñas
- **User_Model**: Modelo de datos de usuario en la base de datos
- **Auth_Middleware**: Middleware de autenticación y autorización
- **Seeder**: Script de inicialización de datos de prueba
- **Electron_Main**: Proceso principal de la aplicación Electron
- **Photo_Upload**: Funcionalidad de carga de fotografías de visitantes

## Requerimientos

### Requerimiento 1: Gestión Segura de Claves de Encriptación en Electron

**User Story:** Como administrador del sistema, quiero que las claves de encriptación se almacenen de forma segura en el keychain del sistema operativo, para que no estén expuestas en el código fuente ni en el repositorio Git.

#### Criterios de Aceptación

1. THE Electron_Main SHALL remover todas las claves hardcodeadas del archivo `electron/main.ts`
2. WHEN la aplicación inicia por primera vez, THE Electron_Main SHALL solicitar al usuario la clave maestra de encriptación o generar una automáticamente
3. THE Electron_Main SHALL almacenar todas las claves de encriptación en el keychain del sistema operativo usando Keytar
4. WHEN la aplicación necesita una clave, THE Electron_Main SHALL recuperarla del keychain usando Keytar
5. THE System SHALL almacenar las siguientes claves en el keychain: DB_ENCRYPTION_KEY, ENCRYPTION_KEY, JWT_SECRET, BACKUP_PASSWORD
6. IF el usuario elige generar claves automáticamente, THEN THE System SHALL usar crypto.randomBytes con longitud apropiada (32 bytes para AES, 64 bytes para JWT)
7. THE System SHALL mostrar un diálogo de advertencia al usuario sobre la importancia de guardar la clave maestra en un lugar seguro
8. WHEN las claves no existen en el keychain, THE System SHALL prevenir el inicio del servidor hasta que se configuren

### Requerimiento 2: Rotación de Claves Comprometidas

**User Story:** Como administrador de seguridad, quiero rotar todas las claves actuales que están expuestas en el código fuente, para que los datos del sistema estén protegidos con claves nuevas y seguras.

#### Criterios de Aceptación

1. THE System SHALL generar nuevas claves criptográficas para: DB_ENCRYPTION_KEY, ENCRYPTION_KEY, JWT_SECRET, BACKUP_PASSWORD
2. THE System SHALL usar crypto.randomBytes para generar claves con entropía criptográfica
3. THE System SHALL generar DB_ENCRYPTION_KEY y ENCRYPTION_KEY de 32 bytes (256 bits)
4. THE System SHALL generar JWT_SECRET de 64 bytes (512 bits)
5. WHEN se rotan las claves, THE System SHALL invalidar todos los JWT existentes
6. THE System SHALL proporcionar un script de migración para re-encriptar la base de datos existente con la nueva clave
7. THE System SHALL documentar el proceso de rotación de claves en el README
8. THE System SHALL verificar que el archivo `.env` esté incluido en `.gitignore`

### Requerimiento 3: Almacenamiento Seguro de JWT

**User Story:** Como desarrollador de seguridad, quiero almacenar los JWT en memoria en lugar de localStorage, para que los tokens no sean vulnerables a ataques XSS.

#### Criterios de Aceptación

1. THE System SHALL implementar un patrón de Access_Token y Refresh_Token
2. THE System SHALL almacenar el Access_Token únicamente en memoria (variable de clase)
3. THE System SHALL almacenar el Refresh_Token en localStorage (menos crítico por su alcance limitado)
4. THE Access_Token SHALL tener una duración de 15 minutos
5. THE Refresh_Token SHALL tener una duración de 7 días
6. WHEN el Access_Token expira, THE System SHALL usar el Refresh_Token para obtener un nuevo Access_Token automáticamente
7. WHEN el Refresh_Token expira o es inválido, THE System SHALL redirigir al usuario a la página de login
8. THE System SHALL implementar un interceptor HTTP que agregue el Access_Token a todas las peticiones
9. WHEN el usuario cierra la aplicación, THE System SHALL limpiar el Access_Token de memoria
10. THE System SHALL implementar un endpoint `/api/v1/auth/refresh` para renovar Access_Token
11. THE System SHALL remover todo uso de localStorage para almacenar tokens de acceso

### Requerimiento 4: Política de Contraseñas Robusta

**User Story:** Como administrador de seguridad, quiero implementar una política de contraseñas robusta, para que las cuentas de usuario estén protegidas contra ataques de fuerza bruta y diccionario.

#### Criterios de Aceptación

1. THE Password_Policy SHALL requerir un mínimo de 12 caracteres
2. THE Password_Policy SHALL requerir al menos una letra minúscula
3. THE Password_Policy SHALL requerir al menos una letra MAYÚSCULA
4. THE Password_Policy SHALL requerir al menos un número
5. THE Password_Policy SHALL requerir al menos un símbolo especial
6. THE Password_Policy SHALL rechazar contraseñas que estén en la lista de contraseñas comunes (top 1000)
7. THE Password_Policy SHALL permitir un máximo de 128 caracteres
8. WHEN un usuario intenta establecer una contraseña, THE System SHALL validar contra la Password_Policy
9. WHEN la validación falla, THE System SHALL retornar mensajes de error específicos indicando qué requisito no se cumple
10. THE System SHALL aplicar la Password_Policy en: creación de usuario, cambio de contraseña, y reset de contraseña
11. THE System SHALL NO aplicar la Password_Policy durante el login (solo durante establecimiento de contraseña)

### Requerimiento 5: Cambio Obligatorio de Contraseña en Primer Login

**User Story:** Como administrador de seguridad, quiero forzar a los usuarios a cambiar su contraseña en el primer login, para que las contraseñas por defecto no permanezcan en uso.

#### Criterios de Aceptación

1. THE User_Model SHALL incluir un campo booleano `mustChangePassword` con valor por defecto `true`
2. THE User_Model SHALL incluir un campo de fecha `passwordChangedAt` para rastrear el último cambio
3. WHEN un usuario con `mustChangePassword=true` intenta acceder a cualquier endpoint, THE Auth_Middleware SHALL retornar HTTP 403 con código de error `PASSWORD_CHANGE_REQUIRED`
4. THE System SHALL permitir acceso al endpoint `/api/v1/auth/change-password` sin verificar `mustChangePassword`
5. WHEN un usuario cambia su contraseña exitosamente, THE System SHALL establecer `mustChangePassword=false` y actualizar `passwordChangedAt`
6. THE System SHALL mostrar un modal no-cerrable en el frontend cuando recibe el error `PASSWORD_CHANGE_REQUIRED`
7. THE System SHALL incluir un formulario de cambio de contraseña en el modal con campos: contraseña actual, nueva contraseña, confirmar contraseña
8. WHEN el usuario completa el cambio de contraseña, THE System SHALL permitir continuar con la operación normal
9. THE Seeder SHALL establecer `mustChangePassword=true` para todos los usuarios de prueba creados
10. THE System SHALL validar que la nueva contraseña cumpla con la Password_Policy

### Requerimiento 6: Sanitización de Inputs contra XSS

**User Story:** Como desarrollador de seguridad, quiero sanitizar todos los inputs de usuario antes de renderizarlos, para que el sistema esté protegido contra ataques XSS.

#### Criterios de Aceptación

1. THE System SHALL integrar la biblioteca DOMPurify para sanitización
2. THE System SHALL implementar una función `sanitizeInput()` que remueva todas las etiquetas HTML
3. THE System SHALL implementar una función `sanitizeHTML()` que permita solo etiquetas seguras (b, i, em, strong, p, br)
4. THE System SHALL sanitizar los siguientes campos antes de renderizar: nombres de visitantes, empresas, notas, motivos de visita
5. THE System SHALL sanitizar inputs en todos los componentes que muestran datos de usuario
6. THE System SHALL aplicar sanitización en: ActiveVisits, VisitorList, VisitHistory, VisitForm, WaitingList
7. WHEN un usuario ingresa HTML o JavaScript en un campo de texto, THE System SHALL remover las etiquetas peligrosas antes de mostrar
8. THE System SHALL preservar el texto plano mientras remueve código ejecutable
9. THE System SHALL aplicar sanitización tanto en el frontend como validación adicional en el backend

### Requerimiento 7: Content Security Policy en Electron

**User Story:** Como desarrollador de seguridad, quiero implementar Content Security Policy en la aplicación Electron, para que se prevenga la ejecución de scripts no autorizados.

#### Criterios de Aceptación

1. THE Electron_Main SHALL configurar CSP headers en el BrowserWindow
2. THE CSP SHALL establecer `default-src 'self'` para permitir solo recursos del mismo origen
3. THE CSP SHALL establecer `script-src 'self'` para permitir solo scripts del mismo origen
4. THE CSP SHALL establecer `style-src 'self' 'unsafe-inline'` para permitir estilos inline de Tailwind CSS
5. THE CSP SHALL establecer `img-src 'self' data: blob:` para permitir imágenes base64 y blob
6. THE CSP SHALL establecer `connect-src 'self' http://localhost:3000` para permitir conexiones al backend
7. THE CSP SHALL establecer `object-src 'none'` para bloquear plugins
8. THE CSP SHALL establecer `base-uri 'self'` para prevenir ataques de base tag
9. THE CSP SHALL establecer `form-action 'self'` para restringir destinos de formularios
10. THE CSP SHALL establecer `frame-ancestors 'none'` para prevenir clickjacking
11. THE Electron_Main SHALL habilitar `sandbox: true` en webPreferences
12. WHEN se viola la CSP, THE System SHALL bloquear el recurso y registrar el evento en consola

### Requerimiento 8: Aumento de Factor de Costo de Bcrypt

**User Story:** Como administrador de seguridad, quiero aumentar el factor de costo de bcrypt de 8 a 12 rounds, para que las contraseñas hasheadas sean más resistentes a ataques de fuerza bruta.

#### Criterios de Aceptación

1. THE System SHALL usar 12 Bcrypt_Rounds para hashear todas las contraseñas nuevas
2. THE System SHALL actualizar el Seeder para usar 12 rounds en lugar de 8
3. THE System SHALL actualizar todos los lugares donde se hashean contraseñas: registro, cambio de contraseña, reset de contraseña
4. THE System SHALL definir Bcrypt_Rounds como constante configurable en AppConfig
5. THE System SHALL permitir configurar Bcrypt_Rounds mediante variable de entorno `BCRYPT_ROUNDS`
6. THE System SHALL usar 12 como valor por defecto si no se especifica BCRYPT_ROUNDS
7. THE System SHALL mantener compatibilidad con contraseñas existentes hasheadas con 8 rounds (bcrypt valida automáticamente)
8. WHEN un usuario con contraseña antigua (8 rounds) hace login exitoso, THE System SHALL re-hashear la contraseña con 12 rounds

### Requerimiento 9: Bloqueo de Cuenta por Intentos Fallidos

**User Story:** Como administrador de seguridad, quiero bloquear cuentas temporalmente después de múltiples intentos fallidos de login, para que el sistema esté protegido contra ataques de fuerza bruta.

#### Criterios de Aceptación

1. THE User_Model SHALL incluir un campo entero `loginAttempts` con valor por defecto 0
2. THE User_Model SHALL incluir un campo de fecha `lockedUntil` para indicar hasta cuándo está bloqueada la cuenta
3. WHEN un usuario intenta hacer login, THE System SHALL verificar si `lockedUntil` es mayor que la fecha actual
4. IF la cuenta está bloqueada, THEN THE System SHALL retornar error indicando los minutos restantes de bloqueo
5. WHEN un login falla, THE System SHALL incrementar `loginAttempts` en 1
6. WHEN `loginAttempts` alcanza 5, THE System SHALL establecer `lockedUntil` a 15 minutos en el futuro
7. WHEN un login es exitoso, THE System SHALL resetear `loginAttempts` a 0 y `lockedUntil` a null
8. WHEN una cuenta es bloqueada, THE System SHALL crear un Audit_Log con acción `ACCOUNT_LOCKED` y severidad `high`
9. THE System SHALL permitir a administradores desbloquear cuentas manualmente
10. THE System SHALL notificar al usuario el número de intentos restantes antes del bloqueo (después del intento 3)

### Requerimiento 10: Auditoría Completa de Eventos de Seguridad

**User Story:** Como auditor de seguridad, quiero que el sistema registre todos los eventos críticos de seguridad, para que pueda revisar y detectar actividades sospechosas.

#### Criterios de Aceptación

1. THE System SHALL registrar los siguientes eventos de autenticación: login exitoso, login fallido, logout, cambio de contraseña, reset de contraseña, bloqueo de cuenta
2. THE System SHALL registrar los siguientes eventos de autorización: acceso denegado (403), intento de acceso a recurso sin permisos
3. THE System SHALL registrar los siguientes eventos de datos: creación de visitante, modificación de visitante, eliminación de visitante, check-in, check-out, admisión de espera
4. THE System SHALL registrar los siguientes eventos administrativos: exportación de datos (PDF/Excel), creación de backup, restauración de backup, creación de usuario, modificación de usuario
5. THE Audit_Log SHALL incluir: timestamp, userId, username, role, action, resource, resourceId, ipAddress, userAgent, method, path, status, statusCode, duration, details, severity
6. THE System SHALL implementar un middleware de auditoría que capture automáticamente información de request y response
7. THE System SHALL determinar severidad automáticamente: critical (5xx), high (401/403/delete/backup), medium (failure), low (success)
8. THE System SHALL crear logs de auditoría de forma asíncrona para no bloquear la respuesta HTTP
9. WHEN ocurre un error al crear un Audit_Log, THE System SHALL registrar el error en consola pero no fallar la operación principal
10. THE System SHALL aplicar el middleware de auditoría a todas las rutas protegidas
11. THE System SHALL permitir al rol auditor consultar y filtrar Audit_Log sin poder modificarlos

### Requerimiento 11: Envío de Emails para Recuperación de Contraseña

**User Story:** Como usuario del sistema, quiero recibir un email cuando solicito recuperar mi contraseña, para que pueda resetearla de forma segura.

#### Criterios de Aceptación

1. THE System SHALL implementar un Email_Service usando la biblioteca nodemailer
2. THE Email_Service SHALL configurarse mediante variables de entorno: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, APP_URL
3. WHEN un usuario solicita recuperación de contraseña, THE System SHALL generar un token seguro de 32 bytes usando crypto.randomBytes
4. THE System SHALL hashear el token con SHA-256 antes de almacenarlo en la base de datos
5. THE System SHALL establecer `resetTokenExpiry` a 15 minutos en el futuro
6. THE Email_Service SHALL enviar un email con un enlace que incluye el token sin hashear
7. THE email SHALL incluir: saludo personalizado, explicación de la solicitud, enlace de reset, tiempo de expiración, advertencia si no solicitó el reset
8. WHEN un usuario usa el token para resetear, THE System SHALL validar que no haya expirado
9. WHEN el reset es exitoso, THE System SHALL invalidar el token inmediatamente estableciendo `resetToken` y `resetTokenExpiry` a null
10. THE System SHALL enviar un email de confirmación cuando la contraseña es cambiada exitosamente
11. THE System SHALL incluir un archivo `.env.example` con la configuración de email documentada
12. IF el envío de email falla, THEN THE System SHALL registrar el error pero no exponer detalles técnicos al usuario

### Requerimiento 12: Validación de Tipos y Tamaños de Archivo en Upload de Fotos

**User Story:** Como desarrollador de seguridad, quiero validar los tipos y tamaños de archivos en el upload de fotos, para que el sistema solo acepte imágenes válidas y de tamaño razonable.

#### Criterios de Aceptación

1. THE Photo_Upload SHALL validar que las imágenes sean de tipo JPEG o PNG únicamente
2. THE Photo_Upload SHALL verificar el prefijo del string base64 contra: `data:image/jpeg;base64,`, `data:image/jpg;base64,`, `data:image/png;base64,`
3. WHEN el tipo de imagen no es válido, THE Photo_Upload SHALL mostrar un mensaje de error y rechazar la imagen
4. THE Photo_Upload SHALL calcular el tamaño del archivo en bytes desde el string base64
5. THE Photo_Upload SHALL establecer un límite máximo de 5MB por imagen
6. WHEN el tamaño excede 5MB, THE Photo_Upload SHALL mostrar un mensaje de error indicando el límite
7. THE Photo_Upload SHALL validar antes de capturar desde la webcam y antes de subir al servidor
8. THE Photo_Upload SHALL implementar la función `validateImage()` que retorna boolean
9. WHEN la validación falla, THE Photo_Upload SHALL prevenir el envío de la imagen al servidor
10. THE System SHALL mostrar mensajes de error claros al usuario usando toast notifications

## Consideraciones de Seguridad

### Gestión de Secretos
- Todas las claves deben removerse del código fuente y repositorio Git
- Usar keytar para Electron y variables de entorno para servidor
- Documentar el proceso de configuración inicial de claves
- Implementar rotación de claves con script de migración

### Protección contra XSS
- Sanitizar todos los inputs de usuario antes de renderizar
- Implementar CSP estricto en Electron
- Validar y escapar datos tanto en frontend como backend
- Usar bibliotecas probadas como DOMPurify

### Autenticación y Autorización
- Implementar patrón de tokens de corta y larga duración
- Almacenar tokens sensibles solo en memoria
- Forzar cambio de contraseña en primer login
- Implementar bloqueo de cuenta contra fuerza bruta

### Auditoría y Monitoreo
- Registrar todos los eventos de seguridad críticos
- Incluir contexto suficiente para investigación forense
- Implementar niveles de severidad para priorización
- Proteger logs de auditoría contra modificación

### Comunicaciones
- Usar SMTP seguro para envío de emails
- Implementar tokens de un solo uso con expiración corta
- Notificar a usuarios sobre cambios de seguridad
- No exponer información sensible en mensajes de error

## Impacto en Usuarios Existentes

### Usuarios con Contraseñas por Defecto
- Serán forzados a cambiar contraseña en próximo login
- Recibirán modal no-cerrable con formulario de cambio
- Nuevas contraseñas deben cumplir política robusta
- Proceso es transparente y guiado

### Sesiones Activas
- Todos los JWT existentes serán invalidados tras rotación de claves
- Usuarios deberán hacer login nuevamente
- Refresh tokens permitirán renovación automática en el futuro
- Comunicar mantenimiento de seguridad a usuarios

### Datos Encriptados
- Base de datos debe re-encriptarse con nuevas claves
- Script de migración maneja el proceso automáticamente
- Backup de seguridad antes de migración es obligatorio
- Proceso es transparente para usuarios finales

### Configuración de Email
- Administradores deben configurar SMTP antes de usar reset de contraseña
- Sistema funcionará sin email pero con funcionalidad limitada
- Documentación clara en .env.example
- Validación de configuración en startup

## Estrategia de Migración

### Fase 1: Preparación (Día 1)
1. Crear backup completo de base de datos actual
2. Verificar que .env esté en .gitignore
3. Instalar dependencias nuevas: keytar, dompurify, nodemailer
4. Generar nuevas claves criptográficas

### Fase 2: Migración de Base de Datos (Día 1)
1. Ejecutar script de migración para agregar nuevos campos a User
2. Establecer mustChangePassword=true para usuarios existentes
3. Re-encriptar base de datos con nuevas claves
4. Verificar integridad de datos post-migración

### Fase 3: Implementación Backend (Días 2-3)
1. Implementar gestión de claves con keytar en Electron
2. Implementar endpoints de refresh token
3. Actualizar política de contraseñas en schemas
4. Implementar middleware de cambio obligatorio
5. Implementar bloqueo de cuenta
6. Implementar auditoría completa
7. Configurar Email Service

### Fase 4: Implementación Frontend (Día 3)
1. Implementar AuthService con tokens en memoria
2. Actualizar interceptores HTTP
3. Implementar modal de cambio obligatorio de contraseña
4. Implementar sanitización con DOMPurify
5. Implementar validación de fotos

### Fase 5: Configuración Electron (Día 3)
1. Implementar CSP en BrowserWindow
2. Configurar sandbox mode
3. Implementar diálogo de configuración inicial de claves

### Fase 6: Testing y Validación (Día 4)
1. Probar flujo completo de primer login
2. Probar bloqueo de cuenta
3. Probar recuperación de contraseña con email
4. Probar sanitización XSS
5. Validar auditoría de eventos
6. Verificar CSP en DevTools

### Fase 7: Documentación (Día 4)
1. Actualizar README con instrucciones de configuración
2. Documentar proceso de rotación de claves
3. Documentar configuración de SMTP
4. Crear guía de usuario para cambio de contraseña

### Rollback Plan
- Mantener backup de base de datos pre-migración
- Mantener versión anterior del código en branch separado
- Documentar pasos de rollback si es necesario
- Tiempo estimado de rollback: 30 minutos

## Criterios de Éxito

### Técnicos
- Cero claves hardcodeadas en código fuente
- Todos los JWT en memoria, no en localStorage
- 100% de usuarios con contraseñas robustas
- Todos los eventos críticos auditados
- CSP implementado sin errores en consola
- Bcrypt con 12 rounds en todas las contraseñas nuevas

### Funcionales
- Usuarios pueden cambiar contraseña obligatoriamente en primer login
- Cuentas se bloquean tras 5 intentos fallidos
- Emails de recuperación se envían correctamente
- Fotos solo aceptan JPEG/PNG menores a 5MB
- Sistema previene XSS en todos los inputs

### Seguridad
- Sistema pasa auditoría de seguridad post-implementación
- Cumplimiento con controles ISO 27001: A.9, A.10, A.12.4
- Cero vulnerabilidades críticas o altas en npm audit
- Cero secretos detectados en historial de Git

### Experiencia de Usuario
- Proceso de cambio de contraseña es claro y guiado
- Mensajes de error son informativos sin exponer detalles técnicos
- Bloqueo de cuenta informa tiempo restante
- Validación de fotos da feedback inmediato
