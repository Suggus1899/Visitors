import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditService } from '../services/auditApi';
import type { AuditLogFilters } from '../types';

export const auditQueryKeys = {
    all: ['audit'] as const,
    stats: (tenantSlug: string) => [...auditQueryKeys.all, 'stats', tenantSlug] as const,
    logs: (tenantSlug: string, filters: AuditLogFilters) =>
        [...auditQueryKeys.all, 'logs', tenantSlug, filters] as const,
    recent: (tenantSlug: string, limit: number) =>
        [...auditQueryKeys.all, 'recent', tenantSlug, limit] as const,
};

export const useAuditStatsQuery = (tenantSlug: string | null) => {
    return useQuery({
        queryKey: auditQueryKeys.stats(tenantSlug || ''),
        queryFn: () => AuditService.getStats(tenantSlug!),
        enabled: !!tenantSlug,
    });
};

export const useAuditLogsQuery = (tenantSlug: string | null, filters: AuditLogFilters) => {
    return useQuery({
        queryKey: auditQueryKeys.logs(tenantSlug || '', filters),
        queryFn: () => AuditService.getLogs(tenantSlug!, filters),
        enabled: !!tenantSlug,
    });
};

export const useRecentAuditLogsQuery = (tenantSlug: string | null, limit = 10) => {
    return useQuery({
        queryKey: auditQueryKeys.recent(tenantSlug || '', limit),
        queryFn: () => AuditService.getRecentLogs(tenantSlug!, limit),
        enabled: !!tenantSlug,
    });
};

export const useExportAuditLogsMutation = () => {
    return useMutation({
        mutationFn: ({
            tenantSlug,
            format,
            filters,
        }: {
            tenantSlug: string;
            format: 'csv' | 'pdf';
            filters: Omit<AuditLogFilters, 'page' | 'limit' | 'sortBy' | 'sortDir'>;
        }) => AuditService.exportLogs(tenantSlug, format, filters),
    });
};

export const useInvalidateAuditQueries = () => {
    const queryClient = useQueryClient();
    return (tenantSlug: string) => {
        queryClient.invalidateQueries({ queryKey: auditQueryKeys.all });
        void tenantSlug;
    };
};
