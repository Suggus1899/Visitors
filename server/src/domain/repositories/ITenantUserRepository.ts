import { TenantUserEntity, TenantRole } from '../entities/TenantUser.entity';
import { TenantEntity } from '../entities/Tenant.entity';

export interface TenantMembershipWithTenant extends TenantUserEntity {
  tenant: TenantEntity;
}

export interface ITenantUserRepository {
  findMembership(userId: number, tenantId: number): Promise<TenantUserEntity | null>;
  findMembershipBySlug(userId: number, slug: string): Promise<TenantUserEntity | null>;
  findByUserIdWithTenant(userId: number): Promise<TenantMembershipWithTenant[]>;
  create(membership: TenantUserEntity): Promise<TenantUserEntity>;
  /** Count active users in a tenant. */
  countActive(tenantId: number): Promise<number>;
  /** Count active users in a tenant grouped by role. Only roles in the filter are counted. */
  countActiveByRole(tenantId: number, roles: TenantRole[]): Promise<Record<TenantRole, number>>;
}
