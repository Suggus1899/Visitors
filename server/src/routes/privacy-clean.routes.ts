import express from 'express';
import * as PrivacyCleanController from '../controllers/PrivacyCleanController';
import { verifyToken, isAdmin } from '../middleware/auth';
import { verifyAuditor, denyAuditorOnly } from '../middleware/auditor';
import { validate } from '../middleware/validate';
import { createArcoRequestSchema, updateArcoStatusSchema, rectifyDataSchema, oppositionSchema } from '../schemas/privacy.schema';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Privacy
 *   description: Gestion de derechos ARCO
 */

// Solicitudes ARCO
router.post('/v1/privacy/arco-requests', verifyToken, validate(createArcoRequestSchema), PrivacyCleanController.createArcoRequest);
router.get('/v1/privacy/arco-requests', verifyToken, verifyAuditor, PrivacyCleanController.listArcoRequests);
router.patch('/v1/privacy/arco-requests/:id/status', verifyToken, verifyAuditor, validate(updateArcoStatusSchema), PrivacyCleanController.updateArcoRequestStatus);

// ARCO - Acceso, Rectificacion, Cancelacion, Oposicion
router.get('/v1/privacy/subjects/:cedula', verifyToken, verifyAuditor, PrivacyCleanController.accessSubjectData);
router.patch('/v1/privacy/subjects/:cedula', verifyToken, denyAuditorOnly, validate(rectifyDataSchema), PrivacyCleanController.rectifySubjectData);
router.delete('/v1/privacy/subjects/:cedula', verifyToken, isAdmin, PrivacyCleanController.cancelSubjectData);
router.post('/v1/privacy/subjects/:cedula/opposition', verifyToken, validate(oppositionSchema), PrivacyCleanController.createOppositionRequest);

export default router;
