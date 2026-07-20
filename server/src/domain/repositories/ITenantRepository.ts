import { TenantEntity } from '../entities/Tenant.entity';

export interface ITenantRepository {
  findById(id: number): Promise<TenantEntity | null>;
  findBySlug(slug: string): Promise<TenantEntity | null>;
  findAccessibleByUserId(userId: number): Promise<TenantEntity[]>;
  create(tenant: TenantEntity): Promise<TenantEntity>;
}
