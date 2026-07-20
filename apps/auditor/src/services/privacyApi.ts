import { api } from '@logmaster/api';
import type {
    ArcoCreatePayload,
    ArcoListResponse,
    ArcoRequest,
    ArcoRequestFilters,
    ArcoStatusUpdatePayload,
    SubjectData,
} from '../types';

const tenantUrl = (tenantSlug: string, path: string): string => {
    return `/${encodeURIComponent(tenantSlug)}${path}`;
};

/**
 * Privacy / ARCO API service — all calls are scoped to a tenant.
 *
 * Endpoints:
 *   GET    /:tenantSlug/privacy/arco-requests        — list ARCO requests
 *   POST   /:tenantSlug/privacy/arco-requests        — create ARCO request
 *   GET    /:tenantSlug/privacy/arco-requests/:id    — get ARCO request detail
 *   PATCH  /:tenantSlug/privacy/arco-requests/:id    — update ARCO status
 *   GET    /:tenantSlug/privacy/subjects/:cedula     — get subject data (right of access)
 *   GET    /:tenantSlug/privacy/subjects/:cedula/export — export subject data
 */
export const PrivacyService = {
    async listArcoRequests(
        tenantSlug: string,
        filters: ArcoRequestFilters,
    ): Promise<ArcoListResponse> {
        const params = new URLSearchParams();
        const { status, requestType, search, page = 1, limit = 25 } = filters;
        params.append('page', String(page));
        params.append('limit', String(limit));
        if (status) params.append('status', status);
        if (requestType) params.append('requestType', requestType);
        if (search) params.append('search', search);

        const response = await api.get<{ data: ArcoListResponse }>(
            tenantUrl(tenantSlug, `/privacy/arco-requests?${params.toString()}`),
        );
        return response.data.data;
    },

    async getArcoRequest(tenantSlug: string, id: number): Promise<ArcoRequest> {
        const response = await api.get<{ data: ArcoRequest }>(
            tenantUrl(tenantSlug, `/privacy/arco-requests/${id}`),
        );
        return response.data.data;
    },

    async createArcoRequest(
        tenantSlug: string,
        payload: ArcoCreatePayload,
    ): Promise<ArcoRequest> {
        const response = await api.post<{ data: ArcoRequest }>(
            tenantUrl(tenantSlug, '/privacy/arco-requests'),
            payload,
        );
        return response.data.data;
    },

    async updateArcoStatus(
        tenantSlug: string,
        id: number,
        payload: ArcoStatusUpdatePayload,
    ): Promise<ArcoRequest> {
        const response = await api.patch<{ data: ArcoRequest }>(
            tenantUrl(tenantSlug, `/privacy/arco-requests/${id}`),
            payload,
        );
        return response.data.data;
    },

    async getSubjectData(tenantSlug: string, cedula: string): Promise<SubjectData> {
        const response = await api.get<{ data: SubjectData }>(
            tenantUrl(tenantSlug, `/privacy/subjects/${encodeURIComponent(cedula)}`),
        );
        return response.data.data;
    },

    async exportSubjectData(
        tenantSlug: string,
        cedula: string,
        format: 'pdf' | 'json' = 'json',
    ): Promise<Blob> {
        const response = await api.get(
            tenantUrl(
                tenantSlug,
                `/privacy/subjects/${encodeURIComponent(cedula)}/export?format=${format}`,
            ),
            { responseType: 'blob' },
        );
        return response.data as Blob;
    },
};
