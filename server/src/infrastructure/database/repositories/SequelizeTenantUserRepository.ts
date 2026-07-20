import { TenantUserEntity } from '../../../domain/entities/TenantUser.entity';
import { ITenantUserRepository, TenantMembershipWithTenant } from '../../../domain/repositories/ITenantUserRepository';
import Tenant from '../../../models/Tenant';
import TenantUser from '../../../models/TenantUser';

export class SequelizeTenantUserRepository implements ITenantUserRepository {
  async findMembership(userId: number, tenantId: number): Promise<TenantUserEntity | null> { const membership = await TenantUser.findOne({ where: { userId, tenantId, isActive: true } }); return membership ? membership.toJSON() : null; }
  async findMembershipBySlug(userId: number, slug: string): Promise<TenantUserEntity | null> {
    const membership = await TenantUser.findOne({ where: { userId, isActive: true }, include: [{ model: Tenant, where: { slug }, attributes: [] }] });
    return membership ? membership.toJSON() : null;
  }
  async findByUserIdWithTenant(userId: number): Promise<TenantMembershipWithTenant[]> {
    const memberships = await TenantUser.findAll({
      where: { userId, isActive: true },
      include: [{ model: Tenant, required: true }]
    });
    return memberships.map(membership => membership.toJSON() as unknown as TenantMembershipWithTenant);
  }
  async create(membership: TenantUserEntity): Promise<TenantUserEntity> { return (await TenantUser.create(membership)).toJSON(); }
}
