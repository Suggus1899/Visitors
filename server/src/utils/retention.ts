import cron from 'node-cron';
import { Op } from 'sequelize';
import config from '../config/AppConfig';
import ActivityLog from '../models/ActivityLog';
import logger from '../config/logger';

export async function runRetentionCleanup(): Promise<void> {
  const auditLogRetentionDays = config.auditLogRetentionDays;

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

    // Photos are stored as BYTEA in PostgreSQL — no filesystem cleanup needed.
    // Photo retention is handled by visitor data deletion (CASCADE or explicit purge).

    logger.info(
      `[Retention] Cleanup completed. Logs deleted: ${deletedLogs} (>${auditLogRetentionDays}d)`
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
