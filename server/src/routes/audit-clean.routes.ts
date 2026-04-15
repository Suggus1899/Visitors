import express from 'express';
import * as AuditCleanController from '../controllers/AuditCleanController';
import { verifyToken } from '../middleware/auth';
import { verifyAuditor } from '../middleware/auditor';
import { validateQuery } from '../middleware/validate';
import { getAuditLogsSchema } from '../schemas/audit.schema';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

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
router.get('/v1/audit/logs', verifyToken, verifyAuditor, validateQuery(getAuditLogsSchema), asyncHandler(AuditCleanController.getLogs));

/**
 * @swagger
 * /api/v1/audit/stats:
 *   get:
 *     summary: Obtener estadísticas de auditoría
 *     tags: [Audit]
 */
router.get('/v1/audit/stats', verifyToken, verifyAuditor, asyncHandler(AuditCleanController.getStats));

/**
 * @swagger
 * /api/v1/audit/export:
 *   get:
 *     summary: Exportar logs a CSV
 *     tags: [Audit]
 */
router.get('/v1/audit/export', verifyToken, verifyAuditor, validateQuery(getAuditLogsSchema), asyncHandler(AuditCleanController.exportLogs));

/**
 * @swagger
 * /api/v1/audit/actions:
 *   get:
 *     summary: Obtener lista de acciones para filtros
 *     tags: [Audit]
 */
router.get('/v1/audit/actions', verifyToken, verifyAuditor, asyncHandler(AuditCleanController.getActions));

/**
 * @swagger
 * /api/v1/audit/users:
 *   get:
 *     summary: Obtener lista de usuarios para filtros
 *     tags: [Audit]
 */
router.get('/v1/audit/users', verifyToken, verifyAuditor, asyncHandler(AuditCleanController.getUsers));

/**
 * @swagger
 * /api/v1/audit/config:
 *   get:
 *     summary: Obtener configuración de retención
 *     tags: [Audit]
 */
router.get('/v1/audit/config', verifyToken, verifyAuditor, asyncHandler(AuditCleanController.getRetentionPolicy));

export default router;
