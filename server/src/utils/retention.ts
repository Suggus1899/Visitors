import path from 'path';
import cron from 'node-cron';
import { Op } from 'sequelize';
import config from '../config/AppConfig';
import ActivityLog from '../models/ActivityLog';
import VisitorModel from '../models/Visitor';
import PhotoStorage from './PhotoStorage';

export async function runRetentionCleanup(): Promise<void> {
  const retentionDays = config.dataRetentionDays;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  try {
    const deletedLogs = await ActivityLog.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate
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
      if (v.photo_url)    protectedFilenames.add(path.basename(v.photo_url));
      if (v.id_photo_url) protectedFilenames.add(path.basename(v.id_photo_url));
    }

    const deletedPhotos = await PhotoStorage.cleanupOldPhotos(retentionDays, protectedFilenames);

    console.log(
      `[Retention] Cleanup completed. Logs deleted: ${deletedLogs}, photos deleted: ${deletedPhotos}, ` +
      `protected: ${protectedFilenames.size}, retentionDays: ${retentionDays}`
    );
  } catch (error) {
    console.error('[Retention] Cleanup failed:', error);
  }
}

export function initRetentionScheduler(): void {
  // Run once at startup.
  void runRetentionCleanup();

  // Daily at 02:00 local server time.
  cron.schedule('0 2 * * *', () => {
    void runRetentionCleanup();
  });

  console.log('[Retention] Scheduler initialized (daily at 02:00)');
}
