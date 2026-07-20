import express from 'express';
import * as BackupController from '../controllers/BackupController';
import * as TenantFeaturesController from '../controllers/TenantFeaturesController';
import * as VisitController from '../controllers/VisitController';
import { verifyAuditor, denyAuditorOnly } from '../middleware/auditor';
import { isAdmin, resolveTenant, verifyTenantMembership, verifyToken } from '../middleware/auth';
import { demoTenantLimiter } from '../middleware/rateLimiter';
import { enforceCheckInLimits, subscriptionGuard } from '../middleware/subscriptionGuard';
import { validate } from '../middleware/validate';
import { restoreBackupSchema } from '../schemas/backup.schema';
import { checkInSchema } from '../schemas/visit.schema';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const tenantContext = [verifyToken, asyncHandler(resolveTenant), demoTenantLimiter, asyncHandler(verifyTenantMembership)];

router.get('/v1/:tenantSlug/subscription', ...tenantContext, asyncHandler(TenantFeaturesController.getSubscription));

router.post(
  '/v1/:tenantSlug/visits/checkin',
  ...tenantContext,
  denyAuditorOnly,
  asyncHandler(enforceCheckInLimits),
  validate(checkInSchema),
  asyncHandler(VisitController.checkIn),
);

router.get(
  '/v1/:tenantSlug/calendar/events',
  ...tenantContext,
  subscriptionGuard('calendar'),
  asyncHandler(TenantFeaturesController.getCalendarEvents),
);

router.get(
  '/v1/:tenantSlug/auditor/edits',
  ...tenantContext,
  subscriptionGuard('auditor'),
  verifyAuditor,
  asyncHandler(TenantFeaturesController.getAuditorEdits),
);
router.get(
  '/v1/:tenantSlug/auditor/exports',
  ...tenantContext,
  subscriptionGuard('auditor'),
  verifyAuditor,
  asyncHandler(TenantFeaturesController.exportAuditorData),
);
router.get(
  '/v1/:tenantSlug/auditor/stats',
  ...tenantContext,
  subscriptionGuard('auditor'),
  verifyAuditor,
  asyncHandler(TenantFeaturesController.getAuditorStats),
);

router.get('/v1/:tenantSlug/backups/schedule', ...tenantContext, isAdmin, asyncHandler(BackupController.getTenantBackupSchedule));
router.get('/v1/:tenantSlug/backups', ...tenantContext, isAdmin, asyncHandler(BackupController.listTenantBackups));
router.post(
  '/v1/:tenantSlug/backups',
  ...tenantContext,
  isAdmin,
  subscriptionGuard('backupOnDemand'),
  asyncHandler(BackupController.createTenantBackup),
);
router.post(
  '/v1/:tenantSlug/backups/:filename/restore',
  ...tenantContext,
  isAdmin,
  subscriptionGuard('backupOnDemand'),
  validate(restoreBackupSchema),
  asyncHandler(BackupController.restoreTenantBackup),
);

export default router;
