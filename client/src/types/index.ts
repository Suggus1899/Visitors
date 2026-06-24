export interface User {
    id: number;
    username: string;
    role: 'root' | 'admin' | 'operador' | 'auditor' | 'demo';
}

export interface Visitor {
    id?: number;
    cedula: string;
    first_name: string;
    last_name: string;
    company: string;
    job_title?: string;
    photo_url?: string;
    id_photo_url?: string;
    email?: string;
    phone?: string;
    isBlocked?: boolean;
    observations?: string;
    createdAt?: string;
}

export interface VisitorHistoryItem {
    id: number;
    purpose: string;
    checkInTime: string;
    checkOutTime?: string;
    status: string;
    targetDepartment?: string;
    // Vehicle data from previous visits
    vehicleBrand?: string;
    vehicleModel?: string;
    vehiclePlate?: string;
    // Photos from previous visits
    photo_url?: string;
    id_photo_url?: string;
}

export interface VisitorWithHistory extends Visitor {
    history: VisitorHistoryItem[];
}

/**
 * Represents a temporary exit/re-entry event during an active visit.
 * Stored in the IntermittentLogs relational table.
 */
export interface IntermittentLog {
    id: number;
    visit_id: number;
    /** ISO 8601 — timestamp of temporary exit */
    check_out: string;
    /** ISO 8601 — timestamp of re-entry; undefined/null means visitor is still outside */
    re_entry?: string | null;
    notes?: string | null;
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
    status: 'waiting' | 'active' | 'intermittent' | 'completed';
    personToVisit?: string;
    person_to_visit?: string;
    notes?: string;

    // --- ISO 8601 Timestamp Lifecycle ---
    arrival_time?: string;    // When visitor arrived at reception gate
    entry_time?: string;      // When visitor entered the premises
    exit_time?: string;       // When visitor fully departed

    // --- Explicit Relational Fields ---
    target_department?: string;  // Area/Department being visited
    host_person?: string;        // Specific person being visited
    
    // Pase de Entrada
    companionName?: string;
    companionCedula?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehiclePlate?: string;
    action?: 'Carga' | 'Descarga' | 'Ninguna';
    department?: string;

    // Intermittent access log sub-collection
    intermittent_logs?: IntermittentLog[];

    Visitor?: Visitor;
}

/**
 * Intermittent visit as returned by GET /visits/intermittent
 */
export interface IntermittentVisit {
    id: number;
    visitorCedula: string;
    visitorName: string;
    firstName?: string;
    lastName?: string;
    company: string;
    checkInTime: string;
    purpose: string;
    personToVisit: string;
    durationMinutes: number;
    lastExitTime: string;
    minutesOutside: number;
    intervals: {
        id?: number;
        exitTime: string;
        reentryTime?: string;
        notes?: string;
    }[];
    notes?: string;
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

export interface ReasonData {
    reason: string;
    count: number;
}
