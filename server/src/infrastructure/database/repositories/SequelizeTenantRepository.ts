import { TenantEntity } from '../../../domain/entities/Tenant.entity';
import { ITenantRepository } from '../../../domain/repositories/ITenantRepository';
import Tenant from '../../../models/Tenant';
import TenantUser from '../../../models/TenantUser';

export class SequelizeTenantRepository implements ITenantRepository {
  async findById(id: number): Promise<TenantEntity | null> { const tenant = await Tenant.findByPk(id); return tenant ? tenant.toJSON() : null; }
  async findBySlug(slug: string): Promise<TenantEntity | null> { const tenant = await Tenant.findOne({ where: { slug } }); return tenant ? tenant.toJSON() : null; }
  async findAccessibleByUserId(userId: number): Promise<TenantEntity[]> {
    const tenants = await Tenant.findAll({ include: [{ model: TenantUser, where: { userId, isActive: true }, attributes: [] }] });
    return tenants.map(tenant => tenant.toJSON());
  }
  async create(tenant: TenantEntity): Promise<TenantEntity> { return (await Tenant.create(tenant)).toJSON(); }
}
