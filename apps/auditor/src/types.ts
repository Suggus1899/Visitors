/**
 * App-wide domain types for the LogMaster auditor app.
 *
 * These extend the shared @logmaster/types with auditor-specific
 * concerns: ARCO/privacy requests, compliance, reports, and tenant context.
 */

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export interface Tenant {
    slug: string;
    name: string;
}

// ---------------------------------------------------------------------------
// Audit (re-exported shapes used across the app)
// ---------------------------------------------------------------------------

export interface AuditLog {
    id: number;
    userId: number;
    username: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
}

export interface AuditStats {
    today: {
        logins: number;
        actions: number;
        uniqueUsers: number;
        uniqueIPs: number;
    };
    lastWeek: {
        dailyActivity: { date: string; count: number }[];
    };
    actionsByType?: { action: string; count: number }[];
    topUsers?: { username: string; count: number }[];
}

export interface AuditLogPagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export interface AuditLogsResponse {
    logs: AuditLog[];
    pagination: AuditLogPagination;
}

export type SortDirection = 'asc' | 'desc';

export type AuditSortableColumn = 'createdAt' | 'username' | 'action' | 'entity';

export interface AuditLogFilters {
    action?: string;
    username?: string;
    entity?: string;
    ipAddress?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: AuditSortableColumn;
    sortDir?: SortDirection;
}

// ---------------------------------------------------------------------------
// ARCO / Privacy
// ---------------------------------------------------------------------------

export type ArcoRequestType = 'access' | 'rectification' | 'cancellation' | 'opposition';

export type ArcoRequestStatus =
    | 'pending'
    | 'in_review'
    | 'completed'
    | 'rejected';

export interface ArcoStatusEvent {
    status: ArcoRequestStatus;
    changedAt: string;
    changedBy: string;
    notes?: string;
}

export interface ArcoRequest {
    id: number;
    requestType: ArcoRequestType;
    status: ArcoRequestStatus;
    subjectCedula: string;
    subjectName?: string;
    requestedBy: string;
    reason: string;
    details?: string;
    createdAt: string;
    updatedAt: string;
    dueDate?: string;
    resolvedAt?: string;
    timeline?: ArcoStatusEvent[];
}

export interface ArcoRequestFilters {
    status?: ArcoRequestStatus | '';
    requestType?: ArcoRequestType | '';
    search?: string;
    page?: number;
    limit?: number;
}

export interface ArcoListResponse {
    requests: ArcoRequest[];
    pagination: AuditLogPagination;
}

export interface ArcoCreatePayload {
    requestType: ArcoRequestType;
    subjectCedula: string;
    subjectName?: string;
    reason: string;
    details?: string;
}

export interface ArcoStatusUpdatePayload {
    status: ArcoRequestStatus;
    notes?: string;
}

// ---------------------------------------------------------------------------
// Subject data (ARCO right of access)
// ---------------------------------------------------------------------------

export interface SubjectVisitHistoryItem {
    id: number;
    purpose: string;
    checkInTime: string;
    checkOutTime?: string;
    status: string;
    targetDepartment?: string;
    hostPerson?: string;
}

export interface SubjectEditHistoryItem {
    id: number;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    editedBy: string;
    editedAt: string;
}

export interface SubjectData {
    cedula: string;
    firstName: string;
    lastName: string;
    company: string;
    jobTitle?: string;
    email?: string;
    phone?: string;
    isBlocked?: boolean;
    observations?: string;
    createdAt?: string;
    photoUrl?: string;
    idPhotoUrl?: string;
    visitHistory: SubjectVisitHistoryItem[];
    editHistory: SubjectEditHistoryItem[];
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportFormat = 'pdf' | 'csv';

export type ReportType =
    | 'audit_summary'
    | 'monthly_compliance'
    | 'visitor_activity'
    | 'access_report'
    | 'comparison';

export interface ReportGeneratePayload {
    type: ReportType;
    format: ReportFormat;
    startDate?: string;
    endDate?: string;
    month?: number;
    year?: number;
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface ComplianceCheck {
    id: string;
    label: string;
    status: 'compliant' | 'warning' | 'non_compliant';
    detail: string;
    recommendation?: string;
}

export interface ComplianceDashboard {
    checks: ComplianceCheck[];
    arcoResponseTimes: {
        averageDays: number;
        maxDays: number;
        withinDeadline: number;
        total: number;
    };
    dataRetention: {
        policyDays: number;
        oldestLogDate: string;
        status: 'compliant' | 'warning' | 'non_compliant';
    };
    piiEncryption: {
        enabled: boolean;
        algorithm?: string;
        status: 'compliant' | 'non_compliant';
    };
    backupCompliance: {
        lastBackupDate?: string;
        frequency: string;
        status: 'compliant' | 'warning' | 'non_compliant';
    };
    expiredDataCleanup: {
        lastRunDate?: string;
        pendingRecords: number;
        status: 'compliant' | 'warning' | 'non_compliant';
    };
}
