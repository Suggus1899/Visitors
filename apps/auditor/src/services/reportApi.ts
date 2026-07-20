import { api } from '@logmaster/api';
import type { ReportGeneratePayload } from '../types';

const tenantUrl = (tenantSlug: string, path: string): string => {
    return `/${encodeURIComponent(tenantSlug)}${path}`;
};

/**
 * Reports API service — all calls are scoped to a tenant.
 *
 * Endpoints:
 *   GET  /:tenantSlug/reports/audit-summary       — audit summary report
 *   GET  /:tenantSlug/reports/monthly-compliance  — monthly compliance report
 *   GET  /:tenantSlug/reports/visitor-activity    — visitor activity report
 *   GET  /:tenantSlug/reports/access              — access report
 *   GET  /:tenantSlug/reports/comparison          — comparison report
 *
 * All report endpoints accept startDate/endDate (or month/year) and a
 * format query param (pdf|csv). They return a binary blob for download.
 */
export const ReportService = {
    async generateReport(
        tenantSlug: string,
        payload: ReportGeneratePayload,
    ): Promise<Blob> {
        const params = new URLSearchParams();
        params.append('format', payload.format);
        if (payload.startDate) params.append('startDate', payload.startDate);
        if (payload.endDate) params.append('endDate', payload.endDate);
        if (payload.month !== undefined) params.append('month', String(payload.month));
        if (payload.year !== undefined) params.append('year', String(payload.year));

        const pathMap: Record<ReportGeneratePayload['type'], string> = {
            audit_summary: '/reports/audit-summary',
            monthly_compliance: '/reports/monthly-compliance',
            visitor_activity: '/reports/visitor-activity',
            access_report: '/reports/access',
            comparison: '/reports/comparison',
        };

        const response = await api.get(
            tenantUrl(tenantSlug, `${pathMap[payload.type]}?${params.toString()}`),
            { responseType: 'blob' },
        );
        return response.data as Blob;
    },
};
