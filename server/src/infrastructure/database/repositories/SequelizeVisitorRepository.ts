import { IVisitorRepository, VisitorFilters } from '../../../domain/repositories/IVisitorRepository';
import { Visitor, VisitorEntity } from '../../../domain/entities/Visitor.entity';
import VisitorModel from '../../../models/Visitor';
import { Op } from 'sequelize';
import Encryption from '../../../utils/Encryption';

/**
 * Sequelize implementation of IVisitorRepository
 * Adapts between domain entities and Sequelize models
 */
export class SequelizeVisitorRepository implements IVisitorRepository {
  async findByCedula(cedula: string): Promise<Visitor | null> {
    const hashed = Encryption.hash(cedula);
    const model = await VisitorModel.findByPk(hashed);
    return model ? this.toDomain(model) : null;
  }

  async findAll(filters?: VisitorFilters): Promise<Visitor[]> {
    const where: any = {};

    // Encryption limits partial search capabilities.
    // Exact match on company is still possible if we stored company identically? 
    // Company was NOT encrypted in VisitorModel, so filter works.
    if (filters?.company) {
      where.company = { [Op.like]: `%${filters.company}%` };
    }

    if (filters?.hasEmail !== undefined) {
      where.email = filters.hasEmail ? { [Op.ne]: null } : null;
    }

    if (filters?.hasPhone !== undefined) {
      where.phone = filters.hasPhone ? { [Op.ne]: null } : null;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.page ? (filters.page - 1) * limit : 0;

    // Order by hashed or encrypted cedula is meaningless.
    // Creating default order by createdAt if available, or just keeping it.
    const models = await VisitorModel.findAll({
      where,
      limit,
      offset
    });

    return models.map(m => this.toDomain(m));
  }

  async search(query: string): Promise<Visitor[]> {
    // Search is severely limited by encryption.
    // We can only reliably search by Exact Cedula (Blind Index).
    // Searching by Name or partial text is not supported with current encryption scheme.

    const hashed = Encryption.hash(query);
    
    // Check if it matches a cedula
    const byCedula = await VisitorModel.findByPk(hashed);
    if (byCedula) {
        return [this.toDomain(byCedula)];
    }

    // Fallback: Search by Company (Unencrypted)
    const byCompany = await VisitorModel.findAll({
        where: {
            company: { [Op.like]: `%${query}%` }
        },
        limit: 20
    });

    return byCompany.map(m => this.toDomain(m));
  }

  async create(visitor: Visitor): Promise<Visitor> {
    // Model hooks handle encryption
    const model = await VisitorModel.create({
      cedula: visitor.cedula,
      first_name: visitor.firstName,
      last_name: visitor.lastName,
      company: visitor.company,
      job_title: visitor.jobTitle,
      photo_url: visitor.photoUrl,
      email: visitor.email,
      phone: visitor.phone
    });

    return this.toDomain(model);
  }

  async update(cedula: string, data: Partial<VisitorEntity>): Promise<Visitor> {
    const hashed = Encryption.hash(cedula);
    const model = await VisitorModel.findByPk(hashed);
    
    if (!model) {
      throw new Error('Visitor not found');
    }

    // Update fields (hooks handle encryption)
    await model.update({
      first_name: data.firstName,
      last_name: data.lastName,
      company: data.company,
      job_title: data.jobTitle,
      photo_url: data.photoUrl,
      email: data.email,
      phone: data.phone
    });

    return this.toDomain(model);
  }

  async delete(cedula: string): Promise<void> {
    const hashed = Encryption.hash(cedula);
    await VisitorModel.destroy({ where: { cedula: hashed } });
  }

  async exists(cedula: string): Promise<boolean> {
    const hashed = Encryption.hash(cedula);
    const count = await VisitorModel.count({ where: { cedula: hashed } });
    return count > 0;
  }

  async count(filters?: VisitorFilters): Promise<number> {
    const where: any = {};

    if (filters?.company) {
      where.company = { [Op.like]: `%${filters.company}%` };
    }

    return await VisitorModel.count({ where });
  }

  async findDistinctCompanies(query?: string): Promise<string[]> {
    const where: any = {};
    
    if (query) {
      where.company = { [Op.like]: `%${query}%` };
    }

    const companies = await VisitorModel.findAll({
      attributes: [[VisitorModel.sequelize!.fn('DISTINCT', VisitorModel.sequelize!.col('company')), 'company']],
      where,
      order: [['company', 'ASC']],
      limit: 10
    });

    return companies.map((c: any) => c.company).filter((c: string) => c);
  }

  /**
   * Convert Sequelize model to domain entity
   */
  private toDomain(model: InstanceType<typeof VisitorModel>): Visitor {
    // Use helper to get decrypted values
    const decrypted = model.getDecrypted();
    
    return new Visitor(
      decrypted.cedula, // Original Cedula
      decrypted.first_name,
      decrypted.last_name,
      decrypted.company,
      decrypted.job_title || undefined,
      decrypted.photo_url || undefined,
      decrypted.email || undefined,
      decrypted.phone || undefined
    );
  }
}

