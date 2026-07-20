import { UserRole } from '../../domain/entities/User.entity';
import { TenantRole } from '../../domain/entities/TenantUser.entity';
import { TenantStatus, SubscriptionPlan } from '../../domain/entities/Tenant.entity';

export interface LoginDto {
  /** Identifier: accepts either a username or an email address. */
  username: string;
  password: string;
}

export interface TenantSummaryDto {
  id: number;
  slug: string;
  name: string;
  role: TenantRole;
  status: TenantStatus;
  isDemo: boolean;
  plan: SubscriptionPlan;
  subscriptionExpiresAt: Date | null;
}

export interface AuthResponseDto {
  token: string;
  accessToken?: string;
  refreshToken?: string;
  user: {
    id?: number;
    username: string;
    role: UserRole | TenantRole;
    email?: string | null;
    mustChangePassword?: boolean;
  };
  /** Present when the user belongs to more than one tenant and must select one. */
  tenants?: TenantSummaryDto[];
  requiresTenantSelection?: boolean;
}

export interface SelectTenantDto {
  tenantSlug: string;
}

export interface SelectTenantResult {
  accessToken: string;
  tenant: {
    id: number;
    slug: string;
    name: string;
    role: TenantRole;
  };
}

export interface CreateDemoDto {
  name: string;
  email: string;
  company?: string;
  phone?: string;
}

export interface DemoCredentialDto {
  email: string;
  password: string;
  role: TenantRole;
}

export interface CreateDemoResult {
  demoTenant: {
    slug: string;
    name: string;
    expiresAt: Date;
  };
  credentials: DemoCredentialDto[];
  accessToken: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
  /** Optional tenant slug to embed tenant context in the new access token. */
  tenantSlug?: string;
}

export interface RefreshTokenResult {
  accessToken: string;
}
