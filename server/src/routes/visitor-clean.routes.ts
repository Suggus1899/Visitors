import express from 'express';
import * as VisitorCleanController from '../controllers/VisitorCleanController';
import { verifyToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Visitors
 *   description: Visitor information management
 */

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
/**
 * @swagger
 * /visitors:
 *   get:
 *     summary: Get all visitors with pagination
 *     tags: [Visitors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: company
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of visitors
 */
router.get('/v1/visitors', verifyToken, VisitorCleanController.getAllVisitors);

router.get('/v1/visitors/:cedula', verifyToken, VisitorCleanController.getVisitor);

/**
 * @swagger
 * /visitors/{cedula}:
 *   patch:
 *     summary: Update visitor information
 *     tags: [Visitors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cedula
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Visitor updated
 *       404:
 *         description: Visitor not found
 */
router.patch('/v1/visitors/:cedula', verifyToken, VisitorCleanController.updateVisitor);

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

router.get('/v1/visitors/:cedula/photo', verifyToken, asyncHandler(VisitorCleanController.getVisitorPhoto));

router.get('/v1/visitors/:cedula/id-photo', verifyToken, asyncHandler(VisitorCleanController.getVisitorIdPhoto));


export default router;
