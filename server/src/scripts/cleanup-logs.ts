import sequelize from '../database';
import ActivityLog from '../models/ActivityLog';
import { Op } from 'sequelize';
import config from '../config/AppConfig';

/**
 * Script to clean up old audit logs
 * Usage: npx ts-node server/src/scripts/cleanup-logs.ts
 */
const cleanupLogs = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Default retention: 365 days (or from config if available)
        const retentionDays = process.env.AUDIT_RETENTION_DAYS ? parseInt(process.env.AUDIT_RETENTION_DAYS) : 365;
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        console.log(`🧹 Cleaning logs older than ${retentionDays} days (before ${cutoffDate.toISOString()})...`);

        const deletedCount = await ActivityLog.destroy({
            where: {
                createdAt: {
                    [Op.lt]: cutoffDate
                }
            }
        });

        console.log(`✅ Deleted ${deletedCount} old log entries.`);

    } catch (error) {
        console.error('❌ Error cleaning up logs:', error);
    } finally {
        await sequelize.close();
    }
};

cleanupLogs();
