export type TenantStatus = 'active' | 'suspended' | 'trial';
export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export interface TenantSettings {
  customLimits?: boolean;
  [key: string]: unknown;
}

export interface TenantEntity {
  id?: number;
  slug: string;
  name: string;
  domain?: string | null;
  status?: TenantStatus;
  subscriptionPlan?: SubscriptionPlan;
  maxUsers?: number;
  maxVisitors?: number;
  subscriptionExpiresAt?: Date | null;
  isDemo?: boolean;
  demoExpiresAt?: Date | null;
  settings?: TenantSettings;
}
