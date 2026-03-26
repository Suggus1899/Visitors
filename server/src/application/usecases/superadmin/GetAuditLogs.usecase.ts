import ActivityLog from '../../../models/ActivityLog';

export interface AuditLogFilter {
  userId?: number;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class GetAuditLogsUseCase {
  async execute(filter?: AuditLogFilter): Promise<{ logs: any[]; total: number }> {
    // Build query conditions
    const where: any = {};
    
    if (filter?.userId) {
      where.userId = filter.userId;
    }
    
    if (filter?.action) {
      where.action = filter.action;
    }
    
    if (filter?.startDate || filter?.endDate) {
      where.createdAt = {};
      if (filter.startDate) {
        where.createdAt.$gte = filter.startDate;
      }
      if (filter.endDate) {
        where.createdAt.$lte = filter.endDate;
      }
    }

    // Query logs with pagination
    const { count, rows } = await ActivityLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: filter?.limit || 100,
      offset: filter?.offset || 0
    });

    return {
      logs: rows.map(log => log.toJSON()),
      total: count
    };
  }
}
