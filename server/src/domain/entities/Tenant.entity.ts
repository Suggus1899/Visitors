export type TenantStatus = 'active' | 'suspended' | 'trial';
export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';

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
  settings?: Record<string, unknown>;
}
