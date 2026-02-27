import express from 'express';
import * as VisitCleanController from '../controllers/VisitCleanController';
import { verifyToken } from '../middleware/auth';
import { denyAuditorOnly } from '../middleware/auditor';
import { validate } from '../middleware/validate';
import { checkInSchema } from '../schemas/visit.schema';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

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
router.post('/v1/visits/checkin', verifyToken, denyAuditorOnly, validate(checkInSchema), asyncHandler(VisitCleanController.checkIn));

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
router.post('/v1/visits/:id/checkout', verifyToken, denyAuditorOnly, asyncHandler(VisitCleanController.checkOut));

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
router.get('/v1/visits/active', verifyToken, denyAuditorOnly, asyncHandler(VisitCleanController.getActiveVisits));

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
 *           enum: [active, completed]
 *     responses:
 *       200:
 *         description: Paginated list of visits
 */
router.get('/v1/visits', verifyToken, denyAuditorOnly, asyncHandler(VisitCleanController.getVisits));

export default router;
