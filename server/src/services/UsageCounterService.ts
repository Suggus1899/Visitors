import { Op } from 'sequelize';
import { getSubscriptionLimits, normalizeSubscriptionPlan, SubscriptionLimits } from '../config/subscription';
import Tenant from '../models/Tenant';
import TenantUser, { TenantRole } from '../models/TenantUser';
import Visit from '../models/Visit';
import Visitor from '../models/Visitor';
import { AppError } from '../shared/errors';

export interface TenantUsage {
  visitsThisMonth: number;
  visitors: number;
  users: number;
  usersByRole: Record<'admin' | 'operador' | 'auditor', number>;
  period: { start: string; end: string };
}

const monthRange = (now = new Date()) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
};

export class UsageCounterService {
  async getTenant(tenantId: number): Promise<Tenant> {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
    return tenant;
  }

  async getUsage(tenantId: number): Promise<TenantUsage> {
    const { start, end } = monthRange();
    const [visitsThisMonth, visitors, users, roleRows] = await Promise.all([
      Visit.count({ where: { tenantId, check_in_time: { [Op.gte]: start, [Op.lt]: end } } }),
      Visitor.count({ where: { tenantId } }),
      TenantUser.count({ where: { tenantId, isActive: true } }),
      TenantUser.findAll({
        attributes: ['role'],
        where: { tenantId, isActive: true, role: { [Op.in]: ['admin', 'operador', 'auditor'] } },
      }),
    ]);
    const usersByRole = { admin: 0, operador: 0, auditor: 0 };
    roleRows.forEach(row => {
      if (row.role in usersByRole) usersByRole[row.role as keyof typeof usersByRole] += 1;
    });
    return {
      visitsThisMonth,
      visitors,
      users,
      usersByRole,
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  async getLimits(tenantId: number): Promise<{ tenant: Tenant; limits: SubscriptionLimits; usage: TenantUsage }> {
    const tenant = await this.getTenant(tenantId);
    const [limits, usage] = await Promise.all([
      Promise.resolve(getSubscriptionLimits(tenant.subscriptionPlan)),
      this.getUsage(tenantId),
    ]);
    return { tenant, limits, usage };
  }

  async assertCanCreateVisit(tenantId: number): Promise<void> {
    const { tenant, limits, usage } = await this.getLimits(tenantId);
    if (limits.visitsPerMonth !== null && usage.visitsThisMonth >= limits.visitsPerMonth) {
      throw new AppError(
        `Monthly visit limit reached for the ${normalizeSubscriptionPlan(tenant.subscriptionPlan)} plan`,
        403,
        'VISIT_LIMIT_EXCEEDED',
        { limit: limits.visitsPerMonth, used: usage.visitsThisMonth },
      );
    }
  }

  async assertCanCreateVisitor(tenantId: number): Promise<void> {
    const { tenant, limits, usage } = await this.getLimits(tenantId);
    const tenantLimit = tenant.maxVisitors > 0 ? tenant.maxVisitors : null;
    const maxVisitors = limits.maxVisitors === null
      ? (tenant.settings?.customLimits === true ? tenantLimit : null)
      : (tenantLimit === null ? limits.maxVisitors : Math.min(limits.maxVisitors, tenantLimit));
    if (maxVisitors !== null && usage.visitors >= maxVisitors) {
      throw new AppError('Tenant visitor limit reached', 403, 'VISITOR_LIMIT_EXCEEDED', {
        limit: maxVisitors,
        used: usage.visitors,
      });
    }
  }

  async assertCanCreateUser(tenantId: number, role: TenantRole): Promise<void> {
    const { tenant, limits, usage } = await this.getLimits(tenantId);
    const tenantLimit = tenant.maxUsers > 0 ? tenant.maxUsers : null;
    const maxUsers = limits.maxUsers === null
      ? (tenant.settings?.customLimits === true ? tenantLimit : null)
      : (tenantLimit === null ? limits.maxUsers : Math.min(limits.maxUsers, tenantLimit));
    if (maxUsers !== null && usage.users >= maxUsers) {
      throw new AppError('Tenant user limit reached', 403, 'USER_LIMIT_EXCEEDED', {
        limit: maxUsers,
        used: usage.users,
      });
    }
    if (role === 'admin' || role === 'operador' || role === 'auditor') {
      const roleLimit = limits.usersByRole[role];
      if (roleLimit !== null && usage.usersByRole[role] >= roleLimit) {
        throw new AppError(`Tenant ${role} user limit reached`, 403, 'USER_ROLE_LIMIT_EXCEEDED', {
          role,
          limit: roleLimit,
          used: usage.usersByRole[role],
        });
      }
    }
  }
}

export const usageCounterService = new UsageCounterService();
