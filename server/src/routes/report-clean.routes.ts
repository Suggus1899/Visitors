import express from 'express';
import * as ReportCleanController from '../controllers/ReportCleanController';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Statistical reports and alerts
 */

/**
 * @swagger
 * /reports/stats:
 *   get:
 *     summary: Get general visit statistics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Statistics object
 */
router.get('/v1/reports/stats', verifyToken, ReportCleanController.getStats);

/**
 * @swagger
 * /reports/stats/monthly:
 *   get:
 *     summary: Get monthly visit statistics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Monthly statistics
 */
router.get('/v1/reports/stats/monthly', verifyToken, ReportCleanController.getMonthlyReport);

/**
 * @swagger
 * /reports/alerts:
 *   get:
 *     summary: Get missed checkouts alerts
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of visits with missed checkout
 */
router.get('/v1/reports/alerts', verifyToken, ReportCleanController.getMissedCheckouts);

/**
 * @swagger
 * /reports/comparison:
 *   get:
 *     summary: Get comparison statistics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Comparison data
 */
router.get('/v1/reports/comparison', verifyToken, ReportCleanController.getComparisonStats);

export default router;
