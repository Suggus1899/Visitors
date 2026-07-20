import cron from 'node-cron';
import { Op, QueryTypes } from 'sequelize';
import config from '../config/AppConfig';
import { getSubscriptionLimits } from '../config/subscription';
import sequelize from '../database';
import ActivityLog from '../models/ActivityLog';
import VisitModel from '../models/Visit';
import VisitorModel from '../models/Visitor';
import Tenant from '../models/Tenant';
import logger from '../config/logger';

export async function runRetentionCleanup(): Promise<void> {
  const auditCutoffDate = new Date(Date.now() - config.auditLogRetentionDays * 86_400_000);

  try {
    const deletedLogs = await ActivityLog.destroy({ where: { createdAt: { [Op.lt]: auditCutoffDate } } });
    const tenants = await Tenant.findAll();
    let deletedVisits = 0;
    let deletedVisitors = 0;

    for (const tenant of tenants) {
      const retentionDays = getSubscriptionLimits(tenant.subscriptionPlan).retentionDays;
      const dataCutoffDate = new Date(Date.now() - retentionDays * 86_400_000);
      deletedVisits += await VisitModel.destroy({
        where: { tenantId: tenant.id, status: 'completed', check_out_time: { [Op.lt]: dataCutoffDate } },
      });

      const orphans = await sequelize.query<{ id: number }>(
        `SELECT v.id FROM "Visitors" v
         WHERE v."tenantId" = :tenantId
           AND NOT EXISTS (
             SELECT 1 FROM "Visits" t
             WHERE t."tenantId" = v."tenantId" AND t.visitor_id = v.id
           )`,
        { replacements: { tenantId: tenant.id }, type: QueryTypes.SELECT },
      );
      if (orphans.length) {
        deletedVisitors += await VisitorModel.destroy({ where: { tenantId: tenant.id, id: { [Op.in]: orphans.map(row => row.id) } } });
      }
    }

    logger.info(`[Retention] Cleanup: ${deletedLogs} logs, ${deletedVisits} visits, ${deletedVisitors} visitors purged.`);
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
