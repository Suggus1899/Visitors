import { Request, Response } from 'express';
import { Op, fn, col, literal, WhereOptions } from 'sequelize';
import sequelize from '../database';
import { ResponseBuilder } from '../shared/ApiResponse';
import { container } from '../shared/Container';
import { getClientInfo } from '../middleware/ipCapture';
import logger from '../config/logger';
import { getPlanPrice, getSubscriptionLimits, normalizeSubscriptionPlan, SubscriptionPlan } from '../config/subscription';
import Tenant from '../models/Tenant';
import TenantUser from '../models/TenantUser';
import User from '../models/User';
import Visit from '../models/Visit';
import Visitor from '../models/Visitor';
import ActivityLog from '../models/ActivityLog';
import VisitorEditHistory from '../models/VisitorEditHistory';
import IntermittentLog from '../models/IntermittentLog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getActor = (req: Request) => ({ id: req.user?.id ?? 0, username: req.user?.username ?? 'system' });

const parseId = (req: Request, param: string): number | null => {
  const id = parseInt(req.params[param] as string, 10);
  return Number.isNaN(id) ? null : id;
};

const audit = async (req: Request, action: string, entity: string, entityId: string, details: string, tenantId = 0) => {
  const actor = getActor(req);
  const clientInfo = getClientInfo(req);
  try {
    await container.auditLogRepository.log({
      tenantId,
      userId: actor.id,
      username: actor.username,
      action,
      entity,
      entityId,
      details,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
    });
  } catch (err) {
    logger.error('Platform audit log failed:', err);
  }
};

/** Map a Tenant model row to the platform Tenant DTO shape. */
const toTenantDto = (tenant: typeof Tenant.prototype, userCount = 0) => {
  const isDemo = !!tenant.isDemo;
  const plan: string = isDemo ? 'demo' : normalizeSubscriptionPlan(tenant.subscriptionPlan);
  const status: string = isDemo ? 'demo' : tenant.status ?? 'active';
  return {
    id: String(tenant.id),
    name: tenant.name,
    slug: tenant.slug,
    status,
    plan,
    createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
    maxUsers: tenant.maxUsers,
    isDemo,
    userCount,
    demoExpiresAt: tenant.demoExpiresAt ? tenant.demoExpiresAt.toISOString() : null,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt ? tenant.subscriptionExpiresAt.toISOString() : null,
  };
};

/** Map a User model row (with optional tenant membership) to PlatformUser DTO. */
const toPlatformUserDto = (
  user: typeof User.prototype,
  membership?: { tenantId: number; tenantName: string; tenantSlug: string } | null,
) => ({
  id: String(user.id),
  tenantId: membership ? String(membership.tenantId) : 'platform',
  tenantName: membership?.tenantName ?? 'LogMaster Platform',
  tenantSlug: membership?.tenantSlug ?? 'platform',
  name: user.username,
  email: user.email ?? '',
  role: user.role ?? 'operador',
  isSuperAdmin: !!user.isSuperAdmin,
  createdAt: (user as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  lastActiveAt: null,
});

/** Map a TenantUser + User to the TenantUser DTO shape. */
const toTenantUserDto = (membership: typeof TenantUser.prototype, user: typeof User.prototype | null) => ({
  id: String(membership.id),
  tenantId: String(membership.tenantId),
  userId: String(membership.userId),
  name: user?.username ?? 'unknown',
  email: user?.email ?? '',
  role: membership.role,
  isActive: membership.isActive,
  isSuperAdmin: user ? !!user.isSuperAdmin : false,
  createdAt: membership.createdAt?.toISOString() ?? new Date().toISOString(),
  lastActiveAt: null,
});

/** Map an ActivityLog row to the AuditLogEntry DTO shape. */
const toAuditLogDto = (log: typeof ActivityLog.prototype, tenantName?: string) => ({
  id: String(log.id),
  tenantId: log.tenantId ? String(log.tenantId) : undefined,
  tenantName: tenantName ?? undefined,
  userId: String(log.userId),
  username: log.username,
  action: log.action,
  entity: log.entity,
  entityId: log.entityId,
  details: log.details ?? undefined,
  ipAddress: log.ipAddress ?? undefined,
  createdAt: log.createdAt?.toISOString() ?? new Date().toISOString(),
});

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class PlatformController {
  // ===================== TENANTS =====================

  /** GET /platform/v1/tenants */
  async listTenants(req: Request, res: Response) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const offset = (page - 1) * pageSize;

    const where: WhereOptions = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.plan) where.subscriptionPlan = req.query.plan;
    const isDemoQuery = req.query.isDemo;
    if (isDemoQuery !== undefined) where.isDemo = String(isDemoQuery) === 'true';
    if (req.query.search) {
      const q = `%${String(req.query.search)}%`;
      where[Op.or as unknown as string] = [{ name: { [Op.iLike]: q } }, { slug: { [Op.iLike]: q } }];
    }

    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const order = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';
    const orderClause: [string, string][] = [[sortBy === 'name' ? 'name' : 'createdAt', order]];

    const { rows, count } = await Tenant.findAndCountAll({ where, limit: pageSize, offset, order: orderClause });
    const tenantIds = rows.map(t => t.id);
    const userCounts: Record<number, number> = {};
    if (tenantIds.length) {
      const counts = await TenantUser.findAll({
        attributes: ['tenantId', [fn('COUNT', col('id')), 'count']],
        where: { tenantId: { [Op.in]: tenantIds }, isActive: true },
        group: ['tenantId'],
        raw: true,
      });
      (counts as unknown as Array<{ tenantId: number; count: number }>).forEach(c => { userCounts[c.tenantId] = Number(c.count); });
    }
    const items = rows.map(t => toTenantDto(t, userCounts[t.id] ?? 0));
    res.json(ResponseBuilder.success({ items, total: count }, { page, limit: pageSize, total: count, totalPages: Math.ceil(count / pageSize) }));
  }

  /** POST /platform/v1/tenants */
  async createTenant(req: Request, res: Response) {
    const { name, slug, plan, isDemo, demoExpiresAt, subscriptionExpiresAt, maxUsers, maxVisitors } = req.body;
    if (!name || !slug) {
      return res.status(400).json(ResponseBuilder.error('MISSING_FIELDS', 'name and slug are required'));
    }
    const existing = await Tenant.findOne({ where: { slug } });
    if (existing) {
      return res.status(409).json(ResponseBuilder.error('SLUG_EXISTS', 'Slug is already in use'));
    }
    const limits = getSubscriptionLimits(plan);
    const tenant = await Tenant.create({
      name,
      slug,
      subscriptionPlan: plan as SubscriptionPlan,
      status: isDemo ? 'trial' : 'active',
      isDemo: !!isDemo,
      demoExpiresAt: demoExpiresAt ? new Date(demoExpiresAt) : isDemo ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
      maxUsers: maxUsers ?? limits.maxUsers ?? 5,
      maxVisitors: maxVisitors ?? limits.maxVisitors ?? 1000,
      settings: {},
    });
    await audit(req, 'PLATFORM_TENANT_CREATED', 'Tenant', String(tenant.id), `Created tenant: ${tenant.name} (${tenant.slug})`);
    res.status(201).json(ResponseBuilder.success(toTenantDto(tenant, 0)));
  }

  /** GET /platform/v1/tenants/:id */
  async getTenant(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const usage = await this.getUsageStats(id);
    const dto = toTenantDto(tenant, usage.usersCount);
    res.json(ResponseBuilder.success({ ...dto, usage }));
  }

  /** GET /platform/v1/tenants/:id/usage */
  async getTenantUsage(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const usage = await this.getUsageStats(id);
    res.json(ResponseBuilder.success(usage));
  }

  /** PATCH /platform/v1/tenants/:id */
  async updateTenant(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const { name, slug, plan, status, subscriptionExpiresAt, demoExpiresAt, maxUsers, maxVisitors } = req.body;
    if (slug && slug !== tenant.slug) {
      const clash = await Tenant.findOne({ where: { slug, id: { [Op.ne]: id } } });
      if (clash) return res.status(409).json(ResponseBuilder.error('SLUG_EXISTS', 'Slug is already in use'));
    }
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (plan !== undefined) updates.subscriptionPlan = plan;
    if (status !== undefined) updates.status = status;
    if (subscriptionExpiresAt !== undefined) updates.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
    if (demoExpiresAt !== undefined) updates.demoExpiresAt = demoExpiresAt ? new Date(demoExpiresAt) : null;
    if (maxUsers !== undefined) updates.maxUsers = maxUsers;
    if (maxVisitors !== undefined) updates.maxVisitors = maxVisitors;
    await tenant.update(updates);
    await audit(req, 'PLATFORM_TENANT_UPDATED', 'Tenant', String(id), `Updated tenant: ${tenant.name}`, id);
    const userCount = await TenantUser.count({ where: { tenantId: id, isActive: true } });
    res.json(ResponseBuilder.success(toTenantDto(tenant, userCount)));
  }

  /** POST /platform/v1/tenants/:id/suspend */
  async suspendTenant(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    await tenant.update({ status: 'suspended' });
    await audit(req, 'PLATFORM_TENANT_SUSPENDED', 'Tenant', String(id), `Suspended tenant: ${tenant.name}`, id);
    const userCount = await TenantUser.count({ where: { tenantId: id, isActive: true } });
    res.json(ResponseBuilder.success(toTenantDto(tenant, userCount)));
  }

  /** POST /platform/v1/tenants/:id/activate */
  async activateTenant(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    await tenant.update({ status: tenant.isDemo ? 'trial' : 'active' });
    await audit(req, 'PLATFORM_TENANT_ACTIVATED', 'Tenant', String(id), `Activated tenant: ${tenant.name}`, id);
    const userCount = await TenantUser.count({ where: { tenantId: id, isActive: true } });
    res.json(ResponseBuilder.success(toTenantDto(tenant, userCount)));
  }

  /** DELETE /platform/v1/tenants/:id — cascade delete all tenant data in a transaction. */
  async deleteTenant(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    // Log BEFORE deleting (tenantId=0 because the tenant row will be gone).
    await audit(req, 'PLATFORM_TENANT_DELETED', 'Tenant', String(id), `Deleted tenant: ${tenant.name} (${tenant.slug}) and all associated data`);
    await sequelize.transaction(async (t) => {
      // Delete child records in dependency order. IntermittentLogs cascade on Visit delete,
      // but we delete them explicitly to be safe across DBs.
      const visitIds = (await Visit.findAll({ where: { tenantId: id }, attributes: ['id'], transaction: t })).map(v => v.id);
      if (visitIds.length) await IntermittentLog.destroy({ where: { visit_id: { [Op.in]: visitIds } }, transaction: t });
      await VisitorEditHistory.destroy({ where: { tenantId: id }, transaction: t });
      await Visit.destroy({ where: { tenantId: id }, transaction: t });
      await Visitor.destroy({ where: { tenantId: id }, transaction: t });
      await TenantUser.destroy({ where: { tenantId: id }, transaction: t });
      await ActivityLog.destroy({ where: { tenantId: id }, transaction: t });
      await tenant.destroy({ transaction: t });
    });
    res.json(ResponseBuilder.success({ message: 'Tenant deleted successfully' }));
  }

  /** GET /platform/v1/tenants/:id/users */
  async listTenantUsers(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const memberships = await TenantUser.findAll({
      where: { tenantId: id },
      include: [{ model: User, required: false }],
      order: [['createdAt', 'DESC']],
    });
    const items = memberships.map(m => toTenantUserDto(m, (m as unknown as { User?: typeof User.prototype }).User ?? null));
    res.json(ResponseBuilder.success(items));
  }

  /** POST /platform/v1/tenants/:id/users */
  async createTenantUser(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const { username, email, password, role } = req.body;
    if (!username || !role) {
      return res.status(400).json(ResponseBuilder.error('MISSING_FIELDS', 'username and role are required'));
    }
    const existing = await User.findOne({ where: { username } });
    if (existing) return res.status(409).json(ResponseBuilder.error('USERNAME_EXISTS', 'Username already exists'));
    const hashedPassword = await container.authService.hashPassword(password || 'TempPass123!');
    const user = await User.create({
      username,
      email: email ?? null,
      password: hashedPassword,
      role,
      isSuperAdmin: false,
      mustChangePassword: !password,
    });
    const membership = await TenantUser.create({ userId: user.id, tenantId: id, role, isActive: true });
    await audit(req, 'PLATFORM_TENANT_USER_CREATED', 'TenantUser', String(membership.id), `Created tenant user: ${username} (role: ${role})`, id);
    res.status(201).json(ResponseBuilder.success(toTenantUserDto(membership, user)));
  }

  /** PATCH /platform/v1/tenants/:id/users/:userId */
  async updateTenantUser(req: Request, res: Response) {
    const tenantId = parseId(req, 'id');
    const membershipId = parseId(req, 'userId');
    if (tenantId === null || membershipId === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid ID'));
    const membership = await TenantUser.findOne({ where: { id: membershipId, tenantId }, include: [{ model: User, required: false }] });
    if (!membership) return res.status(404).json(ResponseBuilder.error('TENANT_USER_NOT_FOUND', 'Tenant user not found'));
    const { username, email, role, isActive } = req.body;
    const user = (membership as unknown as { User?: typeof User.prototype }).User;
    if (user) {
      const userUpdates: Record<string, unknown> = {};
      if (username !== undefined) userUpdates.username = username;
      if (email !== undefined) userUpdates.email = email;
      if (Object.keys(userUpdates).length) await user.update(userUpdates);
    }
    const memUpdates: Record<string, unknown> = {};
    if (role !== undefined) memUpdates.role = role;
    if (isActive !== undefined) memUpdates.isActive = isActive;
    if (Object.keys(memUpdates).length) await membership.update(memUpdates);
    await audit(req, 'PLATFORM_TENANT_USER_UPDATED', 'TenantUser', String(membershipId), `Updated tenant user membership ${membershipId}`, tenantId);
    await membership.reload({ include: [{ model: User, required: false }] });
    res.json(ResponseBuilder.success(toTenantUserDto(membership, (membership as unknown as { User?: typeof User.prototype }).User ?? null)));
  }

  /** DELETE /platform/v1/tenants/:id/users/:userId */
  async deleteTenantUser(req: Request, res: Response) {
    const tenantId = parseId(req, 'id');
    const membershipId = parseId(req, 'userId');
    if (tenantId === null || membershipId === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid ID'));
    const membership = await TenantUser.findOne({ where: { id: membershipId, tenantId } });
    if (!membership) return res.status(404).json(ResponseBuilder.error('TENANT_USER_NOT_FOUND', 'Tenant user not found'));
    await membership.destroy();
    await audit(req, 'PLATFORM_TENANT_USER_DELETED', 'TenantUser', String(membershipId), `Removed tenant user membership ${membershipId}`, tenantId);
    res.json(ResponseBuilder.success({ message: 'Tenant user removed successfully' }));
  }

  /** POST /platform/v1/tenants/:id/users/:userId/reset-password */
  async resetTenantUserPassword(req: Request, res: Response) {
    const tenantId = parseId(req, 'id');
    const membershipId = parseId(req, 'userId');
    if (tenantId === null || membershipId === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid ID'));
    const membership = await TenantUser.findOne({ where: { id: membershipId, tenantId } });
    if (!membership) return res.status(404).json(ResponseBuilder.error('TENANT_USER_NOT_FOUND', 'Tenant user not found'));
    const temporaryPassword = `Reset-${Math.random().toString(36).slice(2, 10)}*`;
    const hashed = await container.authService.hashPassword(temporaryPassword);
    await User.update({ password: hashed, mustChangePassword: true }, { where: { id: membership.userId } });
    container.tokenBlacklist.invalidateUserTokens(membership.userId);
    await audit(req, 'PLATFORM_TENANT_USER_PASSWORD_RESET', 'TenantUser', String(membershipId), `Reset password for tenant user ${membershipId}`, tenantId);
    res.json(ResponseBuilder.success({ temporaryPassword }));
  }

  /** GET /platform/v1/tenants/:id/audit-logs */
  async listTenantAuditLogs(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const where: WhereOptions = { tenantId: id };
    if (req.query.action) where.action = req.query.action;
    if (req.query.username) where.username = { [Op.iLike]: `%${String(req.query.username)}%` };
    if (req.query.startDate || req.query.endDate) {
      where.createdAt = {};
      if (req.query.startDate) (where.createdAt as Record<symbol, Date>)[Op.gte] = new Date(String(req.query.startDate));
      if (req.query.endDate) {
        const end = new Date(String(req.query.endDate));
        end.setHours(23, 59, 59, 999);
        (where.createdAt as Record<symbol, Date>)[Op.lte] = end;
      }
    }
    if (req.query.search) {
      where[Op.or as unknown as string] = [
        { details: { [Op.iLike]: `%${String(req.query.search)}%` } },
        { entityId: { [Op.iLike]: `%${String(req.query.search)}%` } },
      ];
    }
    const { rows, count } = await ActivityLog.findAndCountAll({ where, limit: pageSize, offset, order: [['createdAt', 'DESC']] });
    const items = rows.map(l => toAuditLogDto(l, tenant.name));
    res.json(ResponseBuilder.success(items, { page, limit: pageSize, total: count, totalPages: Math.ceil(count / pageSize) }));
  }

  /** GET /platform/v1/tenants/:id/backups */
  async listTenantBackups(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const backups = await container.backupService.listBackups(id);
    const items = backups.map(b => ({
      id: b.name,
      tenantId: String(id),
      fileName: b.name,
      size: `${(b.sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
      createdAt: b.date.toISOString(),
      status: 'completed' as const,
    }));
    res.json(ResponseBuilder.success(items));
  }

  // ===================== USERS (GLOBAL) =====================

  /** GET /platform/v1/users */
  async listUsers(req: Request, res: Response) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const where: WhereOptions = {};
    const isSuperAdminQuery = req.query.isSuperAdmin;
    if (isSuperAdminQuery !== undefined) {
      where.isSuperAdmin = String(isSuperAdminQuery) === 'true';
    }
    if (req.query.search) {
      const q = `%${String(req.query.search)}%`;
      where[Op.or as unknown as string] = [{ username: { [Op.iLike]: q } }, { email: { [Op.iLike]: q } }];
    }
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const order = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';
    const { rows, count } = await User.findAndCountAll({
      where,
      limit: pageSize,
      offset,
      order: [[sortBy === 'username' ? 'username' : 'createdAt', order]],
    });
    // Attach first tenant membership for each user.
    const userIds = rows.map(u => u.id);
    const memberships = userIds.length
      ? await TenantUser.findAll({
          where: { userId: { [Op.in]: userIds }, isActive: true },
          include: [{ model: Tenant, attributes: ['name', 'slug'] }],
        })
      : [];
    const firstByUser = new Map<number, { tenantId: number; tenantName: string; tenantSlug: string }>();
    for (const m of memberships) {
      const uid = m.userId;
      if (firstByUser.has(uid)) continue;
      const t = (m as unknown as { Tenant?: typeof Tenant.prototype }).Tenant;
      firstByUser.set(uid, { tenantId: m.tenantId, tenantName: t?.name ?? 'Unknown', tenantSlug: t?.slug ?? 'unknown' });
    }
    const items = rows.map(u => toPlatformUserDto(u, firstByUser.get(u.id) ?? null));
    res.json(ResponseBuilder.success(items, { page, limit: pageSize, total: count, totalPages: Math.ceil(count / pageSize) }));
  }

  /** GET /platform/v1/users/:id */
  async getUser(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
    const memberships = await TenantUser.findAll({
      where: { userId: id, isActive: true },
      include: [{ model: Tenant, attributes: ['id', 'name', 'slug'] }],
    });
    const tenants = memberships.map(m => {
      const t = (m as unknown as { Tenant?: typeof Tenant.prototype }).Tenant;
      return { tenantId: String(t?.id ?? m.tenantId), tenantName: t?.name ?? 'Unknown', tenantSlug: t?.slug ?? 'unknown', role: m.role };
    });
    const dto = toPlatformUserDto(user, tenants[0] ? { tenantId: Number(tenants[0].tenantId), tenantName: tenants[0].tenantName, tenantSlug: tenants[0].tenantSlug } : null);
    res.json(ResponseBuilder.success({ ...dto, tenants }));
  }

  /** PATCH /platform/v1/users/:id */
  async updateUser(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
    const { email, isSuperAdmin, isActive, role } = req.body;
    const updates: Record<string, unknown> = {};
    if (email !== undefined) updates.email = email;
    if (isSuperAdmin !== undefined) updates.isSuperAdmin = isSuperAdmin;
    if (role !== undefined) updates.role = role;
    // isActive is not a column on User; tenant memberships control active state.
    if (Object.keys(updates).length) await user.update(updates);
    if (isActive !== undefined) {
      await TenantUser.update({ isActive }, { where: { userId: id } });
    }
    container.tokenBlacklist.invalidateUserTokens(id);
    await audit(req, 'PLATFORM_USER_UPDATED', 'User', String(id), `Updated user: ${user.username}`);
    res.json(ResponseBuilder.success(toPlatformUserDto(user, null)));
  }

  /** DELETE /platform/v1/users/:id */
  async deleteUser(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
    if (user.isSuperAdmin) {
      return res.status(403).json(ResponseBuilder.error('CANNOT_DELETE_SUPERADMIN', 'Cannot delete a superadmin user'));
    }
    await user.destroy();
    container.tokenBlacklist.invalidateUserTokens(id);
    await audit(req, 'PLATFORM_USER_DELETED', 'User', String(id), `Deleted user: ${user.username}`);
    res.json(ResponseBuilder.success({ message: 'User deleted successfully' }));
  }

  /** POST /platform/v1/users/:id/grant-superadmin */
  async grantSuperAdmin(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
    await user.update({ isSuperAdmin: true });
    container.tokenBlacklist.invalidateUserTokens(id);
    await audit(req, 'PLATFORM_USER_GRANT_SUPERADMIN', 'User', String(id), `Granted superadmin to: ${user.username}`);
    res.json(ResponseBuilder.success(toPlatformUserDto(user, null)));
  }

  /** POST /platform/v1/users/:id/revoke-superadmin */
  async revokeSuperAdmin(req: Request, res: Response) {
    const id = parseId(req, 'id');
    if (id === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
    const actor = getActor(req);
    if (user.id === actor.id) {
      return res.status(403).json(ResponseBuilder.error('CANNOT_REVOKE_SELF', 'Cannot revoke your own superadmin privileges'));
    }
    await user.update({ isSuperAdmin: false });
    container.tokenBlacklist.invalidateUserTokens(id);
    await audit(req, 'PLATFORM_USER_REVOKE_SUPERADMIN', 'User', String(id), `Revoked superadmin from: ${user.username}`);
    res.json(ResponseBuilder.success(toPlatformUserDto(user, null)));
  }

  // ===================== SUBSCRIPTIONS =====================

  /** GET /platform/v1/subscriptions */
  async listSubscriptions(_req: Request, res: Response) {
    const tenants = await Tenant.findAll({ order: [['createdAt', 'DESC']] });
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items = tenants.map(t => {
      const plan = normalizeSubscriptionPlan(t.subscriptionPlan);
      const mrr = getPlanPrice(t.subscriptionPlan);
      return {
        tenantId: String(t.id),
        tenantName: t.name,
        slug: t.slug,
        status: t.isDemo ? 'demo' : (t.status ?? 'active'),
        plan: t.isDemo ? 'demo' : plan,
        expiryDate: t.subscriptionExpiresAt ? t.subscriptionExpiresAt.toISOString() : null,
        createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
        isDemo: !!t.isDemo,
        mrr,
        expiringSoon: !!(t.subscriptionExpiresAt && t.subscriptionExpiresAt <= in30 && t.subscriptionExpiresAt >= now),
      };
    });
    const planDistribution = (['free', 'starter', 'professional', 'enterprise'] as const).map(p => ({
      plan: p,
      count: tenants.filter(t => !t.isDemo && normalizeSubscriptionPlan(t.subscriptionPlan) === p).length,
    }));
    const totalRevenue = items.reduce((sum, s) => sum + s.mrr, 0);
    const expiringSoon = items.filter(s => s.expiringSoon).length;
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const churned = await Tenant.count({ where: { status: 'suspended', updatedAt: { [Op.gte]: monthAgo } } });
    res.json(ResponseBuilder.success({
      subscriptions: items,
      planDistribution,
      totalRevenue,
      expiringSoon,
      churned,
    }));
  }

  /** PATCH /platform/v1/subscriptions/:tenantId */
  async updateSubscription(req: Request, res: Response) {
    const tenantId = parseId(req, 'tenantId');
    if (tenantId === null) return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid tenant ID'));
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
    const { plan, subscriptionExpiresAt, limitsOverride } = req.body;
    const updates: Record<string, unknown> = {};
    if (plan !== undefined) {
      updates.subscriptionPlan = plan;
      const limits = getSubscriptionLimits(plan);
      if (limitsOverride?.maxUsers !== undefined) updates.maxUsers = limitsOverride.maxUsers;
      else if (limits.maxUsers !== null) updates.maxUsers = limits.maxUsers;
      if (limitsOverride?.maxVisitors !== undefined) updates.maxVisitors = limitsOverride.maxVisitors;
      else if (limits.maxVisitors !== null) updates.maxVisitors = limits.maxVisitors;
    }
    if (subscriptionExpiresAt !== undefined) updates.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
    await tenant.update(updates);
    await audit(req, 'PLATFORM_SUBSCRIPTION_UPDATED', 'Tenant', String(tenantId), `Updated subscription for tenant: ${tenant.name} (plan: ${tenant.subscriptionPlan})`, tenantId);
    const mrr = getPlanPrice(tenant.subscriptionPlan);
    res.json(ResponseBuilder.success({
      tenantId: String(tenant.id),
      tenantName: tenant.name,
      slug: tenant.slug,
      status: tenant.isDemo ? 'demo' : (tenant.status ?? 'active'),
      plan: tenant.isDemo ? 'demo' : normalizeSubscriptionPlan(tenant.subscriptionPlan),
      expiryDate: tenant.subscriptionExpiresAt ? tenant.subscriptionExpiresAt.toISOString() : null,
      createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
      isDemo: !!tenant.isDemo,
      mrr,
    }));
  }

  // ===================== STATS =====================

  /** GET /platform/v1/stats */
  async getStats(_req: Request, res: Response) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [
      totalTenants, activeTenants, suspendedTenants, demoTenants, totalUsers,
      newSignupsThisMonth, planDistRows, tenantsGrowthRows,
    ] = await Promise.all([
      Tenant.count(),
      Tenant.count({ where: { status: 'active', isDemo: false } }),
      Tenant.count({ where: { status: 'suspended' } }),
      Tenant.count({ where: { isDemo: true } }),
      User.count(),
      User.count({ where: { createdAt: { [Op.gte]: monthStart } } as WhereOptions }),
      Tenant.findAll({ attributes: ['subscriptionPlan', [fn('COUNT', col('id')), 'count']], where: { isDemo: false }, group: ['subscriptionPlan'], raw: true }),
      this.getTenantsGrowth(12),
    ]);

    const planDistribution = (['free', 'starter', 'professional', 'enterprise'] as const).map(p => ({
      plan: p,
      count: (planDistRows as unknown as Array<{ subscriptionPlan: string; count: number }>).find(r => r.subscriptionPlan === p)?.count ?? 0,
    }));
    const revenueByPlan = planDistribution.map(p => ({ plan: p.plan, revenue: p.count * getPlanPrice(p.plan) }));
    const mrrEstimate = revenueByPlan.reduce((sum, r) => sum + r.revenue, 0);

    // Churn rate: suspended in last 30 days / total tenants (as percentage).
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentlySuspended = await Tenant.count({ where: { status: 'suspended', updatedAt: { [Op.gte]: monthAgo } } });
    const churnRate = totalTenants > 0 ? Number(((recentlySuspended / totalTenants) * 100).toFixed(2)) : 0;

    // Recent signups (last 7 days)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.findAll({
      where: { createdAt: { [Op.gte]: weekAgo } } as WhereOptions,
      order: [['createdAt', 'DESC']],
      limit: 10,
    });
    const recentUserIds = recentUsers.map(u => u.id);
    const recentMemberships = recentUserIds.length
      ? await TenantUser.findAll({ where: { userId: { [Op.in]: recentUserIds }, isActive: true }, include: [{ model: Tenant, attributes: ['name', 'slug'] }] })
      : [];
    const firstByUser = new Map<number, { tenantId: number; tenantName: string; tenantSlug: string }>();
    for (const m of recentMemberships) {
      if (firstByUser.has(m.userId)) continue;
      const t = (m as unknown as { Tenant?: typeof Tenant.prototype }).Tenant;
      firstByUser.set(m.userId, { tenantId: m.tenantId, tenantName: t?.name ?? 'Unknown', tenantSlug: t?.slug ?? 'unknown' });
    }
    const recentSignups = recentUsers.map(u => toPlatformUserDto(u, firstByUser.get(u.id) ?? null));

    res.json(ResponseBuilder.success({
      totalTenants,
      activeTenants,
      suspendedTenants,
      demoTenants,
      totalUsers,
      mrrEstimate,
      churnRate,
      newSignupsThisMonth,
      recentSignups,
      tenantsGrowth: tenantsGrowthRows,
      planDistribution,
      revenueByPlan,
    }));
  }

  // ===================== AUDIT LOGS (GLOBAL) =====================

  /** GET /platform/v1/audit-logs — cross-tenant with filters and optional CSV export. */
  async listAuditLogs(req: Request, res: Response) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const where: WhereOptions = {};
    if (req.query.tenantId) where.tenantId = Number(req.query.tenantId);
    if (req.query.action) where.action = req.query.action;
    if (req.query.username) where.username = { [Op.iLike]: `%${String(req.query.username)}%` };
    if (req.query.startDate || req.query.endDate) {
      where.createdAt = {};
      if (req.query.startDate) (where.createdAt as Record<symbol, Date>)[Op.gte] = new Date(String(req.query.startDate));
      if (req.query.endDate) {
        const end = new Date(String(req.query.endDate));
        end.setHours(23, 59, 59, 999);
        (where.createdAt as Record<symbol, Date>)[Op.lte] = end;
      }
    }
    if (req.query.search) {
      where[Op.or as unknown as string] = [
        { details: { [Op.iLike]: `%${String(req.query.search)}%` } },
        { entityId: { [Op.iLike]: `%${String(req.query.search)}%` } },
        { username: { [Op.iLike]: `%${String(req.query.search)}%` } },
      ];
    }

    // Export mode: return all matching rows as CSV.
    if (req.query.export === 'csv') {
      const rows = await ActivityLog.findAll({ where, order: [['createdAt', 'DESC']], limit: 10000 });
      const header = ['id', 'tenantId', 'userId', 'username', 'action', 'entity', 'entityId', 'details', 'ipAddress', 'createdAt'];
      const body = rows.map(r => [r.id, r.tenantId, r.userId, r.username, r.action, r.entity, r.entityId, r.details, r.ipAddress, r.createdAt?.toISOString()].map(csvCell).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      res.send('\uFEFF' + [header.map(csvCell).join(','), ...body].join('\n'));
      return;
    }

    const { rows, count } = await ActivityLog.findAndCountAll({ where, limit: pageSize, offset, order: [['createdAt', 'DESC']] });
    // Attach tenant names.
    const tenantIds = [...new Set(rows.map(r => r.tenantId).filter(Boolean))] as number[];
    const tenants = tenantIds.length ? await Tenant.findAll({ where: { id: { [Op.in]: tenantIds } }, attributes: ['id', 'name'] }) : [];
    const tenantNameMap = new Map<number, string>();
    tenants.forEach(t => tenantNameMap.set(t.id, t.name));
    const items = rows.map(l => toAuditLogDto(l, l.tenantId ? tenantNameMap.get(l.tenantId) : undefined));
    res.json(ResponseBuilder.success(items, { page, limit: pageSize, total: count, totalPages: Math.ceil(count / pageSize) }));
  }

  // ===================== SETTINGS =====================

  /** GET /platform/v1/settings */
  async getSettings(_req: Request, res: Response) {
    const plans = (['free', 'starter', 'professional', 'enterprise'] as const);
    const defaultPlanLimits = {} as Record<string, { maxUsers: number; visitsPerMonth: number }>;
    for (const p of plans) {
      const limits = getSubscriptionLimits(p);
      defaultPlanLimits[p] = { maxUsers: limits.maxUsers ?? 0, visitsPerMonth: limits.visitsPerMonth ?? 0 };
    }
    res.json(ResponseBuilder.success({
      defaultPlanLimits,
      demoTenantDurationHours: 24,
      backupRetentionDays: 30,
      featureFlags: {
        enableDemoProvisioning: true,
        enablePublicSignup: false,
        enableWebhooks: true,
      },
    }));
  }

  /** PUT /platform/v1/settings */
  async updateSettings(req: Request, res: Response) {
    // Settings are currently read-only from config; echo back the provided payload.
    await audit(req, 'PLATFORM_SETTINGS_UPDATED', 'Settings', '0', 'Updated platform settings');
    res.json(ResponseBuilder.success(req.body));
  }

  // ===================== INTERNAL HELPERS =====================

  /** Compute usage stats for a tenant, compared against plan limits. */
  private async getUsageStats(tenantId: number) {
    const tenant = await Tenant.findByPk(tenantId);
    const limits = getSubscriptionLimits(tenant?.subscriptionPlan);
    const [visitsCount, visitorsCount, usersCount] = await Promise.all([
      Visit.count({ where: { tenantId } }),
      Visitor.count({ where: { tenantId } }),
      TenantUser.count({ where: { tenantId, isActive: true } }),
    ]);
    return {
      visitsCount,
      visitorsCount,
      usersCount,
      maxUsers: tenant?.maxUsers ?? limits.maxUsers ?? 0,
      maxVisitors: tenant?.maxVisitors ?? limits.maxVisitors ?? 0,
      visitsPerMonthLimit: limits.visitsPerMonth,
    };
  }

  /** Tenants created per month for the last N months. */
  private async getTenantsGrowth(months: number): Promise<Array<{ month: string; count: number }>> {
    const now = new Date();
    const result: Array<{ month: string; count: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
      const count = await Tenant.count({ where: { createdAt: { [Op.gte]: start, [Op.lt]: end } } });
      result.push({ month: start.toLocaleString('en', { month: 'short' }), count });
    }
    return result;
  }
}

export const platformController = new PlatformController();
