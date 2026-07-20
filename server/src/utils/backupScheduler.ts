import config from '../config/AppConfig';
import logger from '../config/logger';
import { getSubscriptionLimits } from '../config/subscription';
import { Op } from 'sequelize';
import Tenant from '../models/Tenant';
import { container } from '../shared/Container';

let running = false;

export const runScheduledTenantBackups = async () => {
  if (running) return;
  running = true;
  try {
    const tenants = await Tenant.findAll({ where: { status: { [Op.in]: ['active', 'trial'] } } });
    for (const tenant of tenants) {
      const limits = getSubscriptionLimits(tenant.subscriptionPlan);
      const intervalHours = limits.backupFrequency === 'daily' ? 24 : limits.backupFrequency === 'four-hour' ? 4 : null;
      // Enterprise continuous backup is intentionally a provider-level placeholder.
      if (!intervalHours) continue;
      const backups = await container.backupService.listBackups(tenant.id);
      const dueAt = backups[0] ? backups[0].date.getTime() + intervalHours * 60 * 60 * 1000 : 0;
      if (Date.now() >= dueAt) {
        await container.backupService.createBackup(tenant.id);
        await container.backupService.applyRetention(tenant.id, limits.backupRetentionCount);
      }
    }
  } catch (error) {
    logger.error('Scheduled tenant backup failed:', error);
  } finally {
    running = false;
  }
};

export const initBackupScheduler = () => {
  const intervalMs = Math.max(config.backupSchedulerPollMinutes, 1) * 60 * 1000;
  void runScheduledTenantBackups();
  const timer = setInterval(() => void runScheduledTenantBackups(), intervalMs);
  timer.unref();
};
