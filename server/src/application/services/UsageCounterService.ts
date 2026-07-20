import { getSubscriptionLimits, normalizeSubscriptionPlan, SubscriptionLimits } from '../../config/subscription';
import { AppError } from '../../shared/errors';
import { TenantEntity, TenantSettings } from '../../domain/entities/Tenant.entity';
import { TenantRole } from '../../domain/entities/TenantUser.entity';
import { ITenantRepository } from '../../domain/repositories/ITenantRepository';
import { ITenantUserRepository } from '../../domain/repositories/ITenantUserRepository';
import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';

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

/**
 * Application service that enforces subscription plan limits (visits per
 * month, total visitors, total users, users per role) before a tenant can
 * create new resources.
 *
 * Lives in the application layer and depends only on repository interfaces
 * and domain entities — no Sequelize models.
 */
export class UsageCounterService {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly tenantUserRepo: ITenantUserRepository,
    private readonly visitRepo: IVisitRepository,
    private readonly visitorRepo: IVisitorRepository,
  ) {}

  async getTenant(tenantId: number): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
    return tenant;
  }

  async getUsage(tenantId: number): Promise<TenantUsage> {
    const { start, end } = monthRange();
    const [visitsThisMonth, visitors, users, roleCounts] = await Promise.all([
      this.visitRepo.countByDateRange(tenantId, start, end),
      this.visitorRepo.count(tenantId),
      this.tenantUserRepo.countActive(tenantId),
      this.tenantUserRepo.countActiveByRole(tenantId, ['admin', 'operador', 'auditor']),
    ]);
    return {
      visitsThisMonth,
      visitors,
      users,
      usersByRole: {
        admin: roleCounts.admin ?? 0,
        operador: roleCounts.operador ?? 0,
        auditor: roleCounts.auditor ?? 0,
      },
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  async getLimits(tenantId: number): Promise<{ tenant: TenantEntity; limits: SubscriptionLimits; usage: TenantUsage }> {
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
    const settings = (tenant.settings ?? {}) as TenantSettings;
    const rawMaxVisitors = tenant.maxVisitors ?? 0;
    const tenantLimit: number | null = rawMaxVisitors > 0 ? rawMaxVisitors : null;
    const maxVisitors = limits.maxVisitors === null
      ? (settings.customLimits === true ? tenantLimit : null)
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
    const settings = (tenant.settings ?? {}) as TenantSettings;
    const rawMaxUsers = tenant.maxUsers ?? 0;
    const tenantLimit: number | null = rawMaxUsers > 0 ? rawMaxUsers : null;
    const maxUsers = limits.maxUsers === null
      ? (settings.customLimits === true ? tenantLimit : null)
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
