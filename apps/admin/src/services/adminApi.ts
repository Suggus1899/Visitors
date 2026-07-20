/**
 * Admin API service — tenant-scoped API calls.
 *
 * All endpoints are constructed as /v1/:tenantSlug/... per the multi-tenant
 * migration plan. When the backend is not yet migrated, calls fall back to
 * the legacy non-scoped paths (e.g. /visits instead of /v1/default/visits).
 *
 * TODO: Once the backend migration is complete, remove the fallback logic
 * and always use the tenant-scoped path.
 */

import { api } from '@logmaster/api';
import type {
    Visit,
    Visitor,
    VisitorWithHistory,
    StatsData,
    ComparisonStats,
    IntermittentVisit,
    ActivityItem,
    AuditStats,
} from '@logmaster/types';
import type { EditHistoryEntry } from '@logmaster/api';
import type { Tenant, TenantUser } from '../types/tenant';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a tenant-scoped path. When useTenantScope is true, the path becomes
 * /v1/:slug/... Otherwise it uses the legacy flat path.
 *
 * TODO: Set USE_TENANT_SCOPE to true once the backend supports scoped routes.
 */
const USE_TENANT_SCOPE = false;

const buildPath = (slug: string | null, resource: string): string => {
    if (USE_TENANT_SCOPE && slug) {
        return `/v1/${slug}/${resource}`;
    }
    return `/${resource}`;
};

// ---------------------------------------------------------------------------
// Backup types
// ---------------------------------------------------------------------------

export interface Backup {
    name: string;
    date: string;
    size?: number;
}

// ---------------------------------------------------------------------------
// Dashboard types
// ---------------------------------------------------------------------------

export interface DashboardKPIs {
    visitsToday: number;
    activeVisitors: number;
    waiting: number;
    missedCheckouts: number;
}

// ---------------------------------------------------------------------------
// Visit filters
// ---------------------------------------------------------------------------

export interface VisitFilters {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    company?: string;
    personToVisit?: string;
}

export interface VisitListResult {
    visits: Visit[];
    total: number;
}

// ---------------------------------------------------------------------------
// Visitor filters
// ---------------------------------------------------------------------------

export interface VisitorFilters {
    page?: number;
    limit?: number;
    company?: string;
    search?: string;
    hasEmail?: boolean;
    hasPhone?: boolean;
}

export interface VisitorListResult {
    visitors: Visitor[];
    total: number;
}

// ---------------------------------------------------------------------------
// Activity log filters
// ---------------------------------------------------------------------------

export interface ActivityLogFilters {
    page?: number;
    limit?: number;
    action?: string;
    userId?: number;
    entity?: string;
    ipAddress?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
}

export interface ActivityLogResult {
    logs: ActivityItem[];
    total: number;
    pages: number;
}

// ---------------------------------------------------------------------------
// Admin API Service
// ---------------------------------------------------------------------------

export const createAdminApi = (tenantSlug: string | null) => {
    const path = (resource: string) => buildPath(tenantSlug, resource);

    // --- Visits ------------------------------------------------------------

    const getActiveVisits = async (): Promise<Visit[]> => {
        const response = await api.get(path('visits/active'));
        const data = response.data?.data ?? response.data;
        return Array.isArray(data) ? data : [];
    };

    const getWaitingVisits = async (): Promise<Visit[]> => {
        const response = await api.get(path('visits/waiting'));
        const data = response.data?.data ?? response.data;
        return Array.isArray(data) ? data : [];
    };

    const getIntermittentVisits = async (): Promise<IntermittentVisit[]> => {
        const response = await api.get(path('visits/intermittent'));
        return response.data?.data ?? [];
    };

    const getVisits = async (filters: VisitFilters): Promise<VisitListResult> => {
        const params: Record<string, string> = {};
        Object.entries(filters).forEach(([key, val]) => {
            if (val !== undefined && val !== '' && val !== null) {
                params[key] = String(val);
            }
        });
        const query = new URLSearchParams(params).toString();
        const response = await api.get(`${path('visits')}?${query}`);
        const result = response.data?.data ?? response.data;
        const metaTotal = response.data?.meta?.total;
        return {
            visits: Array.isArray(result?.visits) ? result.visits : [],
            total: metaTotal ?? result?.total ?? 0,
        };
    };

    const getRecentVisits = async (limit = 20): Promise<Visit[]> => {
        const response = await api.get(`${path('visits')}?status=completed&limit=${limit}&page=1`);
        const result = response.data?.data ?? response.data;
        return Array.isArray(result?.visits) ? result.visits : [];
    };

    const checkOut = async (id: number, notes?: string) => {
        const response = await api.post(path(`visits/${id}/checkout`), { notes });
        return response.data?.data ?? response.data;
    };

    const admitVisitor = async (id: number) => {
        const response = await api.post(path(`visits/${id}/admit`));
        return response.data?.data ?? response.data;
    };

    const reactivateVisit = async (id: number) => {
        const response = await api.post(path(`visits/${id}/intermittent-reentry`));
        return response.data?.data ?? response.data;
    };

    const goIntermittent = async (id: number, notes?: string) => {
        const response = await api.post(path(`visits/${id}/intermittent-exit`), { notes });
        return response.data?.data ?? response.data;
    };

    // --- Visitors ----------------------------------------------------------

    const getAllVisitors = async (filters: VisitorFilters): Promise<VisitorListResult> => {
        const params: Record<string, string> = {};
        Object.entries(filters).forEach(([key, val]) => {
            if (val !== undefined && val !== '' && val !== null) {
                params[key] = String(val);
            }
        });
        const query = new URLSearchParams(params).toString();
        const response = await api.get(`${path('visitors')}?${query}`);
        return response.data?.data ?? response.data;
    };

    const getVisitorByCedula = async (cedula: string, includeHistory = false): Promise<Visitor | VisitorWithHistory> => {
        const response = await api.get(`${path('visitors')}/${cedula}?history=${includeHistory}`);
        return response.data?.data ?? response.data;
    };

    const updateVisitor = async (cedula: string, data: Partial<Visitor> & Record<string, unknown>): Promise<Visitor> => {
        const response = await api.patch(`${path('visitors')}/${cedula}`, data);
        return response.data?.data ?? response.data;
    };

    const deleteVisitor = async (cedula: string): Promise<void> => {
        // TODO: Backend endpoint DELETE /v1/:tenantSlug/visitors/:cedula not yet implemented.
        // Using PATCH with isBlocked as a soft-delete workaround.
        await api.patch(`${path('visitors')}/${cedula}`, { isBlocked: true, observations: 'Deleted by admin' });
    };

    const verifyEditPassword = async (password: string): Promise<boolean> => {
        const response = await api.post(path('visitors/verify-edit-password'), { password });
        const data = response.data?.data ?? response.data;
        return data?.valid ?? false;
    };

    const getEditHistory = async (visitId: number): Promise<EditHistoryEntry[]> => {
        const response = await api.get(path(`visits/${visitId}/edit-history`));
        return response.data?.data ?? [];
    };

    const getEditHistoryByCedula = async (cedula: string): Promise<EditHistoryEntry[]> => {
        const response = await api.get(path(`visitors/${encodeURIComponent(cedula)}/edit-history`));
        return response.data?.data ?? [];
    };

    const getCompanies = async (): Promise<string[]> => {
        const response = await api.get(path('visitors/companies'));
        return response.data?.data ?? [];
    };

    const getVisitorPhotoUrl = (cedula: string): string => {
        // TODO: Update to tenant-scoped photo endpoint once backend supports it.
        return VisitService.getVisitorPhotoUrl(cedula);
    };

    const getVisitorIdPhotoUrl = (cedula: string): string => {
        return VisitService.getVisitorIdPhotoUrl(cedula);
    };

    // --- Reports / Stats ---------------------------------------------------

    const getStats = async (start?: string, end?: string): Promise<StatsData> => {
        let query = '';
        if (start && end) query = `?startDate=${start}&endDate=${end}`;
        const response = await api.get(`${path('reports/stats')}${query}`);
        return response.data?.data ?? response.data;
    };

    const getMonthlyReport = async (month: number, year: number) => {
        const response = await api.get(`${path('reports/stats/monthly')}?month=${month}&year=${year}`);
        return response.data?.data ?? response.data;
    };

    const getComparisonStats = async (month?: number, year?: number): Promise<ComparisonStats> => {
        let query = '';
        if (month !== undefined && year) query = `?month=${month}&year=${year}`;
        const response = await api.get(`${path('reports/comparison')}${query}`);
        return response.data?.data ?? response.data;
    };

    const getAlerts = async (threshold?: number) => {
        const query = threshold ? `?threshold=${threshold}` : '';
        const response = await api.get(`${path('reports/alerts')}${query}`);
        return response.data?.data ?? response.data;
    };

    // --- Backups -----------------------------------------------------------

    const getBackups = async (): Promise<Backup[]> => {
        const response = await api.get(path('backups'));
        return response.data?.data ?? [];
    };

    const createBackup = async (): Promise<void> => {
        await api.post(path('backups'), {});
    };

    const restoreBackup = async (backupName: string, restorePassword: string): Promise<void> => {
        await api.post(`${path('backups')}/${encodeURIComponent(backupName)}/restore`, {
            restorePassword,
        });
    };

    const deleteBackup = async (backupName: string): Promise<void> => {
        // TODO: Backend endpoint DELETE /v1/:tenantSlug/backups/:name not yet implemented.
        await api.delete(`${path('backups')}/${encodeURIComponent(backupName)}`);
    };

    const downloadBackupUrl = (backupName: string): string => {
        // TODO: Update to tenant-scoped download endpoint once backend supports it.
        const base = path('backups');
        return `${base}/${encodeURIComponent(backupName)}/download`;
    };

    // --- Activity Logs / Audit ---------------------------------------------

    const getActivityLogs = async (filters: ActivityLogFilters): Promise<ActivityLogResult> => {
        const params: Record<string, string> = {};
        Object.entries(filters).forEach(([key, val]) => {
            if (val !== undefined && val !== '' && val !== null) {
                params[key] = String(val);
            }
        });
        const query = new URLSearchParams(params).toString();
        const response = await api.get(`${path('audit/logs')}?${query}`);
        const data = response.data?.data ?? response.data;
        return {
            logs: data?.logs ?? [],
            total: data?.pagination?.total ?? data?.total ?? 0,
            pages: data?.pagination?.pages ?? 1,
        };
    };

    const getAuditStats = async (): Promise<AuditStats> => {
        const response = await api.get(path('audit/stats'));
        return response.data?.data ?? response.data;
    };

    // --- Tenant Settings ---------------------------------------------------

    const getTenantUsers = async (): Promise<TenantUser[]> => {
        // TODO: Backend endpoint GET /v1/:tenantSlug/users not yet implemented.
        // Returning mock data for now.
        return [];
    };

    const inviteUser = async (data: { username: string; role: string }): Promise<void> => {
        // TODO: Backend endpoint POST /v1/:tenantSlug/users/invite not yet implemented.
        await api.post(path('users/invite'), data);
    };

    const updateUserRole = async (userId: number, role: string): Promise<void> => {
        // TODO: Backend endpoint PATCH /v1/:tenantSlug/users/:id not yet implemented.
        await api.patch(path(`users/${userId}`), { role });
    };

    const removeUser = async (userId: number): Promise<void> => {
        // TODO: Backend endpoint DELETE /v1/:tenantSlug/users/:id not yet implemented.
        await api.delete(path(`users/${userId}`));
    };

    const updateTenant = async (data: Partial<Pick<Tenant, 'name'>>): Promise<void> => {
        // TODO: Backend endpoint PATCH /v1/:tenantSlug not yet implemented.
        await api.patch(path(''), data);
    };

    // --- Dashboard KPIs ----------------------------------------------------

    const getDashboardKPIs = async (): Promise<DashboardKPIs> => {
        // Fetch active + waiting in parallel, then compute KPIs.
        // TODO: Replace with a dedicated GET /v1/:tenantSlug/dashboard/kpis endpoint.
        const [active, waiting] = await Promise.all([
            getActiveVisits().catch(() => [] as Visit[]),
            getWaitingVisits().catch(() => [] as Visit[]),
        ]);

        const today = new Date().toDateString();
        const visitsToday = active.filter((v) => {
            const checkIn = v.check_in || v.check_in_time || '';
            return checkIn && new Date(checkIn).toDateString() === today;
        }).length;

        // Missed checkouts: active visits from a previous day
        const missedCheckouts = active.filter((v) => {
            const checkIn = v.check_in || v.check_in_time || '';
            return checkIn && new Date(checkIn).toDateString() !== today;
        }).length;

        return {
            visitsToday,
            activeVisitors: active.length,
            waiting: waiting.length,
            missedCheckouts,
        };
    };

    return {
        // Visits
        getActiveVisits,
        getWaitingVisits,
        getIntermittentVisits,
        getVisits,
        getRecentVisits,
        checkOut,
        admitVisitor,
        reactivateVisit,
        goIntermittent,
        // Visitors
        getAllVisitors,
        getVisitorByCedula,
        updateVisitor,
        deleteVisitor,
        verifyEditPassword,
        getEditHistory,
        getEditHistoryByCedula,
        getCompanies,
        getVisitorPhotoUrl,
        getVisitorIdPhotoUrl,
        // Reports
        getStats,
        getMonthlyReport,
        getComparisonStats,
        getAlerts,
        // Backups
        getBackups,
        createBackup,
        restoreBackup,
        deleteBackup,
        downloadBackupUrl,
        // Audit
        getActivityLogs,
        getAuditStats,
        // Tenant
        getTenantUsers,
        inviteUser,
        updateUserRole,
        removeUser,
        updateTenant,
        // Dashboard
        getDashboardKPIs,
    };
};

// Re-export VisitService for photo URL helpers (used in getVisitorPhotoUrl above)
import { VisitService } from '@logmaster/api';

export type AdminApi = ReturnType<typeof createAdminApi>;
