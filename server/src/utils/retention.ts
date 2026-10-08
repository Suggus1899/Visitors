import cron from 'node-cron';
import { Op, Sequelize } from 'sequelize';
import config from '../config/AppConfig';
import sequelize from '../database';
import ActivityLog from '../models/ActivityLog';
import VisitModel from '../models/Visit';
import VisitorModel from '../models/Visitor';
import logger from '../config/logger';

export async function runRetentionCleanup(): Promise<void> {
  const auditLogRetentionDays = config.auditLogRetentionDays;
  const dataRetentionDays = config.dataRetentionDays;

  const auditCutoffDate = new Date();
  auditCutoffDate.setDate(auditCutoffDate.getDate() - auditLogRetentionDays);

  const dataCutoffDate = new Date();
  dataCutoffDate.setDate(dataCutoffDate.getDate() - dataRetentionDays);

  try {
    // 1. Delete old audit logs
    const deletedLogs = await ActivityLog.destroy({
      where: {
        createdAt: { [Op.lt]: auditCutoffDate }
      }
    });

    // 2. Delete completed visits older than data retention
    const deletedVisits = await VisitModel.destroy({
      where: {
        status: 'completed',
        check_out_time: { [Op.lt]: dataCutoffDate }
      }
    });

    // 3. Find and delete visitors with no visits (cascade removes photo blobs)
    const [orphans] = await sequelize.query(
      `SELECT cedula FROM "Visitors" v WHERE NOT EXISTS (SELECT 1 FROM "Visits" t WHERE t.visitor_cedula = v.cedula)`
    );
    const deletedVisitors = Array.isArray(orphans) ? orphans.length : 0;
    if (deletedVisitors > 0) {
      const cedulas = (orphans as { cedula: string }[]).map(r => r.cedula);
      await VisitorModel.destroy({ where: { cedula: cedulas } as any });
    }

    logger.info(
      `[Retention] Cleanup: ${deletedLogs} logs, ${deletedVisits} visits, ${deletedVisitors} visitors purged.`
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
