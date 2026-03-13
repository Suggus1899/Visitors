import cron from 'node-cron';
import { Op } from 'sequelize';
import config from '../config/AppConfig';
import ActivityLog from '../models/ActivityLog';
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

    const deletedPhotos = await PhotoStorage.cleanupOldPhotos(retentionDays);

    console.log(
      `[Retention] Cleanup completed. Logs deleted: ${deletedLogs}, photos deleted: ${deletedPhotos}, retentionDays: ${retentionDays}`
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
