import { apiClient, unwrap } from './client';
import * as mock from './mockApi';
import { API_PATHS } from '../types';
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
  TenantUsage,
  TenantUser,
  UpdatePlatformUserDto,
  UpdateTenantDto,
  UpdateTenantUserDto,
} from '../types';

/**
 * Unified platform API.
 *
 * Every method attempts the REAL backend endpoint first. If the backend is not
 * ready (network error, 404, 405, or a non-JSON response), it gracefully falls
 * back to the in-memory mock so the superadmin console stays fully functional
 * during development.
 *
 * TODO(backend): Implement the `/platform/v1/*` endpoints on the server. Once
 * they are live, remove the mock fallback for each method (search for
 * `TODO(backend)` in this file).
 */

const isBackendNotReady = (error: unknown): boolean => {
  const err = error as { response?: { status?: number }; code?: string; message?: string };
  if (!err) return true;
  // Network errors, CORS errors, or 404/405 (endpoint not implemented yet).
  if (err.code === 'ERR_NETWORK' || err.code === 'ERR_CANCELED') return true;
  if (!err.response) return true;
  const status = err.response.status;
  return status === 404 || status === 405 || status === 502 || status === 504;
};

const withFallback = async <T>(real: () => Promise<T>, fallback: () => Promise<T>): Promise<T> => {
  try {
    return await real();
  } catch (error) {
    if (isBackendNotReady(error)) {
      return fallback();
    }
    throw error;
  }
};

export const platformApi = {
  /** POST /v1/auth/login — only isSuperAdmin users may proceed. */
  async login(credentials: LoginCredentials): Promise<PlatformSession> {
    // TODO(backend): The real server uses username (not email) and returns
    // { token, accessToken, refreshToken, user: { username, role, mustChangePassword } }.
    // It does NOT currently return isSuperAdmin. Until the server includes
    // isSuperAdmin in the login response, we fall back to mock for the guard.
    return withFallback(
      async () => {
        const response = await apiClient.post(API_PATHS.login, {
          username: credentials.email,
          password: credentials.password,
        });
        const data = unwrap<{
          token?: string;
          accessToken?: string;
          refreshToken?: string;
          user: { username: string; role: string; isSuperAdmin?: boolean; email?: string };
        }>(response.data);
        const accessToken = data.accessToken ?? data.token ?? '';
        const isSuperAdmin =
          data.user.isSuperAdmin ?? data.user.role === 'root';
        if (!isSuperAdmin) {
          throw new Error('Access denied. Superadmin privileges required.');
        }
        return {
          accessToken,
          refreshToken: data.refreshToken ?? '',
          user: {
            id: data.user.username,
            email: data.user.email ?? credentials.email,
            username: data.user.username,
            role: data.user.role,
            isSuperAdmin: true,
          },
        };
      },
      () => mock.login(credentials)
    );
  },

  /** POST /api/v1/auth/logout — backend clears httpOnly cookies. */
  async logout(): Promise<void> {
    try {
      await apiClient.post(API_PATHS.logout);
    } catch {
      // Best-effort — the cookie may already be expired.
    }
  },

  async getStats(): Promise<PlatformStats> {
    // TODO(backend): Implement GET /platform/v1/stats
    return withFallback(
      async () => unwrap<PlatformStats>((await apiClient.get(API_PATHS.stats)).data),
      () => mock.getStats()
    );
  },

  async listTenants(params: mock.TenantListParams = {}): Promise<Tenant[]> {
    // TODO(backend): Implement GET /platform/v1/tenants with query params
    return withFallback(
      async () => unwrap<{ items: Tenant[]; total: number }>((await apiClient.get(API_PATHS.tenants, { params })).data).items,
      async () => (await mock.listTenants(params)).items
    );
  },

  async getTenant(id: string): Promise<Tenant> {
    // TODO(backend): Implement GET /platform/v1/tenants/:id
    return withFallback(
      async () => unwrap<Tenant>((await apiClient.get(API_PATHS.tenant(id))).data),
      () => mock.getTenant(id)
    );
  },

  async getTenantUsage(id: string): Promise<TenantUsage> {
    // TODO(backend): Implement GET /platform/v1/tenants/:id/usage
    return withFallback(
      async () => unwrap<TenantUsage>((await apiClient.get(API_PATHS.tenantUsage(id))).data),
      () => mock.getTenantUsage(id)
    );
  },

  async createTenant(dto: CreateTenantDto): Promise<Tenant> {
    // TODO(backend): Implement POST /platform/v1/tenants
    return withFallback(
      async () => unwrap<Tenant>((await apiClient.post(API_PATHS.tenants, dto)).data),
      () => mock.createTenant(dto)
    );
  },

  async updateTenant(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    // TODO(backend): Implement PATCH /platform/v1/tenants/:id
    return withFallback(
      async () => unwrap<Tenant>((await apiClient.patch(API_PATHS.tenant(id), dto)).data),
      () => mock.updateTenant(id, dto)
    );
  },

  async suspendTenant(id: string): Promise<Tenant> {
    // TODO(backend): Implement POST /platform/v1/tenants/:id/suspend
    return withFallback(
      async () => unwrap<Tenant>((await apiClient.post(API_PATHS.tenantSuspend(id))).data),
      () => mock.suspendTenant(id)
    );
  },

  async activateTenant(id: string): Promise<Tenant> {
    // TODO(backend): Implement POST /platform/v1/tenants/:id/activate
    return withFallback(
      async () => unwrap<Tenant>((await apiClient.post(API_PATHS.tenantActivate(id))).data),
      () => mock.activateTenant(id)
    );
  },

  async deleteTenant(id: string): Promise<void> {
    // TODO(backend): Implement DELETE /platform/v1/tenants/:id
    return withFallback(
      async () => {
        await apiClient.delete(API_PATHS.tenant(id));
      },
      () => mock.deleteTenant(id)
    );
  },

  async listTenantUsers(tenantId: string): Promise<TenantUser[]> {
    // TODO(backend): Implement GET /platform/v1/tenants/:id/users
    return withFallback(
      async () => unwrap<TenantUser[]>((await apiClient.get(API_PATHS.tenantUsers(tenantId))).data),
      () => mock.listTenantUsers(tenantId)
    );
  },

  async createTenantUser(tenantId: string, dto: CreateTenantUserDto): Promise<TenantUser> {
    // TODO(backend): Implement POST /platform/v1/tenants/:id/users
    return withFallback(
      async () => unwrap<TenantUser>((await apiClient.post(API_PATHS.tenantUsers(tenantId), dto)).data),
      () => mock.createTenantUser(tenantId, dto)
    );
  },

  async updateTenantUser(tenantId: string, userId: string, dto: UpdateTenantUserDto): Promise<TenantUser> {
    // TODO(backend): Implement PATCH /platform/v1/tenants/:id/users/:userId
    return withFallback(
      async () => unwrap<TenantUser>((await apiClient.patch(API_PATHS.tenantUser(tenantId, userId), dto)).data),
      () => mock.updateTenantUser(tenantId, userId, dto)
    );
  },

  async deleteTenantUser(tenantId: string, userId: string): Promise<void> {
    // TODO(backend): Implement DELETE /platform/v1/tenants/:id/users/:userId
    return withFallback(
      async () => {
        await apiClient.delete(API_PATHS.tenantUser(tenantId, userId));
      },
      () => mock.deleteTenantUser(tenantId, userId)
    );
  },

  async resetTenantUserPassword(tenantId: string, userId: string): Promise<{ temporaryPassword: string }> {
    // TODO(backend): Implement POST /platform/v1/tenants/:id/users/:userId/reset-password
    return withFallback(
      async () => unwrap<{ temporaryPassword: string }>(
        (await apiClient.post(`${API_PATHS.tenantUser(tenantId, userId)}/reset-password`)).data
      ),
      () => mock.resetTenantUserPassword(tenantId, userId)
    );
  },

  async listTenantBackups(tenantId: string): Promise<BackupRecord[]> {
    // TODO(backend): Implement GET /platform/v1/tenants/:id/backups
    return withFallback(
      async () => unwrap<BackupRecord[]>((await apiClient.get(API_PATHS.tenantBackups(tenantId))).data),
      () => mock.listTenantBackups(tenantId)
    );
  },

  async listTenantAuditLogs(tenantId: string): Promise<AuditLogEntry[]> {
    // TODO(backend): Implement GET /platform/v1/tenants/:id/audit-logs
    return withFallback(
      async () => unwrap<AuditLogEntry[]>((await apiClient.get(API_PATHS.tenantAuditLogs(tenantId))).data),
      () => mock.listTenantAuditLogs(tenantId)
    );
  },

  async listPlatformUsers(params: { search?: string; isSuperAdmin?: boolean | '' } = {}): Promise<PlatformUser[]> {
    // TODO(backend): Implement GET /platform/v1/users
    return withFallback(
      async () => unwrap<PlatformUser[]>((await apiClient.get(API_PATHS.users, { params })).data),
      () => mock.listPlatformUsers(params)
    );
  },

  async updatePlatformUser(id: string, dto: UpdatePlatformUserDto): Promise<PlatformUser> {
    // TODO(backend): Implement PATCH /platform/v1/users/:id
    return withFallback(
      async () => unwrap<PlatformUser>((await apiClient.patch(API_PATHS.user(id), dto)).data),
      () => mock.updatePlatformUser(id, dto)
    );
  },

  async deletePlatformUser(id: string): Promise<void> {
    // TODO(backend): Implement DELETE /platform/v1/users/:id
    return withFallback(
      async () => {
        await apiClient.delete(API_PATHS.user(id));
      },
      () => mock.deletePlatformUser(id)
    );
  },

  async listSubscriptions(): Promise<SubscriptionSummary[]> {
    // TODO(backend): Implement GET /platform/v1/subscriptions
    return withFallback(
      async () => unwrap<SubscriptionSummary[]>((await apiClient.get(API_PATHS.subscriptions)).data),
      () => mock.listSubscriptions()
    );
  },

  async updateSubscription(
    tenantId: string,
    dto: mock.UpdateSubscriptionDto
  ): Promise<SubscriptionSummary> {
    // TODO(backend): Implement PATCH /platform/v1/subscriptions/:id
    return withFallback(
      async () => unwrap<SubscriptionSummary>((await apiClient.patch(API_PATHS.subscription(tenantId), dto)).data),
      () => mock.updateSubscription(tenantId, dto)
    );
  },

  async listAuditLogs(params: { search?: string; action?: string; tenantId?: string } = {}): Promise<AuditLogEntry[]> {
    // TODO(backend): Implement GET /platform/v1/audit-logs
    return withFallback(
      async () => unwrap<AuditLogEntry[]>((await apiClient.get(API_PATHS.auditLogs, { params })).data),
      () => mock.listAuditLogs(params)
    );
  },

  async getSettings(): Promise<PlatformSettings> {
    // TODO(backend): Implement GET /platform/v1/settings
    return withFallback(
      async () => unwrap<PlatformSettings>((await apiClient.get(API_PATHS.settings)).data),
      () => mock.getSettings()
    );
  },

  async updateSettings(settings: PlatformSettings): Promise<PlatformSettings> {
    // TODO(backend): Implement PUT /platform/v1/settings
    return withFallback(
      async () => unwrap<PlatformSettings>((await apiClient.put(API_PATHS.settings, settings)).data),
      () => mock.updateSettings(settings)
    );
  },
};

export { mock };
