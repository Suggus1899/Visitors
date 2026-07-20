import express from 'express';
import * as PrivacyController from '../controllers/PrivacyController';
import { verifyToken, isAdmin, resolveTenant, verifyTenantMembership } from '../../middleware/auth';
import { demoTenantLimiter } from '../../middleware/rateLimiter';
import { verifyAuditor, denyAuditorOnly } from '../../middleware/auditor';
import { validate } from '../../middleware/validate';
import { createArcoRequestSchema, updateArcoStatusSchema, rectifyDataSchema, oppositionSchema } from '../../schemas/privacy.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = express.Router();
const tenantContext = [verifyToken, asyncHandler(resolveTenant), demoTenantLimiter, asyncHandler(verifyTenantMembership)];

/**
 * @swagger
 * tags:
 *   name: Privacy
 *   description: Gestion de derechos ARCO
 */

// Solicitudes ARCO
router.post('/v1/:tenantSlug/privacy/arco-requests', ...tenantContext, validate(createArcoRequestSchema), asyncHandler(PrivacyController.createArcoRequest));
router.get('/v1/:tenantSlug/privacy/arco-requests', ...tenantContext, verifyAuditor, asyncHandler(PrivacyController.listArcoRequests));
router.patch('/v1/:tenantSlug/privacy/arco-requests/:id/status', ...tenantContext, verifyAuditor, validate(updateArcoStatusSchema), asyncHandler(PrivacyController.updateArcoRequestStatus));

// ARCO - Acceso, Rectificacion, Cancelacion, Oposicion
router.get('/v1/:tenantSlug/privacy/subjects/:cedula', ...tenantContext, verifyAuditor, asyncHandler(PrivacyController.accessSubjectData));
router.patch('/v1/:tenantSlug/privacy/subjects/:cedula', ...tenantContext, denyAuditorOnly, validate(rectifyDataSchema), asyncHandler(PrivacyController.rectifySubjectData));
router.delete('/v1/:tenantSlug/privacy/subjects/:cedula', ...tenantContext, isAdmin, asyncHandler(PrivacyController.cancelSubjectData));
router.post('/v1/:tenantSlug/privacy/subjects/:cedula/opposition', ...tenantContext, validate(oppositionSchema), asyncHandler(PrivacyController.createOppositionRequest));

export default router;
