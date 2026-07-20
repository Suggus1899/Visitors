import { api } from '@logmaster/api';
import type { ComplianceDashboard } from '../types';

const tenantUrl = (tenantSlug: string, path: string): string => {
    return `/${encodeURIComponent(tenantSlug)}${path}`;
};

/**
 * Compliance API service — GDPR / Ley 25.326 compliance dashboard data.
 *
 * TODO(backend): Wire to a real compliance endpoint once available:
 *   GET /:tenantSlug/compliance/dashboard
 *
 * Until then the caller falls back to a locally derived dashboard.
 */
export const ComplianceService = {
    async getDashboard(tenantSlug: string): Promise<ComplianceDashboard> {
        const response = await api.get<{ data: ComplianceDashboard }>(
            tenantUrl(tenantSlug, '/compliance/dashboard'),
        );
        return response.data.data;
    },
};
