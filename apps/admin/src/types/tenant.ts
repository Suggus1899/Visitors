/**
 * Tenant-related types for the admin app.
 * These are defined locally because the shared @logmaster/types package
 * does not yet include multi-tenant types.
 * TODO: Move these to @logmaster/types once the backend migration is complete.
 */

export type Plan = 'free' | 'starter' | 'pro' | 'enterprise';

export interface TenantLimits {
    maxVisitors: number;
    maxBackups: number;
    retentionDays: number;
    maxUsers: number;
}

export interface Tenant {
    id: string;
    name: string;
    slug: string;
    plan: Plan;
    limits: TenantLimits;
    createdAt?: string;
}

export interface TenantUser {
    id: number;
    username: string;
    role: 'admin' | 'operador' | 'auditor';
    createdAt?: string;
    lastLoginAt?: string;
}

export interface TenantMembership {
    tenant: Tenant;
    role: 'admin' | 'operador' | 'auditor';
}

/** Plan-based retention and limit info displayed in the UI */
export const PLAN_LIMITS: Record<Plan, TenantLimits> = {
    free: { maxVisitors: 500, maxBackups: 5, retentionDays: 30, maxUsers: 3 },
    starter: { maxVisitors: 2000, maxBackups: 15, retentionDays: 90, maxUsers: 10 },
    pro: { maxVisitors: 10000, maxBackups: 50, retentionDays: 365, maxUsers: 50 },
    enterprise: { maxVisitors: -1, maxBackups: -1, retentionDays: -1, maxUsers: -1 },
};
