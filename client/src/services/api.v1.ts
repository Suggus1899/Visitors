import axios from 'axios';
import type { Visit, Visitor, StatsData, ComparisonStats } from '../types';

const API_URL = 'http://localhost:3000/api/v1';

// Configure axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Import AuthService for token management
// Note: We use dynamic import to avoid circular dependencies
let authServicePromise: Promise<any> | null = null;
const getAuthService = async () => {
    if (!authServicePromise) {
        authServicePromise = import('./AuthService').then(module => module.default);
    }
    return authServicePromise;
};

/**
 * Request interceptor to inject Access Token
 * Requirement 3.8: Add Access Token to all authenticated requests
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
 * Response interceptor for automatic token refresh and error handling
 * Requirements:
 * - 3.6: Automatic token refresh on 401
 * - 3.7: Retry original request with new token
 * - 3.8: Redirect to login if refresh fails
 * - 5.3: Handle PASSWORD_CHANGE_REQUIRED error
 * - 9.4: Handle ACCOUNT_LOCKED error with remaining time
 */
api.interceptors.response.use(
    (response) => {
        // Pass through successful responses
        return response;
    },
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
                    window.location.href = '/login';
                }

                return Promise.reject(refreshError);
            }
        }

        // Handle network errors
        if (!error.response) {
            console.error('Network error:', error.message);
        }

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
interface VisitDTO {
    id: number;
    visitorCedula: string;
    purpose: string;
    checkInTime: string;
    checkOutTime?: string;
    status?: string;
    personToVisit?: string;
    notes?: string;
    visitorName?: string;
    visitorCompany?: string;
    company?: string;
    photoUrl?: string;
    visitorPhoto?: string;
}

const adaptVisit = (v: VisitDTO): Visit => {
    // Helper to fix photo URL
    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        // Remove /api/v1 from API_URL to get base
        const baseUrl = 'http://127.0.0.1:3000';
        const cleanUrl = url.startsWith('/') ? url : `/${url}`;
        const finalUrl = `${baseUrl}${cleanUrl}?t=${new Date().getTime()}`;
        return finalUrl;
    };

    return {
        id: v.id,
        visitor_cedula: v.visitorCedula,
        reason: v.purpose,
        check_in: v.checkInTime,
        check_out: v.checkOutTime,
        status: (v.status ? v.status.toLowerCase() : 'active') as 'active' | 'completed',
        personToVisit: v.personToVisit,
        notes: v.notes,
        Visitor: {
            cedula: v.visitorCedula,
            first_name: v.visitorName || 'Visitante',
            last_name: '',
            company: v.visitorCompany || v.company || 'Sin empresa',
            photo_url: getPhotoUrl(v.photoUrl || v.visitorPhoto) || undefined,
            // Other fields might be missing in simple lists
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

    getWaitingVisits: async () => {
        const response = await api.get('/visits/waiting');
        const data = unwrapResponse<VisitDTO[]>(response.data);
        return Array.isArray(data) ? data.map(adaptVisit) : [];
    },

    checkIn: async (data: {
        visitorCedula: string;
        purpose: string;
        personToVisit: string;
        notes?: string;
        status?: string;
        companionName?: string;
        companionCedula?: string;
        vehicleBrand?: string;
        vehicleModel?: string;
        vehiclePlate?: string;
        area?: string;
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

    // Visitors
    getVisitorByCedula: async (cedula: string): Promise<Visitor> => {
        const response = await api.get(`/visitors/${cedula}`);
        return unwrapResponse<Visitor>(response.data);
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
