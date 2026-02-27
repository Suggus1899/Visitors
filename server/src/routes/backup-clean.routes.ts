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

export default router;
