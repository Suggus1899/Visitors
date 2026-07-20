import { Op, fn, col, literal } from 'sequelize';
import {
  IAuditLogRepository,
  AuditLogEntity,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogStats
} from '../../../domain/repositories/IAuditLogRepository';
import ActivityLog from '../../../../models/ActivityLog';
import logger from '../../../../config/logger';

export class SequelizeAuditLogRepository implements IAuditLogRepository {
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await ActivityLog.create({
        tenantId: entry.tenantId,
        userId: entry.userId,
        username: entry.username,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        details: entry.details || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null
      });
    } catch (error) {
      logger.error('Failed to log activity:', error);
    }
  }

  async findAll(tenantId: number, filters?: AuditLogFilters): Promise<{ logs: AuditLogEntity[]; total: number }> {
    const where = this.buildWhere(tenantId, filters);
    const { count, rows } = await ActivityLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: filters?.limit || 100,
      offset: filters?.offset || 0
    });

    return {
      logs: rows.map(log => this.toDomain(log)),
      total: count
    };
  }

  async count(tenantId: number, filters?: AuditLogFilters): Promise<number> {
    const where = this.buildWhere(tenantId, filters);
    return await ActivityLog.count({ where });
  }

  async getDistinctActions(tenantId: number): Promise<string[]> {
    const where = tenantId !== 0 ? { tenantId } : {};
    const actions = await ActivityLog.findAll({
      attributes: [[fn('DISTINCT', col('action')), 'action']],
      where,
      raw: true
    });

    return actions.map((a: { action: string }) => a.action).filter(Boolean);
  }

  async getDistinctUsers(tenantId: number): Promise<string[]> {
    const where = tenantId !== 0 ? { tenantId } : {};
    const users = await ActivityLog.findAll({
      attributes: [[fn('DISTINCT', col('username')), 'username']],
      where,
      raw: true
    });

    return users.map((u: { username: string }) => u.username).filter(Boolean);
  }

  async getStats(tenantId: number): Promise<AuditLogStats> {
    const tenantWhere = tenantId !== 0 ? { tenantId } : {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const loginsToday = await ActivityLog.count({
      where: {
        ...tenantWhere,
        action: 'LOGIN',
        createdAt: { [Op.gte]: today }
      }
    });

    const actionsToday = await ActivityLog.count({
      where: { ...tenantWhere, createdAt: { [Op.gte]: today } }
    });

    const uniqueUsersToday = await ActivityLog.count({
      where: { ...tenantWhere, createdAt: { [Op.gte]: today } },
      distinct: true,
      col: 'userId'
    });

    const uniqueIPs = await ActivityLog.count({
      where: { ...tenantWhere, createdAt: { [Op.gte]: yesterday } },
      distinct: true,
      col: 'ipAddress'
    });

    const actionsByType = await ActivityLog.findAll({
      where: { ...tenantWhere, createdAt: { [Op.gte]: weekAgo } },
      attributes: [
        'action',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['action'],
      order: [[literal('count'), 'DESC']],
      raw: true
    });

    const topUsers = await ActivityLog.findAll({
      where: { ...tenantWhere, createdAt: { [Op.gte]: weekAgo } },
      attributes: [
        'username',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['username'],
      order: [[literal('count'), 'DESC']],
      limit: 10,
      raw: true
    });

    const dailyActivity = await ActivityLog.findAll({
      where: { ...tenantWhere, createdAt: { [Op.gte]: weekAgo } },
      attributes: [
        [fn('DATE', col('createdAt')), 'date'],
        [fn('COUNT', col('id')), 'count']
      ],
      group: [fn('DATE', col('createdAt'))],
      order: [[fn('DATE', col('createdAt')), 'ASC']],
      raw: true
    });

    return {
      today: {
        logins: loginsToday,
        actions: actionsToday,
        uniqueUsers: uniqueUsersToday,
        uniqueIPs
      },
      lastWeek: {
        actionsByType: actionsByType as unknown as Array<{ action: string; count: number }>,
        topUsers: topUsers as unknown as Array<{ username: string; count: number }>,
        dailyActivity: dailyActivity as unknown as Array<{ date: string; count: number }>
      }
    };
  }

  private buildWhere(tenantId: number, filters?: AuditLogFilters): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    // tenantId=0 means global/cross-tenant query (superadmin); skip tenant filter
    if (tenantId !== 0) {
      where.tenantId = tenantId;
    }
    if (!filters) return where;

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.entity) {
      where.entity = filters.entity;
    }

    if (filters.username) {
      where.username = { [Op.like]: `%${filters.username}%` };
    }

    if (filters.ip) {
      where.ipAddress = { [Op.like]: `%${filters.ip}%` };
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        (where.createdAt as Record<symbol, Date>)[Op.gte] = filters.startDate;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        (where.createdAt as Record<symbol, Date>)[Op.lte] = end;
      }
    }

    if (filters.search) {
      where[Op.or as unknown as string] = [
        { details: { [Op.like]: `%${filters.search}%` } },
        { entityId: { [Op.like]: `%${filters.search}%` } }
      ];
    }

    return where;
  }

  private toDomain(model: typeof ActivityLog.prototype): AuditLogEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      userId: model.userId,
      username: model.username,
      action: model.action,
      entity: model.entity,
      entityId: model.entityId,
      details: model.details,
      ipAddress: model.ipAddress,
      userAgent: model.userAgent,
      createdAt: model.createdAt
    };
  }
}
