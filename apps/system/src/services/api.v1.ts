import axios from 'axios';
import type { Visit, Visitor, VisitorWithHistory, StatsData, ComparisonStats, IntermittentVisit } from '../types';
import { API_URL } from '../config/env';

// Configure axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Import AuthService for token management
// Note: We use dynamic import to avoid circular dependencies
type AuthServiceType = {
    getAccessToken: () => string | null;
    refreshAccessToken: () => Promise<string>;
    logout: () => void;
};
let authServicePromise: Promise<AuthServiceType> | null = null;
const getAuthService = async (): Promise<AuthServiceType> => {
    if (!authServicePromise) {
        authServicePromise = import('./AuthService').then(module => module.default as AuthServiceType);
    }
    return authServicePromise;
};

/**
 * Request interceptor to inject Access Token
 */
api.interceptors.request.use(
    async (config) => {
        const authService = await getAuthService();
        const token = authService.getAccessToken();

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

/**
 * Response interceptor for:
 * - Automatic token refresh on 401
 * - Handle PASSWORD_CHANGE_REQUIRED error (5.3)
 * - Handle ACCOUNT_LOCKED error (9.4)
 */
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Handle specific error codes from backend
        if (error.response) {
            const errorCode = error.response.data?.error?.code;
            const errorData = error.response.data?.error?.data;

            // Handle PASSWORD_CHANGE_REQUIRED (Requirement 5.3)
            if (errorCode === 'PASSWORD_CHANGE_REQUIRED') {
                // Dispatch custom event for password change modal
                if (typeof window !== 'undefined') {
                    const event = new CustomEvent('password-change-required', {
                        detail: {
                            message: error.response.data?.error?.message
                        }
                    });
                    window.dispatchEvent(event);
                }
                return Promise.reject(error);
            }

            // Handle ACCOUNT_LOCKED (Requirement 9.4)
            if (errorCode === 'ACCOUNT_LOCKED') {
                const minutesRemaining = errorData?.minutesRemaining;
                const lockedUntil = errorData?.lockedUntil;

                // Dispatch custom event with lockout details
                if (typeof window !== 'undefined') {
                    const event = new CustomEvent('account-locked', {
                        detail: {
                            message: error.response.data?.error?.message,
                            minutesRemaining,
                            lockedUntil
                        }
                    });
                    window.dispatchEvent(event);
                }
                return Promise.reject(error);
            }

            // Handle VALIDATION_ERROR with specific messages
            if (errorCode === 'VALIDATION_ERROR') {
                // Pass through validation errors with details
                return Promise.reject(error);
            }
        }

        // Handle 401 Unauthorized - attempt token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const authService = await getAuthService();

                // Try to refresh the access token (Requirement 3.6)
                const newAccessToken = await authService.refreshAccessToken();

                // Update the failed request with new token
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

                // Retry the original request (Requirement 3.7)
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh failed - redirect to login (Requirement 3.8)
                const authService = await getAuthService();
                authService.logout();

                // Redirect to login page
                if (typeof window !== 'undefined') {
                    window.location.href = '#/login';
                }

                return Promise.reject(refreshError);
            }
        }

        // Network errors are passed to the caller via Promise.reject below

        return Promise.reject(error);
    }
);

// Standardized API response helper
const unwrapResponse = <T>(payload: { success?: boolean; data?: T; error?: { message: string } }): T => {
    if (payload && payload.success === false) {
        throw new Error(payload.error?.message || 'Request failed');
    }
    return (payload?.data ?? payload) as T;
};

// Helper to adapt backend V1 Visit (CamelCase, flat) to Frontend Visit (snake_case, nested Visitor)

export interface EditHistoryEntry {
    id: number;
    visitId: number;
    visitorId: number;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    editedBy: number;
    editedByUsername: string;
    editedAt: string;
}

interface VisitDTO {
    id: number;
    visitorCedula: string;
    purpose: string;
    checkInTime: string;
    arrivalTime?: string;
    entryTime?: string;
    exitTime?: string;
    checkOutTime?: string;
    status?: string;
    personToVisit?: string;
    targetDepartment?: string;
    hostPerson?: string;
    notes?: string;
    visitorName?: string;
    visitorCompany?: string;
    company?: string;
    photoUrl?: string;
    idPhotoUrl?: string;
    visitorPhoto?: string;
    visitorIdPhoto?: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    companionName?: string;
    companionCedula?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehiclePlate?: string;
    action?: 'Carga' | 'Descarga' | 'Ninguna';
    department?: string;
}

const adaptVisit = (v: VisitDTO): Visit => {
    // Helper getPhotoUrl removed as URLs are now dynamically built via the cedula using BLOB endpoints.

    return {
        id: v.id,
        visitor_cedula: v.visitorCedula,
        reason: v.purpose,
        purpose: v.purpose,
        check_in: v.checkInTime,
        check_in_time: v.checkInTime,
        arrival_time: v.arrivalTime,
        entry_time: v.entryTime,
        exit_time: v.exitTime,
        check_out: v.checkOutTime,
        check_out_time: v.checkOutTime,
        status: (v.status ? v.status.toLowerCase() : 'active') as 'waiting' | 'active' | 'intermittent' | 'completed',
        personToVisit: v.personToVisit,
        person_to_visit: v.personToVisit,
        target_department: v.targetDepartment,
        host_person: v.hostPerson,
        notes: v.notes,
        companionName: v.companionName,
        companionCedula: v.companionCedula,
        vehicleBrand: v.vehicleBrand,
        vehicleModel: v.vehicleModel,
        vehiclePlate: v.vehiclePlate,
        action: v.action,
        department: v.department,
        Visitor: {
            cedula: v.visitorCedula,
            first_name: v.firstName || v.visitorName || 'Visitante',
            last_name: v.lastName || '',
            company: v.visitorCompany || v.company || 'Sin empresa',
            job_title: v.jobTitle,
            photo_url: v.visitorCedula ? `${API_URL}/visitors/${encodeURIComponent(v.visitorCedula)}/photo?t=${new Date().getTime()}` : undefined,
            id_photo_url: v.visitorCedula ? `${API_URL}/visitors/${encodeURIComponent(v.visitorCedula)}/id-photo?t=${new Date().getTime()}` : undefined
        }
    };
};

export const VisitService = {
    // Visits
    getActiveVisits: async () => {
        const response = await api.get('/visits/active');
        const data = unwrapResponse<VisitDTO[]>(response.data);
        return Array.isArray(data) ? data.map(adaptVisit) : [];
    },

    getVisits: async (filters: Record<string, string | number | boolean | undefined>) => {
        // Filter out undefined values
        const cleanFilters: Record<string, string> = {};
        Object.entries(filters).forEach(([key, val]) => {
            if (val !== undefined) cleanFilters[key] = String(val);
        });

        const params = new URLSearchParams(cleanFilters).toString();
        const response = await api.get(`/visits?${params}`);
        const result = unwrapResponse<{ visits: VisitDTO[]; total: number }>(response.data);
        const metaTotal = response.data?.meta?.total;

        return {
            visits: Array.isArray(result.visits) ? result.visits.map(adaptVisit) : [],
            total: (metaTotal ?? result.total ?? 0)
        };
    },

    getRecentVisits: async (limit = 20) => {
        const response = await api.get(`/visits?status=completed&limit=${limit}&page=1`);
        const result = unwrapResponse<{ visits: VisitDTO[]; total: number }>(response.data);
        return Array.isArray(result.visits) ? result.visits.map(adaptVisit) : [];
    },

    getWaitingVisits: async () => {
        const response = await api.get('/visits/waiting');
        const data = unwrapResponse<VisitDTO[]>(response.data);
        return Array.isArray(data) ? data.map(adaptVisit) : [];
    },

    checkIn: async (data: {
        visitorCedula: string;
        consent: {
            accepted: boolean;
            policyVersion: string;
            acceptedAt: string;
        };
        purpose: string;
        personToVisit: string;
        targetDepartment?: string;
        hostPerson?: string;
        notes?: string;
        status?: string;
        companionName?: string;
        companionCedula?: string;
        vehicleBrand?: string;
        vehicleModel?: string;
        vehiclePlate?: string;
        action?: string;
        department?: string;
        visitorData?: {
            firstName?: string;
            lastName?: string;
            company?: string;
            phone?: string;
            photoBase64?: string;
            idPhotoBase64?: string;
            jobTitle?: string;
        };
    }) => {
        const response = await api.post('/visits/checkin', data);
        return unwrapResponse(response.data);
    },

    checkOut: async (id: number, notes?: string) => {
        const response = await api.post(`/visits/${id}/checkout`, { notes });
        return unwrapResponse(response.data);
    },

    admitVisitor: async (id: number) => {
        const response = await api.post(`/visits/${id}/admit`);
        return unwrapResponse(response.data);
    },

    getIntermittentVisits: async (): Promise<IntermittentVisit[]> => {
        const response = await api.get('/visits/intermittent');
        return unwrapResponse<IntermittentVisit[]>(response.data);
    },

    goIntermittent: async (id: number, notes?: string) => {
        const response = await api.post(`/visits/${id}/intermittent-exit`, { notes });
        return unwrapResponse(response.data);
    },

    reactivateVisit: async (id: number) => {
        const response = await api.post(`/visits/${id}/intermittent-reentry`);
        return unwrapResponse(response.data);
    },

    getVisitorPhotoUrl: (cedula: string) => {
        return `${API_URL}/visitors/${encodeURIComponent(cedula)}/photo`;
    },

    getVisitorIdPhotoUrl: (cedula: string) => {
        return `${API_URL}/visitors/${encodeURIComponent(cedula)}/id-photo`;
    },

    // Visitors
    getVisitorByCedula: async (cedula: string, includeHistory: boolean = false): Promise<Visitor | VisitorWithHistory> => {
        const response = await api.get(`/visitors/${cedula}?history=${includeHistory}`);
        return unwrapResponse<Visitor | VisitorWithHistory>(response.data);
    },

    getAllVisitors: async (page: number = 1, limit: number = 50, company?: string): Promise<{ visitors: Visitor[]; total: number }> => {
        let url = `/visitors?page=${page}&limit=${limit}`;
        if (company) url += `&company=${encodeURIComponent(company)}`;
        const response = await api.get(url);
        return unwrapResponse(response.data);
    },

    updateVisitor: async (cedula: string, data: Partial<Visitor> & { photoBase64?: string; idPhotoBase64?: string; firstName?: string; lastName?: string; jobTitle?: string; photoUrl?: string; idPhotoUrl?: string; visitId?: number }): Promise<Visitor> => {
        const response = await api.patch(`/visitors/${cedula}`, data);
        return unwrapResponse<Visitor>(response.data);
    },

    verifyEditPassword: async (password: string): Promise<boolean> => {
        const response = await api.post('/visitors/verify-edit-password', { password });
        const data = unwrapResponse<{ valid: boolean }>(response.data);
        return data.valid;
    },

    getEditHistory: async (visitId: number): Promise<EditHistoryEntry[]> => {
        const response = await api.get(`/visits/${visitId}/edit-history`);
        return unwrapResponse<EditHistoryEntry[]>(response.data);
    },

    getEditHistoryByCedula: async (cedula: string): Promise<EditHistoryEntry[]> => {
        const response = await api.get(`/visitors/${encodeURIComponent(cedula)}/edit-history`);
        return unwrapResponse<EditHistoryEntry[]>(response.data);
    },

    getCompanies: async (): Promise<string[]> => {
        const response = await api.get('/visitors/companies');
        return unwrapResponse<string[]>(response.data);
    },

    // Reports
    getStats: async (start?: string, end?: string): Promise<StatsData> => {
        let query = '';
        if (start && end) query = `?startDate=${start}&endDate=${end}`;
        const response = await api.get(`/reports/stats${query}`);
        return unwrapResponse<StatsData>(response.data);
    },

    getMonthlyReport: async (month: number, year: number) => {
        const response = await api.get(`/reports/stats/monthly?month=${month}&year=${year}`);
        return unwrapResponse(response.data);
    },

    getComparisonStats: async (month?: number, year?: number): Promise<ComparisonStats> => {
        let query = '';
        if (month !== undefined && year) query = `?month=${month}&year=${year}`;
        const response = await api.get(`/reports/comparison${query}`);
        return unwrapResponse<ComparisonStats>(response.data);
    },

    getAlerts: async (threshold?: number) => {
        const query = threshold ? `?threshold=${threshold}` : '';
        const response = await api.get(`/reports/alerts${query}`);
        return unwrapResponse(response.data);
    }
};

// Auth Service
export const AuthAPI = {
    changePassword: async (data: {
        currentPassword: string;
        newPassword: string;
        confirmPassword: string;
    }) => {
        const response = await api.post('/auth/change-password', data);
        return unwrapResponse(response.data);
    }
};

export default api;
