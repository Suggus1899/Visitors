import { api } from '@logmaster/api';
import type {
    AuditLog,
    AuditLogFilters,
    AuditLogsResponse,
    AuditStats,
} from '../types';

/**
 * Helper that builds a tenant-scoped URL.
 *
 * All tenant-scoped endpoints live under /v1/:tenantSlug/...
 * The shared axios instance already has baseURL = /api/v1, so we only
 * need to prepend the tenant slug segment.
 */
const tenantUrl = (tenantSlug: string, path: string): string => {
    return `/${encodeURIComponent(tenantSlug)}${path}`;
};

/**
 * Audit API service — all calls are scoped to a tenant.
 *
 * Endpoints:
 *   GET  /:tenantSlug/audit/logs       — paginated, filterable audit logs
 *   GET  /:tenantSlug/audit/stats      — aggregate audit statistics
 *   GET  /:tenantSlug/audit/export     — CSV/PDF export of audit logs
 */
export const AuditService = {
    async getStats(tenantSlug: string): Promise<AuditStats> {
        const response = await api.get<{ data: AuditStats }>(
            tenantUrl(tenantSlug, '/audit/stats'),
        );
        return response.data.data;
    },

    async getLogs(
        tenantSlug: string,
        filters: AuditLogFilters,
    ): Promise<AuditLogsResponse> {
        const params = new URLSearchParams();
        const {
            action,
            username,
            entity,
            ipAddress,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 25,
            sortBy,
            sortDir,
        } = filters;

        params.append('page', String(page));
        params.append('limit', String(limit));
        if (action) params.append('action', action);
        if (username) params.append('username', username);
        if (entity) params.append('entity', entity);
        if (ipAddress) params.append('ipAddress', ipAddress);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (search) params.append('search', search);
        if (sortBy) params.append('sortBy', sortBy);
        if (sortDir) params.append('sortDir', sortDir);

        const response = await api.get<{ data: AuditLogsResponse }>(
            tenantUrl(tenantSlug, `/audit/logs?${params.toString()}`),
        );
        return response.data.data;
    },

    async exportLogs(
        tenantSlug: string,
        format: 'csv' | 'pdf',
        filters: Omit<AuditLogFilters, 'page' | 'limit' | 'sortBy' | 'sortDir'>,
    ): Promise<Blob> {
        const params = new URLSearchParams();
        params.append('format', format);
        const { action, username, entity, ipAddress, startDate, endDate, search } = filters;
        if (action) params.append('action', action);
        if (username) params.append('username', username);
        if (entity) params.append('entity', entity);
        if (ipAddress) params.append('ipAddress', ipAddress);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (search) params.append('search', search);

        const response = await api.get(
            tenantUrl(tenantSlug, `/audit/export?${params.toString()}`),
            { responseType: 'blob' },
        );
        return response.data as Blob;
    },

    async getRecentLogs(tenantSlug: string, limit = 10): Promise<AuditLog[]> {
        const response = await api.get<{ data: AuditLogsResponse }>(
            tenantUrl(tenantSlug, `/audit/logs?limit=${limit}&page=1`),
        );
        return response.data.data.logs;
    },
};
