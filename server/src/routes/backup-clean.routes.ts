import express from 'express';
import * as BackupCleanController from '../controllers/BackupCleanController';
import { verifyToken, isAdmin } from '../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Backups
 *   description: System backup management
 */

/**
 * @swagger
 * /backups:
 *   post:
 *     summary: Create a new backup
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Backup created successfully
 *       500:
 *         description: Backup failed
 */
router.post('/v1/backups', verifyToken, isAdmin, BackupCleanController.createBackup);

/**
 * @swagger
 * /backups:
 *   get:
 *     summary: List all backups
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of backup files
 */
router.get('/v1/backups', verifyToken, isAdmin, BackupCleanController.listBackups);

/**
 * @swagger
 * /backups/{filename}/restore:
 *   post:
 *     summary: Restore a backup (requires restore password)
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               restorePassword:
 *                 type: string
 *                 description: Contraseña de restauración única (formato trebol-XXXX-XXXX)
 *     responses:
 *       200:
 *         description: Backup restored successfully
 *       400:
 *         description: Missing restore password
 *       401:
 *         description: Invalid restore password
 *       404:
 *         description: Backup file not found
 */
router.post('/v1/backups/:filename/restore', verifyToken, isAdmin, BackupCleanController.restoreBackup);

export default router;
