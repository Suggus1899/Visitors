import express from 'express';
import { superAdminController } from '../controllers/SuperAdminController';
import { verifyToken, isSuperAdmin } from '../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SuperAdmin
 *   description: Super Admin management endpoints
 */

/**
 * @swagger
 * /superadmin/users:
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
router.get('/v1/superadmin/users', verifyToken, isSuperAdmin, superAdminController.listUsers);

/**
 * @swagger
 * /superadmin/users:
 *   post:
 *     summary: Create a new user
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, guard, auditor]
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: Username already exists
 */
router.post('/v1/superadmin/users', verifyToken, isSuperAdmin, superAdminController.createUser);

/**
 * @swagger
 * /superadmin/users/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, guard, auditor]
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
router.put('/v1/superadmin/users/:id', verifyToken, isSuperAdmin, superAdminController.updateUser);

/**
 * @swagger
 * /superadmin/users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Cannot delete superadmin
 *       404:
 *         description: User not found
 */
router.delete('/v1/superadmin/users/:id', verifyToken, isSuperAdmin, superAdminController.deleteUser);

/**
 * @swagger
 * /superadmin/users/{id}/reset-password:
 *   post:
 *     summary: Reset user password
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       404:
 *         description: User not found
 */
router.post('/v1/superadmin/users/:id/reset-password', verifyToken, isSuperAdmin, superAdminController.resetPassword);

/**
 * @swagger
 * /superadmin/audit-logs:
 *   get:
 *     summary: Get audit logs
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of audit logs
 */
router.get('/v1/superadmin/audit-logs', verifyToken, isSuperAdmin, superAdminController.getAuditLogs);

export default router;
