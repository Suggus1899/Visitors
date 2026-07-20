export type TenantStatus = 'active' | 'suspended' | 'demo' | 'trial';

export type TenantPlan = 'free' | 'starter' | 'professional' | 'enterprise' | 'demo';

export type UserRole = 'admin' | 'operador' | 'auditor' | 'guardia';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  createdAt: string;
  maxUsers: number;
  isDemo: boolean;
  userCount: number;
  demoExpiresAt?: string | null;
  subscriptionExpiresAt?: string | null;
}

/**
 * Form-shaped input used by the Tenants CRUD modal. Maps to either
 * CreateTenantDto or UpdateTenantDto before hitting the API layer.
 */
export interface TenantInput {
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
}

export interface TenantUsage {
  visitsCount: number;
  visitorsCount: number;
  usersCount: number;
  maxUsers: number;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastActiveAt: string | null;
  isSuperAdmin?: boolean;
}

export interface PlatformUser {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  name: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface BackupRecord {
  id: string;
  tenantId: string;
  fileName: string;
  size: string;
  createdAt: string;
  status: 'completed' | 'failed' | 'in_progress';
}

export interface AuditLogEntry {
  id: string;
  tenantId?: string;
  tenantName?: string;
  userId: string;
  username: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  demoTenants: number;
  totalUsers: number;
  mrrEstimate: number;
  churnRate: number;
  newSignupsThisMonth: number;
  recentSignups: PlatformUser[];
  tenantsGrowth: { month: string; count: number }[];
  planDistribution: { plan: TenantPlan; count: number }[];
  revenueByPlan: { plan: TenantPlan; revenue: number }[];
}

export interface CreateTenantDto {
  name: string;
  slug: string;
  plan: TenantPlan;
  isDemo?: boolean;
  demoExpiresAt?: string | null;
  maxUsers?: number;
}

export interface UpdateTenantDto {
  name?: string;
  slug?: string;
  plan?: TenantPlan;
  maxUsers?: number;
  subscriptionExpiresAt?: string | null;
}

export interface CreateTenantUserDto {
  name: string;
  email: string;
  role: UserRole;
  password?: string;
}

export interface UpdateTenantUserDto {
  name?: string;
  email?: string;
  role?: UserRole;
}

export interface UpdatePlatformUserDto {
  name?: string;
  email?: string;
  role?: UserRole;
  isSuperAdmin?: boolean;
}

export interface SubscriptionSummary {
  tenantId: string;
  tenantName: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  expiryDate: string | null;
  createdAt: string;
  isDemo: boolean;
  mrr: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface PlatformSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
    isSuperAdmin: boolean;
  };
}

export interface PlatformSettings {
  defaultPlanLimits: Record<TenantPlan, { maxUsers: number; visitsPerMonth: number }>;
  demoTenantDurationHours: number;
  backupRetentionDays: number;
  featureFlags: {
    enableDemoProvisioning: boolean;
    enablePublicSignup: boolean;
    enableWebhooks: boolean;
  };
}

/**
 * Platform API path conventions.
 *
 * NOTE: The task spec defines a `/platform/v1/*` namespace for superadmin
 * endpoints. The current server exposes superadmin routes under
 * `/api/v1/superadmin/*` instead. The API client maps the spec paths to the
 * real server paths and falls back to mocks when the backend is not ready.
 *
 * TODO(backend): Align server routes with the `/platform/v1/*` namespace
 * (or update these constants to match the final server contract).
 */
export const API_PATHS = {
  login: '/api/v1/auth/login',
  refresh: '/api/v1/auth/refresh',
  logout: '/api/v1/auth/logout',
  stats: '/api/v1/platform/stats',
  tenants: '/api/v1/platform/tenants',
  tenant: (id: string) => `/api/v1/platform/tenants/${id}`,
  tenantSuspend: (id: string) => `/api/v1/platform/tenants/${id}/suspend`,
  tenantActivate: (id: string) => `/api/v1/platform/tenants/${id}/activate`,
  tenantUsage: (id: string) => `/api/v1/platform/tenants/${id}/usage`,
  tenantUsers: (id: string) => `/api/v1/platform/tenants/${id}/users`,
  tenantUser: (id: string, userId: string) => `/api/v1/platform/tenants/${id}/users/${userId}`,
  tenantBackups: (id: string) => `/api/v1/platform/tenants/${id}/backups`,
  tenantAuditLogs: (id: string) => `/api/v1/platform/tenants/${id}/audit-logs`,
  users: '/api/v1/platform/users',
  user: (id: string) => `/api/v1/platform/users/${id}`,
  subscriptions: '/api/v1/platform/subscriptions',
  subscription: (id: string) => `/api/v1/platform/subscriptions/${id}`,
  auditLogs: '/api/v1/platform/audit-logs',
  settings: '/api/v1/platform/settings',
} as const;
