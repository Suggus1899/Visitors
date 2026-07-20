/**
 * React Query hooks for the admin app.
 *
 * These hooks use the tenant-scoped AdminApi service and automatically
 * invalidate related queries on mutations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '../context/TenantContext';
import { createAdminApi } from './adminApi';
import type {
    VisitFilters,
    VisitorFilters,
    ActivityLogFilters,
} from './adminApi';
import type { Visitor } from '@logmaster/types';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const adminQueryKeys = {
    all: ['admin'] as const,
    visits: () => [...adminQueryKeys.all, 'visits'] as const,
    visitList: (filters: VisitFilters) => [...adminQueryKeys.visits(), 'list', filters] as const,
    activeVisits: () => [...adminQueryKeys.visits(), 'active'] as const,
    waitingVisits: () => [...adminQueryKeys.visits(), 'waiting'] as const,
    intermittentVisits: () => [...adminQueryKeys.visits(), 'intermittent'] as const,
    recentVisits: () => [...adminQueryKeys.visits(), 'recent'] as const,
    visitors: () => [...adminQueryKeys.all, 'visitors'] as const,
    visitorList: (filters: VisitorFilters) => [...adminQueryKeys.visitors(), 'list', filters] as const,
    companies: () => [...adminQueryKeys.visitors(), 'companies'] as const,
    stats: (start?: string, end?: string) => [...adminQueryKeys.all, 'stats', { start, end }] as const,
    monthlyReport: (month: number, year: number) => [...adminQueryKeys.all, 'monthly', month, year] as const,
    comparison: (month?: number, year?: number) => [...adminQueryKeys.all, 'comparison', { month, year }] as const,
    alerts: () => [...adminQueryKeys.all, 'alerts'] as const,
    backups: () => [...adminQueryKeys.all, 'backups'] as const,
    auditLogs: (filters: ActivityLogFilters) => [...adminQueryKeys.all, 'audit', filters] as const,
    auditStats: () => [...adminQueryKeys.all, 'audit-stats'] as const,
    dashboardKPIs: () => [...adminQueryKeys.all, 'dashboard-kpis'] as const,
    tenantUsers: () => [...adminQueryKeys.all, 'tenant-users'] as const,
};

// ---------------------------------------------------------------------------
// Hook to get the admin API instance for the current tenant
// ---------------------------------------------------------------------------

export const useAdminApi = () => {
    const { selectedSlug } = useTenant();
    return createAdminApi(selectedSlug);
};

// ---------------------------------------------------------------------------
// Visit queries
// ---------------------------------------------------------------------------

export const useActiveVisitsQuery = (refetchInterval?: number) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.activeVisits(),
        queryFn: () => api.getActiveVisits(),
        refetchInterval,
    });
};

export const useWaitingVisitsQuery = (refetchInterval?: number) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.waitingVisits(),
        queryFn: () => api.getWaitingVisits(),
        refetchInterval,
    });
};

export const useIntermittentVisitsQuery = (refetchInterval?: number) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.intermittentVisits(),
        queryFn: () => api.getIntermittentVisits(),
        refetchInterval,
    });
};

export const useVisitListQuery = (filters: VisitFilters) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.visitList(filters),
        queryFn: () => api.getVisits(filters),
    });
};

export const useRecentVisitsQuery = (limit = 20) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.recentVisits(),
        queryFn: () => api.getRecentVisits(limit),
    });
};

// Visit mutations

export const useCheckOutMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: ({ id, notes }: { id: number; notes?: string }) => api.checkOut(id, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.visits() });
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboardKPIs() });
        },
    });
};

export const useAdmitVisitorMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: (id: number) => api.admitVisitor(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.visits() });
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboardKPIs() });
        },
    });
};

export const useReactivateVisitMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: (id: number) => api.reactivateVisit(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.visits() });
        },
    });
};

export const useGoIntermittentMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: ({ id, notes }: { id: number; notes?: string }) => api.goIntermittent(id, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.visits() });
        },
    });
};

// ---------------------------------------------------------------------------
// Visitor queries
// ---------------------------------------------------------------------------

export const useVisitorListQuery = (filters: VisitorFilters) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.visitorList(filters),
        queryFn: () => api.getAllVisitors(filters),
    });
};

export const useCompaniesQuery = () => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.companies(),
        queryFn: () => api.getCompanies(),
    });
};

export const useUpdateVisitorMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: ({ cedula, data }: { cedula: string; data: Partial<Visitor> & Record<string, unknown> }) =>
            api.updateVisitor(cedula, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.visitors() });
        },
    });
};

export const useDeleteVisitorMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: (cedula: string) => api.deleteVisitor(cedula),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.visitors() });
        },
    });
};

// ---------------------------------------------------------------------------
// Report / Stats queries
// ---------------------------------------------------------------------------

export const useStatsQuery = (start?: string, end?: string) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.stats(start, end),
        queryFn: () => api.getStats(start, end),
    });
};

export const useMonthlyReportQuery = (month: number, year: number) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.monthlyReport(month, year),
        queryFn: () => api.getMonthlyReport(month, year),
    });
};

export const useComparisonStatsQuery = (month?: number, year?: number) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.comparison(month, year),
        queryFn: () => api.getComparisonStats(month, year),
    });
};

export const useAlertsQuery = () => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.alerts(),
        queryFn: () => api.getAlerts(),
    });
};

// ---------------------------------------------------------------------------
// Backup queries
// ---------------------------------------------------------------------------

export const useBackupsQuery = () => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.backups(),
        queryFn: () => api.getBackups(),
    });
};

export const useCreateBackupMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: () => api.createBackup(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.backups() });
        },
    });
};

export const useRestoreBackupMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: ({ backupName, restorePassword }: { backupName: string; restorePassword: string }) =>
            api.restoreBackup(backupName, restorePassword),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
        },
    });
};

export const useDeleteBackupMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: (backupName: string) => api.deleteBackup(backupName),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.backups() });
        },
    });
};

// ---------------------------------------------------------------------------
// Audit / Activity Log queries
// ---------------------------------------------------------------------------

export const useActivityLogsQuery = (filters: ActivityLogFilters) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.auditLogs(filters),
        queryFn: () => api.getActivityLogs(filters),
    });
};

export const useAuditStatsQuery = () => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.auditStats(),
        queryFn: () => api.getAuditStats(),
    });
};

// ---------------------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------------------

export const useDashboardKPIsQuery = (refetchInterval?: number) => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.dashboardKPIs(),
        queryFn: () => api.getDashboardKPIs(),
        refetchInterval,
    });
};

// ---------------------------------------------------------------------------
// Tenant user queries
// ---------------------------------------------------------------------------

export const useTenantUsersQuery = () => {
    const api = useAdminApi();
    return useQuery({
        queryKey: adminQueryKeys.tenantUsers(),
        queryFn: () => api.getTenantUsers(),
    });
};

export const useInviteUserMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: (data: { username: string; role: string }) => api.inviteUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.tenantUsers() });
        },
    });
};

export const useUpdateUserRoleMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: ({ userId, role }: { userId: number; role: string }) => api.updateUserRole(userId, role),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.tenantUsers() });
        },
    });
};

export const useRemoveUserMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: (userId: number) => api.removeUser(userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.tenantUsers() });
        },
    });
};

export const useUpdateTenantMutation = () => {
    const queryClient = useQueryClient();
    const api = useAdminApi();
    return useMutation({
        mutationFn: (data: { name?: string }) => api.updateTenant(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
        },
    });
};

// ---------------------------------------------------------------------------
// Invalidation helper (used by SSE events)
// ---------------------------------------------------------------------------

export const useInvalidateAllAdmin = () => {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
    };
};
