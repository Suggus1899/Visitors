import express from 'express';
import * as PrivacyCleanController from '../controllers/PrivacyCleanController';
import { verifyToken, isAdmin, resolveTenant, verifyTenantMembership } from '../middleware/auth';
import { demoTenantLimiter } from '../middleware/rateLimiter';
import { verifyAuditor, denyAuditorOnly } from '../middleware/auditor';
import { validate } from '../middleware/validate';
import { createArcoRequestSchema, updateArcoStatusSchema, rectifyDataSchema, oppositionSchema } from '../schemas/privacy.schema';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const tenantContext = [verifyToken, asyncHandler(resolveTenant), demoTenantLimiter, asyncHandler(verifyTenantMembership)];

/**
 * @swagger
 * tags:
 *   name: Privacy
 *   description: Gestion de derechos ARCO
 */

// Solicitudes ARCO
router.post('/v1/:tenantSlug/privacy/arco-requests', ...tenantContext, validate(createArcoRequestSchema), asyncHandler(PrivacyCleanController.createArcoRequest));
router.get('/v1/:tenantSlug/privacy/arco-requests', ...tenantContext, verifyAuditor, asyncHandler(PrivacyCleanController.listArcoRequests));
router.patch('/v1/:tenantSlug/privacy/arco-requests/:id/status', ...tenantContext, verifyAuditor, validate(updateArcoStatusSchema), asyncHandler(PrivacyCleanController.updateArcoRequestStatus));

// ARCO - Acceso, Rectificacion, Cancelacion, Oposicion
router.get('/v1/:tenantSlug/privacy/subjects/:cedula', ...tenantContext, verifyAuditor, asyncHandler(PrivacyCleanController.accessSubjectData));
router.patch('/v1/:tenantSlug/privacy/subjects/:cedula', ...tenantContext, denyAuditorOnly, validate(rectifyDataSchema), asyncHandler(PrivacyCleanController.rectifySubjectData));
router.delete('/v1/:tenantSlug/privacy/subjects/:cedula', ...tenantContext, isAdmin, asyncHandler(PrivacyCleanController.cancelSubjectData));
router.post('/v1/:tenantSlug/privacy/subjects/:cedula/opposition', ...tenantContext, validate(oppositionSchema), asyncHandler(PrivacyCleanController.createOppositionRequest));

export default router;
