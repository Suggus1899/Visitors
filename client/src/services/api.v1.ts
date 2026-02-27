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

// Add auth token intercepter if needed (assuming token is stored in localStorage)
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

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

export default api;
