import { api } from '@logmaster/api';
import type { Tenant } from '../types';

/**
 * Tenant API service.
 *
 * Fetches the list of tenants the authenticated auditor user has access to.
 *
 * TODO(backend): Wire to the real platform endpoint once multi-tenant
 * user-tenant mapping is implemented. The expected endpoint is:
 *   GET /platform/v1/users/me/tenants
 * which should return { data: Tenant[] }.
 *
 * Until then we return a single mock tenant so the auditor app is usable
 * in development and against the current single-tenant backend.
 */
export const TenantService = {
    async getAvailableTenants(): Promise<Tenant[]> {
        try {
            const response = await api.get<{ data?: Tenant[] }>('/platform/v1/users/me/tenants');
            const tenants = response.data?.data;
            if (tenants && Array.isArray(tenants) && tenants.length > 0) {
                return tenants;
            }
        } catch {
            // Backend endpoint not yet available — fall back to mock.
            // TODO(backend): remove this fallback once the endpoint exists.
        }

        // Mock fallback: single default tenant.
        return [{ slug: 'default', name: 'Default Tenant' }];
    },
};
