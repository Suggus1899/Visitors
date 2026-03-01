# Credenciales de Usuarios del Sistema - Actualizado 2026-02-28

## ⚠️ IMPORTANTE: Política de Seguridad Actualizada

A partir de la implementación de las mejoras de seguridad críticas (Fase 2), el sistema ahora requiere:

- ✅ **Contraseñas robustas**: Mínimo 12 caracteres con complejidad completa
- ✅ **Bcrypt 12 rounds**: Todas las contraseñas nuevas usan 12 rounds
- ✅ **Cambio obligatorio**: La mayoría de usuarios deben cambiar contraseña en primer login
- ✅ **Bloqueo de cuenta**: 5 intentos fallidos = 15 minutos de bloqueo
- ✅ **Tokens seguros**: Access tokens (15 min) + Refresh tokens (7 días)

---

## 👥 Usuarios del Sistema

### 1. Admin Principal (Producción)
```
Usuario: Admin@trebol.com
Contraseña: Trebol123*
Rol: admin
Cambio obligatorio: NO
Estado: Activo
```
**Uso**: Usuario administrador principal del sistema. No requiere cambio de contraseña.

---

### 2. Guardia de Seguridad
```
Usuario: guard
Contraseña: Guard123!@#
Rol: guard
Cambio obligatorio: SÍ ⚠️
Estado: Activo
```
**Uso**: Usuario para guardias de seguridad. **DEBE cambiar contraseña en primer login**.

**Nueva contraseña debe cumplir**:
- Mínimo 12 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula
- Al menos 1 número
- Al menos 1 carácter especial (!@#$%^&*()_+-=[]{}|;:,.<>?)
- No estar en lista de contraseñas comunes

---

### 3. Admin Legacy (Compatibilidad)
```
Usuario: admin
Contraseña: Admin123!@#
Rol: admin
Cambio obligatorio: SÍ ⚠️
Estado: Activo
```
**Uso**: Usuario admin legacy para compatibilidad. **DEBE cambiar contraseña en primer login**.

---

### 4. Usuario Demo
```
Usuario: demo
Contraseña: Demo123!@#
Rol: admin
Cambio obligatorio: SÍ ⚠️
Estado: Activo
```
**Uso**: Usuario de demostración con permisos de admin. **DEBE cambiar contraseña en primer login**.

---

### 5. Auditor
```
Usuario: auditor
Contraseña: Audit2026!@#
Rol: auditor
Cambio obligatorio: SÍ ⚠️
Estado: Activo
```
**Uso**: Usuario con permisos de auditoría. **DEBE cambiar contraseña en primer login**.

---

## 🔐 Flujo de Primer Login

### Para usuarios con cambio obligatorio:

1. **Login inicial**:
   ```
   POST /api/v1/auth/login
   {
     "username": "guard",
     "password": "Guard123!@#"
   }
   ```

2. **Respuesta del sistema**:
   ```json
   {
     "success": true,
     "data": {
       "accessToken": "eyJ...",
       "refreshToken": "eyJ...",
       "user": {
         "username": "guard",
         "role": "guard",
         "mustChangePassword": true
       }
     }
   }
   ```

3. **Intentar acceder a cualquier endpoint**:
   ```
   GET /api/v1/visits
   Authorization: Bearer eyJ...
   ```

4. **Sistema bloquea el acceso**:
   ```json
   {
     "success": false,
     "error": {
       "code": "PASSWORD_CHANGE_REQUIRED",
       "message": "You must change your password before accessing the system"
     }
   }
   ```

5. **Cambiar contraseña**:
   ```
   POST /api/v1/auth/change-password
   Authorization: Bearer eyJ...
   {
     "currentPassword": "Guard123!@#",
     "newPassword": "MyNewSecureP@ssw0rd2026"
   }
   ```

6. **Ahora puede acceder al sistema normalmente**

---

## 🛡️ Política de Contraseñas

### Requisitos Obligatorios:
- ✅ Longitud: 12-128 caracteres
- ✅ Al menos 1 letra mayúscula (A-Z)
- ✅ Al menos 1 letra minúscula (a-z)
- ✅ Al menos 1 número (0-9)
- ✅ Al menos 1 carácter especial (!@#$%^&*()_+-=[]{}|;:,.<>?)
- ✅ No estar en lista de 1000+ contraseñas comunes

### Ejemplos de Contraseñas Válidas:
```
✅ MySecureP@ssw0rd2026
✅ Guard!Security#2026
✅ Tr3b0l*Admin$2026
✅ Aud1t0r!Secure#Pass
```

### Ejemplos de Contraseñas Inválidas:
```
❌ password123        (común)
❌ Admin123          (sin carácter especial)
❌ admin@123         (menos de 12 caracteres)
❌ ADMIN123!@#       (sin minúsculas)
❌ admin123!@#       (sin mayúsculas)
```

---

## 🔒 Bloqueo de Cuenta

### Política de Intentos Fallidos:
- **Intentos permitidos**: 5
- **Duración del bloqueo**: 15 minutos
- **Advertencia**: Después del 3er intento fallido
- **Desbloqueo**: Automático después de 15 minutos

### Ejemplo de Bloqueo:
```
Intento 1: ❌ Contraseña incorrecta
Intento 2: ❌ Contraseña incorrecta
Intento 3: ❌ Contraseña incorrecta (⚠️ Quedan 2 intentos)
Intento 4: ❌ Contraseña incorrecta (⚠️ Queda 1 intento)
Intento 5: ❌ Contraseña incorrecta (🔒 CUENTA BLOQUEADA por 15 minutos)
```

### Respuesta de Cuenta Bloqueada:
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account locked due to too many failed login attempts",
    "minutesRemaining": 14,
    "lockedUntil": "2026-02-28T23:30:00.000Z"
  }
}
```

---

## 🔄 Tokens de Autenticación

### Access Token:
- **Duración**: 15 minutos
- **Almacenamiento**: Memoria (frontend)
- **Uso**: Todas las peticiones API
- **Renovación**: Automática con refresh token

### Refresh Token:
- **Duración**: 7 días
- **Almacenamiento**: localStorage (frontend)
- **Uso**: Renovar access token
- **Endpoint**: `POST /api/v1/auth/refresh`

### Ejemplo de Refresh:
```
POST /api/v1/auth/refresh
{
  "refreshToken": "eyJ..."
}

Respuesta:
{
  "success": true,
  "data": {
    "accessToken": "eyJ..."
  }
}
```

---

## 📧 Recuperación de Contraseña

### Flujo Completo:

1. **Solicitar reset**:
   ```
   POST /api/v1/auth/forgot-password
   {
     "username": "guard"
   }
   ```

2. **Sistema genera token**:
   - Token: 32 bytes aleatorios
   - Hash: SHA-256
   - Expiración: 15 minutos
   - Email enviado (si configurado)

3. **Resetear contraseña**:
   ```
   POST /api/v1/auth/reset-password
   {
     "token": "abc123...",
     "newPassword": "MyNewSecureP@ssw0rd2026"
   }
   ```

4. **Contraseña actualizada**:
   - mustChangePassword = false
   - passwordChangedAt = NOW()
   - Email de confirmación enviado

---

## 🧪 Testing

### Ejecutar Seeder:
```bash
cd server
npm run seed:clean
```

### Verificar Usuarios:
```bash
# Login con usuario que requiere cambio
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"guard","password":"Guard123!@#"}'

# Intentar acceder (debe fallar con PASSWORD_CHANGE_REQUIRED)
curl -X GET http://localhost:3000/api/v1/visits \
  -H "Authorization: Bearer <token>"

# Cambiar contraseña
curl -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"Guard123!@#","newPassword":"MyNewSecureP@ssw0rd2026"}'
```

---

## 📊 Resumen de Cambios

### Antes (Fase 1):
- ❌ Contraseñas débiles (6+ caracteres)
- ❌ Bcrypt 8 rounds
- ❌ Sin cambio obligatorio
- ❌ Sin bloqueo de cuenta
- ❌ Solo access tokens

### Después (Fase 2):
- ✅ Contraseñas robustas (12+ caracteres, complejidad completa)
- ✅ Bcrypt 12 rounds
- ✅ Cambio obligatorio en primer login
- ✅ Bloqueo después de 5 intentos fallidos
- ✅ Access + Refresh tokens
- ✅ Migración automática de contraseñas antiguas

---

## 🔧 Configuración

### Variables de Entorno (.env):
```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Bcrypt Configuration
BCRYPT_ROUNDS=12

# SMTP Configuration (opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourcompany.com
```

---

**Última actualización**: 2026-02-28
**Versión**: Fase 2 - Backend Security Complete
