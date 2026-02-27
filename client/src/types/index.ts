export interface User {
    id: number;
    username: string;
    role: 'admin' | 'guard';
}

export interface Visitor {
    cedula: string;
    first_name: string;
    last_name: string;
    company: string;
    job_title?: string;
    photo_url?: string;
    email?: string;
    phone?: string;
}

export interface Visit {
    id: number;
    visitor_cedula: string;
    reason: string;
    check_in: string;
    check_out?: string;
    status: 'active' | 'completed';
    personToVisit?: string;
    notes?: string;
    Visitor?: Visitor;
}

export interface StatsData {
    byWeek: { weekStart: string; count: number }[];
    byDayOfWeek: { day: number; dayName: string; count: number }[];
    topReasons: { reason: string; count: number }[];
    visitsPerDay: { date: string; count: number }[];
    recentActivity?: Visit[];
    byReason?: { purpose: string; count: number }[];
}

export interface ComparisonStats {
    summary: {
        currentMonth: number;
        lastMonth: number;
        growth: number;
    };
    reasons: {
        current: { purpose: string; count: number }[];
        last: { purpose: string; count: number }[];
    };
}

export interface AuthContextType {
    user: { username: string; role: string } | null;
    login: (token: string, userData: { username: string; role: string }) => void;
    logout: () => void;
    loading: boolean;
}

