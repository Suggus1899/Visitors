import express from 'express';
import * as VisitorController from '../controllers/VisitorController';
import { verifyToken, resolveTenant, verifyTenantMembership } from '../middleware/auth';
import { demoTenantLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const tenantContext = [verifyToken, asyncHandler(resolveTenant), demoTenantLimiter, asyncHandler(verifyTenantMembership)];

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
router.get('/v1/:tenantSlug/visitors/companies', ...tenantContext, VisitorController.getCompanies);

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
router.get('/v1/:tenantSlug/visitors', ...tenantContext, asyncHandler(VisitorController.getAllVisitors));

router.get('/v1/:tenantSlug/visitors/:cedula', ...tenantContext, asyncHandler(VisitorController.getVisitor));

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
router.patch('/v1/:tenantSlug/visitors/:cedula', ...tenantContext, asyncHandler(VisitorController.updateVisitor));

router.post('/v1/:tenantSlug/visitors/verify-edit-password', ...tenantContext, asyncHandler(VisitorController.verifyEditPassword));

router.get('/v1/:tenantSlug/visits/:visitId/edit-history', ...tenantContext, asyncHandler(VisitorController.getEditHistory));

router.get('/v1/:tenantSlug/visitors/:cedula/edit-history', ...tenantContext, asyncHandler(VisitorController.getEditHistoryByCedula));

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
router.get('/v1/:tenantSlug/visitors/:cedula/photo', ...tenantContext, asyncHandler(VisitorController.getVisitorPhoto));

router.get('/v1/:tenantSlug/visitors/:cedula/id-photo', ...tenantContext, asyncHandler(VisitorController.getVisitorIdPhoto));


export default router;
