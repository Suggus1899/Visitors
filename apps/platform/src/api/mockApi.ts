import { formatISO, isAfter, parseISO, subDays, subMonths } from 'date-fns';
import type {
  AuditLogEntry,
  BackupRecord,
  CreateTenantDto,
  CreateTenantUserDto,
  LoginCredentials,
  PlatformSession,
  PlatformSettings,
  PlatformStats,
  PlatformUser,
  SubscriptionSummary,
  Tenant,
  TenantPlan,
  TenantStatus,
  TenantUsage,
  TenantUser,
  UpdatePlatformUserDto,
  UpdateTenantDto,
  UpdateTenantUserDto,
  UserRole,
} from '../types';

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

const now = () => new Date().toISOString();

let idCounter = 1;
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${idCounter++}`;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const PLAN_MRR: Record<TenantPlan, number> = {
  free: 0,
  starter: 29,
  professional: 79,
  enterprise: 299,
  demo: 0,
};

const PLAN_MAX_USERS: Record<TenantPlan, number> = {
  free: 1,
  starter: 5,
  professional: 20,
  enterprise: 200,
  demo: 5,
};

const TENANTS: Tenant[] = [
  {
    id: 'tenant-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'active',
    plan: 'professional',
    createdAt: '2023-10-01T09:00:00.000Z',
    maxUsers: 20,
    isDemo: false,
    userCount: 0,
    subscriptionExpiresAt: '2025-12-31T23:59:59.000Z',
  },
  {
    id: 'tenant-2',
    name: 'Global Industries',
    slug: 'global-industries',
    status: 'active',
    plan: 'enterprise',
    createdAt: '2024-01-20T11:30:00.000Z',
    maxUsers: 200,
    isDemo: false,
    userCount: 0,
    subscriptionExpiresAt: '2026-06-30T23:59:59.000Z',
  },
  {
    id: 'tenant-3',
    name: 'Demo LLC',
    slug: 'demo-llc',
    status: 'demo',
    plan: 'demo',
    createdAt: '2024-03-10T14:15:00.000Z',
    maxUsers: 5,
    isDemo: true,
    userCount: 0,
    demoExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    id: 'tenant-4',
    name: 'Paused SA',
    slug: 'paused-sa',
    status: 'suspended',
    plan: 'starter',
    createdAt: '2023-12-05T08:45:00.000Z',
    maxUsers: 5,
    isDemo: false,
    userCount: 0,
    subscriptionExpiresAt: null,
  },
  {
    id: 'tenant-5',
    name: 'Startup Labs',
    slug: 'startup-labs',
    status: 'active',
    plan: 'starter',
    createdAt: '2024-06-12T10:00:00.000Z',
    maxUsers: 5,
    isDemo: false,
    userCount: 0,
    subscriptionExpiresAt: '2025-01-15T23:59:59.000Z',
  },
  {
    id: 'tenant-6',
    name: 'Nimbus Tech',
    slug: 'nimbus-tech',
    status: 'active',
    plan: 'free',
    createdAt: subMonths(new Date(), 1).toISOString(),
    maxUsers: 1,
    isDemo: false,
    userCount: 0,
    subscriptionExpiresAt: null,
  },
];

const USERS: TenantUser[] = [
  {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Alice Johnson',
    email: 'alice@acme.com',
    role: 'admin',
    createdAt: '2023-10-02T09:00:00.000Z',
    lastActiveAt: '2024-07-15T12:00:00.000Z',
  },
  {
    id: 'user-2',
    tenantId: 'tenant-1',
    name: 'Bob Smith',
    email: 'bob@acme.com',
    role: 'guardia',
    createdAt: '2023-10-05T09:00:00.000Z',
    lastActiveAt: '2024-07-14T08:30:00.000Z',
  },
  {
    id: 'user-3',
    tenantId: 'tenant-2',
    name: 'Carol White',
    email: 'carol@global.com',
    role: 'admin',
    createdAt: '2024-01-21T11:30:00.000Z',
    lastActiveAt: '2024-07-16T09:15:00.000Z',
  },
  {
    id: 'user-4',
    tenantId: 'tenant-3',
    name: 'Dan Miller',
    email: 'dan@demo.com',
    role: 'admin',
    createdAt: '2024-03-11T14:15:00.000Z',
    lastActiveAt: null,
  },
  {
    id: 'user-5',
    tenantId: 'tenant-5',
    name: 'Eva Green',
    email: 'eva@startup.com',
    role: 'auditor',
    createdAt: '2024-06-13T10:00:00.000Z',
    lastActiveAt: '2024-07-13T16:45:00.000Z',
  },
  {
    id: 'user-6',
    tenantId: 'tenant-6',
    name: 'Frank Ocean',
    email: 'frank@nimbus.tech',
    role: 'admin',
    createdAt: subDays(new Date(), 3).toISOString(),
    lastActiveAt: subDays(new Date(), 1).toISOString(),
  },
];

const SUPERADMIN_USER: PlatformUser = {
  id: 'superadmin-1',
  tenantId: 'platform',
  tenantName: 'LogMaster Platform',
  tenantSlug: 'platform',
  name: 'Root Admin',
  email: 'superadmin@logmaster.io',
  role: 'admin',
  isSuperAdmin: true,
  createdAt: '2023-01-01T00:00:00.000Z',
  lastActiveAt: now(),
};

const BACKUPS: BackupRecord[] = [
  {
    id: 'bk-1',
    tenantId: 'tenant-1',
    fileName: 'acme-corp-2024-07-15.sql.gz',
    size: '12.4 MB',
    createdAt: '2024-07-15T02:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'bk-2',
    tenantId: 'tenant-1',
    fileName: 'acme-corp-2024-07-14.sql.gz',
    size: '12.1 MB',
    createdAt: '2024-07-14T02:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'bk-3',
    tenantId: 'tenant-2',
    fileName: 'global-industries-2024-07-15.sql.gz',
    size: '48.7 MB',
    createdAt: '2024-07-15T02:00:00.000Z',
    status: 'completed',
  },
];

const AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log-1',
    tenantId: 'tenant-1',
    tenantName: 'Acme Corp',
    userId: '1',
    username: 'alice',
    action: 'LOGIN',
    entity: 'User',
    entityId: 'alice',
    details: 'Successful login',
    ipAddress: '190.45.12.3',
    createdAt: '2024-07-16T09:15:00.000Z',
  },
  {
    id: 'log-2',
    tenantId: 'tenant-1',
    tenantName: 'Acme Corp',
    userId: '1',
    username: 'alice',
    action: 'VISIT_CHECKIN',
    entity: 'Visit',
    entityId: '1024',
    details: 'Checked in visitor cedula 12345678',
    ipAddress: '190.45.12.3',
    createdAt: '2024-07-16T09:20:00.000Z',
  },
  {
    id: 'log-3',
    tenantId: 'tenant-2',
    tenantName: 'Global Industries',
    userId: '3',
    username: 'carol',
    action: 'USER_UPDATE',
    entity: 'User',
    entityId: '5',
    details: 'Updated user role to auditor',
    ipAddress: '10.0.0.5',
    createdAt: '2024-07-16T10:00:00.000Z',
  },
  {
    id: 'log-4',
    tenantId: 'tenant-3',
    tenantName: 'Demo LLC',
    userId: '4',
    username: 'dan',
    action: 'BACKUP_CREATE',
    entity: 'Backup',
    entityId: 'bk-3',
    details: 'Manual backup triggered',
    ipAddress: '201.150.33.9',
    createdAt: '2024-07-15T18:30:00.000Z',
  },
];

const DEFAULT_SETTINGS: PlatformSettings = {
  defaultPlanLimits: {
    free: { maxUsers: 1, visitsPerMonth: 100 },
    starter: { maxUsers: 5, visitsPerMonth: 1000 },
    professional: { maxUsers: 20, visitsPerMonth: 100000 },
    enterprise: { maxUsers: 200, visitsPerMonth: 1000000 },
    demo: { maxUsers: 5, visitsPerMonth: 100 },
  },
  demoTenantDurationHours: 24,
  backupRetentionDays: 30,
  featureFlags: {
    enableDemoProvisioning: true,
    enablePublicSignup: false,
    enableWebhooks: true,
  },
};

let settingsStore: PlatformSettings = { ...DEFAULT_SETTINGS };

export async function login(credentials: LoginCredentials): Promise<PlatformSession> {
  await delay();
  if (!credentials.email || !credentials.password) {
    throw new Error('Email and password are required.');
  }
  // Mock: accept any credentials and grant superadmin. The real backend
  // validates isSuperAdmin on the user record.
  return {
    accessToken: `mock-access-${Date.now()}`,
    refreshToken: `mock-refresh-${Date.now()}`,
    user: {
      id: SUPERADMIN_USER.id,
      email: credentials.email,
      username: credentials.email.split('@')[0],
      role: 'root',
      isSuperAdmin: true,
    },
  };
}

export async function getStats(): Promise<PlatformStats> {
  await delay(300);
  const recentSince = subDays(new Date(), 7);
  const allPlatformUsers: PlatformUser[] = USERS.map((u) => {
    const tenant = TENANTS.find((t) => t.id === u.tenantId);
    return {
      id: u.id,
      tenantId: u.tenantId,
      tenantName: tenant?.name ?? 'Unknown',
      tenantSlug: tenant?.slug ?? 'unknown',
      name: u.name,
      email: u.email,
      role: u.role,
      isSuperAdmin: false,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
    };
  });
  const recentSignups = allPlatformUsers
    .filter((user) => isAfter(parseISO(user.createdAt), recentSince))
    .sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());

  const planDistribution: { plan: TenantPlan; count: number }[] = (
    ['free', 'starter', 'professional', 'enterprise', 'demo'] as TenantPlan[]
  )
    .map((plan) => ({ plan, count: TENANTS.filter((t) => t.plan === plan).length }))
    .filter((p) => p.count > 0);

  const revenueByPlan = planDistribution.map((p) => ({
    plan: p.plan,
    revenue: p.count * PLAN_MRR[p.plan],
  }));

  const tenantsGrowth = Array.from({ length: 7 }).map((_, i) => {
    const date = subMonths(new Date(), 6 - i);
    return {
      month: date.toLocaleString('en', { month: 'short' }),
      count: 1 + Math.floor(Math.random() * 4) + i,
    };
  });

  const mrrEstimate = TENANTS.reduce((sum, t) => sum + PLAN_MRR[t.plan], 0);
  const newSignupsThisMonth = allPlatformUsers.filter(
    (u) => parseISO(u.createdAt).getMonth() === new Date().getMonth()
  ).length;

  return {
    totalTenants: TENANTS.length,
    activeTenants: TENANTS.filter((t) => t.status === 'active').length,
    suspendedTenants: TENANTS.filter((t) => t.status === 'suspended').length,
    demoTenants: TENANTS.filter((t) => t.status === 'demo').length,
    totalUsers: USERS.length,
    mrrEstimate,
    churnRate: 2.4,
    newSignupsThisMonth,
    recentSignups,
    tenantsGrowth,
    planDistribution,
    revenueByPlan,
  };
}

export interface TenantListParams {
  search?: string;
  status?: TenantStatus | '';
  plan?: TenantPlan | '';
  isDemo?: boolean | '';
  sortBy?: 'createdAt' | 'name';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const userCountFor = (tenantId: string) => USERS.filter((u) => u.tenantId === tenantId).length;

const withUserCount = (tenant: Tenant): Tenant => ({ ...tenant, userCount: userCountFor(tenant.id) });

export async function listTenants(params: TenantListParams = {}): Promise<{ items: Tenant[]; total: number }> {
  await delay(350);
  let result = TENANTS.map(withUserCount);

  if (params.search) {
    const q = params.search.toLowerCase();
    result = result.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
    );
  }
  if (params.status) result = result.filter((t) => t.status === params.status);
  if (params.plan) result = result.filter((t) => t.plan === params.plan);
  if (params.isDemo === true) result = result.filter((t) => t.isDemo);
  if (params.isDemo === false) result = result.filter((t) => !t.isDemo);

  const sortBy = params.sortBy ?? 'createdAt';
  const order = params.order ?? 'desc';
  result.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else {
      comparison = parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime();
    }
    return order === 'asc' ? -comparison : comparison;
  });

  const total = result.length;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const items = result.slice((page - 1) * pageSize, page * pageSize);
  return { items, total };
}

export async function getTenant(id: string): Promise<Tenant> {
  await delay(250);
  const tenant = TENANTS.find((t) => t.id === id);
  if (!tenant) throw new Error(`Tenant ${id} not found.`);
  return withUserCount(tenant);
}

export async function getTenantUsage(id: string): Promise<TenantUsage> {
  await delay(250);
  const tenant = TENANTS.find((t) => t.id === id);
  if (!tenant) throw new Error(`Tenant ${id} not found.`);
  const usersCount = USERS.filter((u) => u.tenantId === id).length;
  return {
    visitsCount: Math.floor(Math.random() * 5000) + 100,
    visitorsCount: Math.floor(Math.random() * 1500) + 50,
    usersCount,
    maxUsers: tenant.maxUsers,
  };
}

export async function createTenant(dto: CreateTenantDto): Promise<Tenant> {
  await delay(500);
  const slug = dto.slug.trim() ? slugify(dto.slug) : slugify(dto.name);
  if (TENANTS.some((t) => t.slug === slug)) {
    throw new Error(`Slug "${slug}" is already in use.`);
  }
  const isDemo = dto.isDemo ?? false;
  const tenant: Tenant = {
    id: generateId('tenant'),
    name: dto.name.trim(),
    slug,
    status: isDemo ? 'demo' : 'active',
    plan: dto.plan,
    createdAt: now(),
    maxUsers: dto.maxUsers ?? PLAN_MAX_USERS[dto.plan],
    isDemo,
    userCount: 0,
    demoExpiresAt: isDemo
      ? dto.demoExpiresAt ??
        new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
      : null,
    subscriptionExpiresAt: null,
  };
  TENANTS.push(tenant);
  return withUserCount(tenant);
}

export async function updateTenant(id: string, dto: UpdateTenantDto): Promise<Tenant> {
  await delay(400);
  const index = TENANTS.findIndex((t) => t.id === id);
  if (index === -1) throw new Error(`Tenant ${id} not found.`);

  if (dto.slug) {
    const slug = slugify(dto.slug);
    if (TENANTS.some((t) => t.id !== id && t.slug === slug)) {
      throw new Error(`Slug "${slug}" is already in use.`);
    }
    TENANTS[index] = { ...TENANTS[index], slug };
  }

  TENANTS[index] = {
    ...TENANTS[index],
    ...(dto.name !== undefined && { name: dto.name.trim() }),
    ...(dto.plan !== undefined && { plan: dto.plan }),
    ...(dto.maxUsers !== undefined && { maxUsers: dto.maxUsers }),
    ...(dto.subscriptionExpiresAt !== undefined && {
      subscriptionExpiresAt: dto.subscriptionExpiresAt,
    }),
  };

  return withUserCount(TENANTS[index]);
}

export async function suspendTenant(id: string): Promise<Tenant> {
  await delay(350);
  const index = TENANTS.findIndex((t) => t.id === id);
  if (index === -1) throw new Error(`Tenant ${id} not found.`);
  TENANTS[index] = { ...TENANTS[index], status: 'suspended' };
  return withUserCount(TENANTS[index]);
}

export async function activateTenant(id: string): Promise<Tenant> {
  await delay(350);
  const index = TENANTS.findIndex((t) => t.id === id);
  if (index === -1) throw new Error(`Tenant ${id} not found.`);
  TENANTS[index] = {
    ...TENANTS[index],
    status: TENANTS[index].isDemo ? 'demo' : 'active',
  };
  return withUserCount(TENANTS[index]);
}

export async function deleteTenant(id: string): Promise<void> {
  await delay(400);
  const index = TENANTS.findIndex((t) => t.id === id);
  if (index === -1) throw new Error(`Tenant ${id} not found.`);
  TENANTS.splice(index, 1);
  for (let i = USERS.length - 1; i >= 0; i--) {
    if (USERS[i].tenantId === id) USERS.splice(i, 1);
  }
}

export async function listTenantUsers(tenantId: string): Promise<TenantUser[]> {
  await delay(300);
  return USERS.filter((u) => u.tenantId === tenantId).sort(
    (a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime()
  );
}

export async function createTenantUser(
  tenantId: string,
  dto: CreateTenantUserDto
): Promise<TenantUser> {
  await delay(450);
  const tenant = TENANTS.find((t) => t.id === tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found.`);

  const currentUsers = USERS.filter((u) => u.tenantId === tenantId).length;
  if (currentUsers >= tenant.maxUsers) {
    throw new Error('Tenant user limit reached.');
  }

  const user: TenantUser = {
    id: generateId('user'),
    tenantId,
    name: dto.name.trim(),
    email: dto.email.trim().toLowerCase(),
    role: dto.role,
    createdAt: now(),
    lastActiveAt: null,
  };
  USERS.push(user);
  return { ...user };
}

export async function updateTenantUser(
  tenantId: string,
  userId: string,
  dto: UpdateTenantUserDto
): Promise<TenantUser> {
  await delay(400);
  const index = USERS.findIndex((u) => u.id === userId && u.tenantId === tenantId);
  if (index === -1) throw new Error(`User ${userId} not found in tenant ${tenantId}.`);

  USERS[index] = {
    ...USERS[index],
    ...(dto.name !== undefined && { name: dto.name.trim() }),
    ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() }),
    ...(dto.role !== undefined && { role: dto.role }),
  };
  return { ...USERS[index] };
}

export async function deleteTenantUser(tenantId: string, userId: string): Promise<void> {
  await delay(350);
  const index = USERS.findIndex((u) => u.id === userId && u.tenantId === tenantId);
  if (index === -1) throw new Error(`User ${userId} not found in tenant ${tenantId}.`);
  USERS.splice(index, 1);
}

export async function resetTenantUserPassword(
  tenantId: string,
  userId: string
): Promise<{ temporaryPassword: string }> {
  await delay(500);
  const user = USERS.find((u) => u.id === userId && u.tenantId === tenantId);
  if (!user) throw new Error(`User ${userId} not found in tenant ${tenantId}.`);
  const temporaryPassword = `Reset-${Math.random().toString(36).slice(2, 10)}*`;
  return { temporaryPassword };
}

export async function listTenantBackups(tenantId: string): Promise<BackupRecord[]> {
  await delay(300);
  return BACKUPS.filter((b) => b.tenantId === tenantId).sort(
    (a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime()
  );
}

export async function listTenantAuditLogs(tenantId: string): Promise<AuditLogEntry[]> {
  await delay(300);
  return AUDIT_LOGS.filter((l) => l.tenantId === tenantId).sort(
    (a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime()
  );
}

export async function listPlatformUsers(params: {
  search?: string;
  isSuperAdmin?: boolean | '';
} = {}): Promise<PlatformUser[]> {
  await delay(350);
  let result: PlatformUser[] = USERS.map((u) => {
    const tenant = TENANTS.find((t) => t.id === u.tenantId);
    return {
      id: u.id,
      tenantId: u.tenantId,
      tenantName: tenant?.name ?? 'Unknown',
      tenantSlug: tenant?.slug ?? 'unknown',
      name: u.name,
      email: u.email,
      role: u.role,
      isSuperAdmin: false,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
    };
  });
  result = [...result, SUPERADMIN_USER];

  if (params.search) {
    const q = params.search.toLowerCase();
    result = result.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }
  if (params.isSuperAdmin === true) result = result.filter((u) => u.isSuperAdmin);
  if (params.isSuperAdmin === false) result = result.filter((u) => !u.isSuperAdmin);

  return result.sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());
}

export async function updatePlatformUser(
  id: string,
  dto: UpdatePlatformUserDto
): Promise<PlatformUser> {
  await delay(400);
  if (id === SUPERADMIN_USER.id) {
    Object.assign(SUPERADMIN_USER, dto);
    return { ...SUPERADMIN_USER };
  }
  const index = USERS.findIndex((u) => u.id === id);
  if (index === -1) throw new Error(`User ${id} not found.`);
  USERS[index] = {
    ...USERS[index],
    ...(dto.name !== undefined && { name: dto.name.trim() }),
    ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() }),
    ...(dto.role !== undefined && { role: dto.role }),
  };
  const tenant = TENANTS.find((t) => t.id === USERS[index].tenantId);
  return {
    id: USERS[index].id,
    tenantId: USERS[index].tenantId,
    tenantName: tenant?.name ?? 'Unknown',
    tenantSlug: tenant?.slug ?? 'unknown',
    name: USERS[index].name,
    email: USERS[index].email,
    role: USERS[index].role,
    isSuperAdmin: dto.isSuperAdmin ?? false,
    createdAt: USERS[index].createdAt,
    lastActiveAt: USERS[index].lastActiveAt,
  };
}

export async function deletePlatformUser(id: string): Promise<void> {
  await delay(400);
  if (id === SUPERADMIN_USER.id) {
    throw new Error('Cannot delete the platform superadmin.');
  }
  const index = USERS.findIndex((u) => u.id === id);
  if (index === -1) throw new Error(`User ${id} not found.`);
  USERS.splice(index, 1);
}

export async function listSubscriptions(): Promise<SubscriptionSummary[]> {
  await delay(350);
  return TENANTS.map((tenant) => ({
    tenantId: tenant.id,
    tenantName: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    plan: tenant.plan,
    expiryDate: tenant.subscriptionExpiresAt ?? null,
    createdAt: tenant.createdAt,
    isDemo: tenant.isDemo,
    mrr: PLAN_MRR[tenant.plan],
  })).sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());
}

export interface UpdateSubscriptionDto {
  plan: TenantPlan;
  expiryDate: string | null;
}

export async function updateSubscription(
  tenantId: string,
  dto: UpdateSubscriptionDto
): Promise<SubscriptionSummary> {
  await delay(400);
  const tenant = TENANTS.find((t) => t.id === tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found.`);

  tenant.plan = dto.plan;
  tenant.subscriptionExpiresAt = dto.expiryDate ? formatISO(parseISO(dto.expiryDate)) : null;
  tenant.maxUsers = PLAN_MAX_USERS[dto.plan];

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    plan: tenant.plan,
    expiryDate: tenant.subscriptionExpiresAt,
    createdAt: tenant.createdAt,
    isDemo: tenant.isDemo,
    mrr: PLAN_MRR[tenant.plan],
  };
}

export async function listAuditLogs(params: {
  search?: string;
  action?: string;
  tenantId?: string;
} = {}): Promise<AuditLogEntry[]> {
  await delay(350);
  let result = [...AUDIT_LOGS];
  if (params.search) {
    const q = params.search.toLowerCase();
    result = result.filter(
      (l) =>
        l.username.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.details ?? '').toLowerCase().includes(q)
    );
  }
  if (params.action) result = result.filter((l) => l.action === params.action);
  if (params.tenantId) result = result.filter((l) => l.tenantId === params.tenantId);
  return result.sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());
}

export async function getSettings(): Promise<PlatformSettings> {
  await delay(250);
  return { ...settingsStore };
}

export async function updateSettings(settings: PlatformSettings): Promise<PlatformSettings> {
  await delay(400);
  settingsStore = { ...settings };
  return { ...settingsStore };
}

export function getRoles(): UserRole[] {
  return ['admin', 'operador', 'auditor', 'guardia'];
}

export function getPlans(): TenantPlan[] {
  return ['free', 'starter', 'professional', 'enterprise', 'demo'];
}

export function getStatuses(): TenantStatus[] {
  return ['active', 'suspended', 'demo', 'trial'];
}

export const PLAN_MRR_MAP = PLAN_MRR;
