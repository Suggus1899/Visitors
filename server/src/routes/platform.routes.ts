import express from 'express';
import { platformController } from '../controllers/PlatformController';
import { verifyToken, isSuperAdmin } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { adminLimiter } from '../middleware/rateLimiter';
import {
  createTenantSchema,
  updateTenantSchema,
  listTenantsQuerySchema,
  updatePlatformUserSchema,
  listUsersQuerySchema,
  updateSubscriptionSchema,
  listAuditLogsQuerySchema,
  listTenantAuditLogsQuerySchema,
  createTenantUserSchema,
  updateTenantUserSchema,
} from '../schemas/platform.schema';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// All platform routes require a valid token + superadmin role.
const auth = [adminLimiter, verifyToken, isSuperAdmin];

// ===================== TENANTS =====================
router.get('/v1/tenants', ...auth, validateQuery(listTenantsQuerySchema), asyncHandler(platformController.listTenants));
router.post('/v1/tenants', ...auth, validate(createTenantSchema), asyncHandler(platformController.createTenant));
router.get('/v1/tenants/:id', ...auth, asyncHandler(platformController.getTenant));
router.get('/v1/tenants/:id/usage', ...auth, asyncHandler(platformController.getTenantUsage));
router.patch('/v1/tenants/:id', ...auth, validate(updateTenantSchema), asyncHandler(platformController.updateTenant));
router.post('/v1/tenants/:id/suspend', ...auth, asyncHandler(platformController.suspendTenant));
router.post('/v1/tenants/:id/activate', ...auth, asyncHandler(platformController.activateTenant));
router.delete('/v1/tenants/:id', ...auth, asyncHandler(platformController.deleteTenant));

// Tenant users
router.get('/v1/tenants/:id/users', ...auth, asyncHandler(platformController.listTenantUsers));
router.post('/v1/tenants/:id/users', ...auth, validate(createTenantUserSchema), asyncHandler(platformController.createTenantUser));
router.patch('/v1/tenants/:id/users/:userId', ...auth, validate(updateTenantUserSchema), asyncHandler(platformController.updateTenantUser));
router.delete('/v1/tenants/:id/users/:userId', ...auth, asyncHandler(platformController.deleteTenantUser));
router.post('/v1/tenants/:id/users/:userId/reset-password', ...auth, asyncHandler(platformController.resetTenantUserPassword));

// Tenant audit logs & backups
router.get('/v1/tenants/:id/audit-logs', ...auth, validateQuery(listTenantAuditLogsQuerySchema), asyncHandler(platformController.listTenantAuditLogs));
router.get('/v1/tenants/:id/backups', ...auth, asyncHandler(platformController.listTenantBackups));

// ===================== USERS (GLOBAL) =====================
router.get('/v1/users', ...auth, validateQuery(listUsersQuerySchema), asyncHandler(platformController.listUsers));
router.get('/v1/users/:id', ...auth, asyncHandler(platformController.getUser));
router.patch('/v1/users/:id', ...auth, validate(updatePlatformUserSchema), asyncHandler(platformController.updateUser));
router.delete('/v1/users/:id', ...auth, asyncHandler(platformController.deleteUser));
router.post('/v1/users/:id/grant-superadmin', ...auth, asyncHandler(platformController.grantSuperAdmin));
router.post('/v1/users/:id/revoke-superadmin', ...auth, asyncHandler(platformController.revokeSuperAdmin));

// ===================== SUBSCRIPTIONS =====================
router.get('/v1/subscriptions', ...auth, asyncHandler(platformController.listSubscriptions));
router.patch('/v1/subscriptions/:tenantId', ...auth, validate(updateSubscriptionSchema), asyncHandler(platformController.updateSubscription));

// ===================== STATS =====================
router.get('/v1/stats', ...auth, asyncHandler(platformController.getStats));

// ===================== AUDIT LOGS (GLOBAL) =====================
router.get('/v1/audit-logs', ...auth, validateQuery(listAuditLogsQuerySchema), asyncHandler(platformController.listAuditLogs));

// ===================== SETTINGS =====================
router.get('/v1/settings', ...auth, asyncHandler(platformController.getSettings));
router.put('/v1/settings', ...auth, asyncHandler(platformController.updateSettings));

export default router;
