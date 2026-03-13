import express from 'express';
import * as VisitorCleanController from '../controllers/VisitorCleanController';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Visitors
 *   description: Visitor information management
 */

/**
 * @swagger
 * /visitors/{cedula}:
 *   get:
 *     summary: Get visitor by cedula
 *     tags: [Visitors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cedula
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visitor found
 *       404:
 *         description: Visitor not found
 */
router.get('/v1/visitors/:cedula', verifyToken, VisitorCleanController.getVisitor);

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: Get list of unique companies
 *     tags: [Visitors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of companies
 */
router.get('/v1/visitors/companies', verifyToken, VisitorCleanController.getCompanies);

export default router;
