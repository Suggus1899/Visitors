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
    id_photo_url?: string;
    email?: string;
    phone?: string;
}

export interface Visit {
    id: number;
    visitor_cedula: string;
    reason?: string; 
    purpose?: string;
    check_in?: string;
    check_in_time?: string;
    check_out?: string;
    check_out_time?: string;
    status: 'waiting' | 'active' | 'completed';
    personToVisit?: string;
    person_to_visit?: string;
    notes?: string;
    
    // Pase de Entrada
    companionName?: string;
    companionCedula?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehiclePlate?: string;
    area?: 'Oficina' | 'Planta' | 'Almacén' | 'Ninguna';
    action?: 'Carga' | 'Descarga' | 'Ninguna';
    department?: string;

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

