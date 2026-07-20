import { TenantUserEntity } from '../entities/TenantUser.entity';
import { TenantEntity } from '../entities/Tenant.entity';

export interface TenantMembershipWithTenant extends TenantUserEntity {
  tenant: TenantEntity;
}

export interface ITenantUserRepository {
  findMembership(userId: number, tenantId: number): Promise<TenantUserEntity | null>;
  findMembershipBySlug(userId: number, slug: string): Promise<TenantUserEntity | null>;
  findByUserIdWithTenant(userId: number): Promise<TenantMembershipWithTenant[]>;
  create(membership: TenantUserEntity): Promise<TenantUserEntity>;
}
