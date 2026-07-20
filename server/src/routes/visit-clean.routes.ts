import express from 'express';
import * as VisitCleanController from '../controllers/VisitCleanController';
import { verifyToken, resolveTenant, verifyTenantMembership } from '../middleware/auth';
import { denyAuditorOnly } from '../middleware/auditor';
import { validate } from '../middleware/validate';
import { checkInSchema } from '../schemas/visit.schema';
import { asyncHandler } from '../utils/asyncHandler';
import { enforceCheckInLimits } from '../middleware/subscriptionGuard';

const router = express.Router();
const tenantContext = [verifyToken, asyncHandler(resolveTenant), asyncHandler(verifyTenantMembership)];

/**
 * @swagger
 * tags:
 *   name: Visits
 *   description: Visitor check-in and check-out management
 */

/**
 * @swagger
 * /visits/checkin:
 *   post:
 *     summary: Check in a visitor
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - visitorCedula
 *               - purpose
 *               - personToVisit
 *             properties:
 *               visitorCedula:
 *                 type: string
 *               purpose:
 *                 type: string
 *               personToVisit:
 *                 type: string
 *               notes:
 *                 type: string
 *               visitorData:
 *                 type: object
 *                 properties:
 *                   firstName:
 *                     type: string
 *                   lastName:
 *                     type: string
 *                   company:
 *                     type: string
 *     responses:
 *       200:
 *         description: Check-in successful
 *       400:
 *         description: Visitor already checked in or invalid data
 */
router.post('/v1/:tenantSlug/visits/checkin', ...tenantContext, denyAuditorOnly, asyncHandler(enforceCheckInLimits), validate(checkInSchema), asyncHandler(VisitCleanController.checkIn));

/**
 * @swagger
 * /visits/{id}/checkout:
 *   post:
 *     summary: Check out a visitor
 *     tags: [Visits]
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
 *         description: Check-out successful
 *       404:
 *         description: Visit not found or already completed
 */
router.post('/v1/:tenantSlug/visits/:id/checkout', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.checkOut));

/**
 * @swagger
 * /visits/{id}/admit:
 *   post:
 *     summary: Admit a waiting visitor
 *     tags: [Visits]
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
 *         description: Admit successful
 *       404:
 *         description: Visit not found or not in waiting status
 *       400:
 *         description: Bad request
 */
router.post('/v1/:tenantSlug/visits/:id/admit', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.admitVisitor));

/**
 * @swagger
 * /visits/waiting:
 *   get:
 *     summary: Get all waiting visits
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of waiting visits
 */
router.get('/v1/:tenantSlug/visits/waiting', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.getWaitingVisits));

/**
 * @swagger
 * /visits/active:
 *   get:
 *     summary: Get all active visits
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active visits
 */
router.get('/v1/:tenantSlug/visits/active', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.getActiveVisits));

router.post('/v1/:tenantSlug/visits/:id/intermittent', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.goIntermittent));

router.post('/v1/:tenantSlug/visits/:id/reactivate', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.reactivateVisit));

/**
 * @swagger
 * /visits/intermittent:
 *   get:
 *     summary: Get all intermittent visits (temporarily outside)
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of intermittent visits
 */
router.get('/v1/:tenantSlug/visits/intermittent', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.getIntermittentVisits));

/**
 * @swagger
 * /visits/{id}/intermittent-exit:
 *   post:
 *     summary: Register temporary exit (Active → Intermittent)
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Temporary exit registered
 */
router.post('/v1/:tenantSlug/visits/:id/intermittent-exit', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.intermittentExit));

/**
 * @swagger
 * /visits/{id}/intermittent-reentry:
 *   post:
 *     summary: Register re-entry (Intermittent → Active)
 *     tags: [Visits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Re-entry registered
 */
router.post('/v1/:tenantSlug/visits/:id/intermittent-reentry', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.intermittentReEntry));

/**
 * @swagger
 * /visits:
 *   get:
 *     summary: Get visits with filters
 *     tags: [Visits]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, intermittent, completed]
 *     responses:
 *       200:
 *         description: Paginated list of visits
 */
router.get('/v1/:tenantSlug/visits', ...tenantContext, denyAuditorOnly, asyncHandler(VisitCleanController.getVisits));

export default router;
