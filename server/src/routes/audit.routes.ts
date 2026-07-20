import express from 'express';
import * as AuditController from '../controllers/AuditController';
import { verifyToken, resolveTenant, verifyTenantMembership } from '../middleware/auth';
import { demoTenantLimiter } from '../middleware/rateLimiter';
import { verifyAuditor } from '../middleware/auditor';
import { validateQuery } from '../middleware/validate';
import { getAuditLogsSchema } from '../schemas/audit.schema';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const tenantContext = [verifyToken, asyncHandler(resolveTenant), demoTenantLimiter, asyncHandler(verifyTenantMembership)];

/**
 * @swagger
 * tags:
 *   name: Audit
 *   description: Sistema de auditoría (solo auditores/admins)
 */

/**
 * @swagger
 * /api/v1/audit/logs:
 *   get:
 *     summary: Obtener logs de auditoría con filtros
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 */
router.get('/v1/:tenantSlug/audit/logs', ...tenantContext, verifyAuditor, validateQuery(getAuditLogsSchema), asyncHandler(AuditController.getLogs));

/**
 * @swagger
 * /api/v1/audit/stats:
 *   get:
 *     summary: Obtener estadísticas de auditoría
 *     tags: [Audit]
 */
router.get('/v1/:tenantSlug/audit/stats', ...tenantContext, verifyAuditor, asyncHandler(AuditController.getStats));

/**
 * @swagger
 * /api/v1/audit/export:
 *   get:
 *     summary: Exportar logs a CSV
 *     tags: [Audit]
 */
router.get('/v1/:tenantSlug/audit/export', ...tenantContext, verifyAuditor, validateQuery(getAuditLogsSchema), asyncHandler(AuditController.exportLogs));

/**
 * @swagger
 * /api/v1/audit/actions:
 *   get:
 *     summary: Obtener lista de acciones para filtros
 *     tags: [Audit]
 */
router.get('/v1/:tenantSlug/audit/actions', ...tenantContext, verifyAuditor, asyncHandler(AuditController.getActions));

/**
 * @swagger
 * /api/v1/audit/users:
 *   get:
 *     summary: Obtener lista de usuarios para filtros
 *     tags: [Audit]
 */
router.get('/v1/:tenantSlug/audit/users', ...tenantContext, verifyAuditor, asyncHandler(AuditController.getUsers));

/**
 * @swagger
 * /api/v1/audit/config:
 *   get:
 *     summary: Obtener configuración de retención
 *     tags: [Audit]
 */
router.get('/v1/:tenantSlug/audit/config', ...tenantContext, verifyAuditor, asyncHandler(AuditController.getRetentionPolicy));

export default router;
