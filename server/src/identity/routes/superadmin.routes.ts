import express from 'express';
import { superAdminController } from '../controllers/SuperAdminController';
import { verifyToken, isSuperAdmin } from '../../middleware/auth';
import { validate, validateQuery } from '../../middleware/validate';
import { adminLimiter } from '../../middleware/rateLimiter';
import { createUserSchema, updateUserSchema, resetUserPasswordSchema } from '../../schemas/superadmin.schema';
import { getAuditLogsByUserIdSchema } from '../../schemas/audit.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Root
 *   description: Root management endpoints
 */

/**
 * @swagger
 * /root/users:
 *   get:
 *     summary: List all users
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users
 *       403:
 *         description: Not authorized
 */
router.get('/v1/superadmin/users', adminLimiter, verifyToken, isSuperAdmin, asyncHandler(superAdminController.listUsers));

router.post('/v1/superadmin/users', adminLimiter, verifyToken, isSuperAdmin, validate(createUserSchema), asyncHandler(superAdminController.createUser));

router.put('/v1/superadmin/users/:id', adminLimiter, verifyToken, isSuperAdmin, validate(updateUserSchema), asyncHandler(superAdminController.updateUser));

router.delete('/v1/superadmin/users/:id', adminLimiter, verifyToken, isSuperAdmin, asyncHandler(superAdminController.deleteUser));

router.post('/v1/superadmin/users/:id/reset-password', adminLimiter, verifyToken, isSuperAdmin, validate(resetUserPasswordSchema), asyncHandler(superAdminController.resetPassword));

router.get('/v1/superadmin/audit-logs', adminLimiter, verifyToken, isSuperAdmin, validateQuery(getAuditLogsByUserIdSchema), asyncHandler(superAdminController.getAuditLogs));

export default router;
