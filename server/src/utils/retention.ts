import path from 'path';
import cron from 'node-cron';
import { Op } from 'sequelize';
import config from '../config/AppConfig';
import ActivityLog from '../models/ActivityLog';
import VisitorModel from '../models/Visitor';
import PhotoStorage from './PhotoStorage';
import logger from '../config/logger';

export async function runRetentionCleanup(): Promise<void> {
  const dataRetentionDays = config.dataRetentionDays;
  const auditLogRetentionDays = config.auditLogRetentionDays;

  // C-04: Separate cutoff dates for personal data vs audit logs
  const dataCutoffDate = new Date();
  dataCutoffDate.setDate(dataCutoffDate.getDate() - dataRetentionDays);

  const auditCutoffDate = new Date();
  auditCutoffDate.setDate(auditCutoffDate.getDate() - auditLogRetentionDays);

  try {
    // Audit logs use their own (longer) retention period — default 365 days
    const deletedLogs = await ActivityLog.destroy({
      where: {
        createdAt: {
          [Op.lt]: auditCutoffDate
        }
      }
    });

    // Build the set of photo filenames that belong to registered visitors.
    // These are kept permanently regardless of the retention window.
    const visitors = await VisitorModel.findAll({
      attributes: ['photo_url', 'id_photo_url']
    });

    const protectedFilenames = new Set<string>();
    for (const v of visitors) {
      if (v.photo_url) protectedFilenames.add(path.basename(v.photo_url));
      if (v.id_photo_url) protectedFilenames.add(path.basename(v.id_photo_url));
    }

    const deletedPhotos = await PhotoStorage.cleanupOldPhotos(dataRetentionDays, protectedFilenames);

    logger.info(
      `[Retention] Cleanup completed. Logs deleted: ${deletedLogs} (>${auditLogRetentionDays}d), ` +
      `photos deleted: ${deletedPhotos} (>${dataRetentionDays}d), ` +
      `protected: ${protectedFilenames.size}`
    );
  } catch (error) {
    logger.error('[Retention] Cleanup failed:', error);
  }
}

export function initRetentionScheduler(): void {
  // Run once at startup.
  void runRetentionCleanup();

  // Daily at 02:00 local server time.
  cron.schedule('0 2 * * *', () => {
    void runRetentionCleanup();
  });

  logger.info('[Retention] Scheduler initialized (daily at 02:00)');
}
