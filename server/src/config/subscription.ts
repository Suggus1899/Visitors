import config from './AppConfig';

export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';
export type SubscriptionFeature =
  | 'auditor'
  | 'backupOnDemand'
  | 'calendar'
  | 'reports'
  | 'api'
  | 'analytics'
  | 'sla'
  | 'webhooks';

export type BackupFrequency = 'manual' | 'daily' | 'four-hour' | 'continuous';

export interface SubscriptionLimits {
  visitsPerMonth: number | null;
  maxUsers: number | null;
  maxVisitors: number | null;
  usersByRole: {
    admin: number | null;
    operador: number | null;
    auditor: number | null;
  };
  retentionDays: number;
  backupFrequency: BackupFrequency;
  backupRetentionCount: number | null;
  features: Readonly<Record<SubscriptionFeature, boolean>>;
}

const features = (...enabled: SubscriptionFeature[]): Readonly<Record<SubscriptionFeature, boolean>> => {
  const values: Record<SubscriptionFeature, boolean> = {
    auditor: false,
    backupOnDemand: false,
    calendar: false,
    reports: false,
    api: false,
    analytics: false,
    sla: false,
    webhooks: false,
  };
  enabled.forEach(feature => { values[feature] = true; });
  return Object.freeze(values);
};

export const SUBSCRIPTION_PLANS: Readonly<Record<SubscriptionPlan, SubscriptionLimits>> = Object.freeze({
  free: {
    visitsPerMonth: config.freeVisitsPerMonth,
    maxUsers: config.freeMaxUsers,
    maxVisitors: config.freeMaxVisitors,
    usersByRole: { admin: 1, operador: 2, auditor: 0 },
    retentionDays: 7,
    backupFrequency: 'manual',
    backupRetentionCount: 3,
    features: features('backupOnDemand'),
  },
  starter: {
    visitsPerMonth: config.starterVisitsPerMonth,
    maxUsers: config.starterMaxUsers,
    maxVisitors: config.starterMaxVisitors,
    usersByRole: { admin: 1, operador: 5, auditor: 1 },
    retentionDays: 30,
    backupFrequency: 'daily',
    backupRetentionCount: 30,
    features: features('auditor', 'backupOnDemand', 'calendar', 'reports'),
  },
  professional: {
    visitsPerMonth: config.professionalVisitsPerMonth,
    maxUsers: config.professionalMaxUsers,
    maxVisitors: config.professionalMaxVisitors,
    usersByRole: { admin: 3, operador: 15, auditor: 3 },
    retentionDays: 90,
    backupFrequency: 'four-hour',
    backupRetentionCount: 180,
    features: features('auditor', 'backupOnDemand', 'calendar', 'reports', 'api', 'analytics'),
  },
  enterprise: {
    visitsPerMonth: null,
    maxUsers: null,
    maxVisitors: null,
    usersByRole: { admin: null, operador: null, auditor: null },
    retentionDays: 365,
    backupFrequency: 'continuous',
    backupRetentionCount: null,
    features: features('auditor', 'backupOnDemand', 'calendar', 'reports', 'api', 'analytics', 'sla', 'webhooks'),
  },
});

/**
 * Monthly recurring revenue (MRR) estimate per plan.
 *
 * ASSUMPTION: Revenue is calculated from these static monthly prices. They are
 * not derived from real billing data — the platform does not integrate with a
 * payment provider yet. Adjust these values via env when real pricing is set.
 * `free` and demo tenants contribute 0 MRR.
 */
export const PLAN_PRICES: Readonly<Record<SubscriptionPlan, number>> = Object.freeze({
  free: 0,
  starter: 29,
  professional: 79,
  enterprise: 299,
});

/** Accept the legacy `pro` value while installations migrate their enum. */
export const normalizeSubscriptionPlan = (plan?: string | null): SubscriptionPlan =>
  plan === 'pro' ? 'professional' : plan && plan in SUBSCRIPTION_PLANS ? plan as SubscriptionPlan : 'free';

export const getSubscriptionLimits = (plan?: string | null): SubscriptionLimits =>
  SUBSCRIPTION_PLANS[normalizeSubscriptionPlan(plan)];

/** Monthly price for a plan (used for revenue/MRR calculations). */
export const getPlanPrice = (plan?: string | null): number =>
  PLAN_PRICES[normalizeSubscriptionPlan(plan)];
