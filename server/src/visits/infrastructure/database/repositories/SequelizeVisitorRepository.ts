import { IVisitorRepository, VisitorFilters } from '../../../domain/repositories/IVisitorRepository';
import { Visitor, VisitorEntity } from '../../../domain/entities/Visitor.entity';
import { VisitEntity } from '../../../domain/entities/Visit.entity';
import VisitorModel from '../../../../models/Visitor';
import { Op, WhereOptions } from 'sequelize';
import Encryption from '../../../../utils/Encryption';

/**
 * Sequelize implementation of IVisitorRepository
 * Adapts between domain entities and Sequelize models
 */
export class SequelizeVisitorRepository implements IVisitorRepository {
  async findByCedula(tenantId: number, cedula: string): Promise<Visitor | null> {
    const hashed = Encryption.hash(cedula);
    const model = await VisitorModel.findOne({ where: { tenantId, cedula: hashed } });
    return model ? this.toDomain(model) : null;
  }

  async findById(tenantId: number, id: number): Promise<Visitor | null> {
    const model = await VisitorModel.findOne({ where: { id, tenantId } });
    return model ? this.toDomain(model) : null;
  }

  async findByCedulaWithHistory(tenantId: number, cedula: string, historyLimit: number = 5): Promise<{ visitor: Visitor | null; history: VisitEntity[] }> {
    const visitor = await this.findByCedula(tenantId, cedula);
    if (!visitor) {
      return { visitor: null, history: [] };
    }

    // Import VisitModel dynamically to avoid circular dependencies
    const VisitModel = (await import('../../../../models/Visit')).default;
    const hashedCedula = Encryption.hash(cedula);
    const history = await VisitModel.findAll({
      where: { tenantId, visitor_cedula: hashedCedula },
      order: [['check_in_time', 'DESC']],
      limit: historyLimit
    });

    const mappedHistory: VisitEntity[] = history.map((h) => h.toJSON() as unknown as VisitEntity);
    return { visitor, history: mappedHistory };
  }

  async findAll(tenantId: number, filters?: VisitorFilters): Promise<Visitor[]> {
    const where: WhereOptions = { tenantId };

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

  async search(tenantId: number, query: string): Promise<Visitor[]> {
    // Search is severely limited by encryption.
    // We can only reliably search by Exact Cedula (Blind Index).
    // Searching by Name or partial text is not supported with current encryption scheme.

    const hashed = Encryption.hash(query);
    
    // Check if it matches a cedula
    const byCedula = await VisitorModel.findOne({ where: { tenantId, cedula: hashed } });
    if (byCedula) {
        return [this.toDomain(byCedula)];
    }

    // Fallback: Search by Company (Unencrypted)
    const byCompany = await VisitorModel.findAll({
        where: {
            tenantId,
            company: { [Op.like]: `%${query}%` }
        },
        limit: 20
    });

    return byCompany.map(m => this.toDomain(m));
  }

  async create(tenantId: number, visitor: Visitor, photoData?: Buffer, idPhotoData?: Buffer): Promise<Visitor> {
    // Model hooks handle encryption
    const model = await VisitorModel.create({
      tenantId,
      cedula: visitor.cedula,
      first_name: visitor.firstName,
      last_name: visitor.lastName,
      company: visitor.company,
      job_title: visitor.jobTitle,
      photo_url: visitor.photoUrl,
      id_photo_url: visitor.idPhotoUrl,
      photo_data: photoData || visitor.photoBlob || null,
      id_photo_data: idPhotoData || visitor.idPhotoBlob || null,
      email: visitor.email,
      phone: visitor.phone,
      isBlocked: visitor.isBlocked,
      observations: visitor.observations,
      createdAt: visitor.createdAt
    });

    return this.toDomain(model);
  }

  async update(tenantId: number, cedula: string, data: Partial<VisitorEntity>): Promise<Visitor> {
    const hashed = Encryption.hash(cedula);
    const model = await VisitorModel.findOne({ where: { tenantId, cedula: hashed } });
    
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
      id_photo_url: data.idPhotoUrl,
      photo_data: data.photoBlob !== undefined ? data.photoBlob : undefined,
      id_photo_data: data.idPhotoBlob !== undefined ? data.idPhotoBlob : undefined,
      email: data.email,
      phone: data.phone,
      isBlocked: data.isBlocked,
      observations: data.observations
    });

    return this.toDomain(model);
  }

  async updateById(tenantId: number, id: number, data: Partial<VisitorEntity>): Promise<Visitor> {
    const model = await VisitorModel.findOne({ where: { id, tenantId } });
    
    if (!model) {
      throw new Error('Visitor not found');
    }

    await model.update({
      first_name: data.firstName,
      last_name: data.lastName,
      company: data.company,
      job_title: data.jobTitle,
      photo_url: data.photoUrl,
      id_photo_url: data.idPhotoUrl,
      photo_data: data.photoBlob !== undefined ? data.photoBlob : undefined,
      id_photo_data: data.idPhotoBlob !== undefined ? data.idPhotoBlob : undefined,
      email: data.email,
      phone: data.phone,
      isBlocked: data.isBlocked,
      observations: data.observations
    });

    return this.toDomain(model);
  }

  async getPhotoBlob(tenantId: number, cedula: string): Promise<Buffer | null> {
    const hashed = Encryption.hash(cedula);
    const model = await VisitorModel.findOne({
      where: { tenantId, cedula: hashed },
      attributes: ['photo_data']
    });
    return model?.photo_data || null;
  }

  async getIdPhotoBlob(tenantId: number, cedula: string): Promise<Buffer | null> {
    const hashed = Encryption.hash(cedula);
    const model = await VisitorModel.findOne({
      where: { tenantId, cedula: hashed },
      attributes: ['id_photo_data']
    });
    return model?.id_photo_data || null;
  }

  async delete(tenantId: number, cedula: string): Promise<void> {
    const hashed = Encryption.hash(cedula);
    await VisitorModel.destroy({ where: { tenantId, cedula: hashed } });
  }

  async deleteById(tenantId: number, id: number): Promise<void> {
    await VisitorModel.destroy({ where: { tenantId, id } });
  }

  async exists(tenantId: number, cedula: string): Promise<boolean> {
    const hashed = Encryption.hash(cedula);
    const count = await VisitorModel.count({ where: { tenantId, cedula: hashed } });
    return count > 0;
  }

  async count(tenantId: number, filters?: VisitorFilters): Promise<number> {
    const where: WhereOptions = { tenantId };

    if (filters?.company) {
      where.company = { [Op.like]: `%${filters.company}%` };
    }

    return await VisitorModel.count({ where });
  }

  async findDistinctCompanies(tenantId: number, query?: string): Promise<string[]> {
    const where: WhereOptions = { tenantId };
    
    if (query) {
      where.company = { [Op.like]: `%${query}%` };
    }

    const companies = await VisitorModel.findAll({
      attributes: [[VisitorModel.sequelize!.fn('DISTINCT', VisitorModel.sequelize!.col('company')), 'company']],
      where,
      order: [['company', 'ASC']],
      limit: 10
    });

    return companies.map((c: { company: string }) => c.company).filter((c: string) => c);
  }

  /**
   * Convert Sequelize model to domain entity
   */
  private toDomain(model: InstanceType<typeof VisitorModel>): Visitor {
    try {
      const decrypted = model.getDecrypted();
      return new Visitor(
        decrypted.id,
        decrypted.cedula,
        decrypted.first_name,
        decrypted.last_name,
        decrypted.company,
        decrypted.job_title || undefined,
        decrypted.photo_url || undefined,
        decrypted.id_photo_url || undefined,
        decrypted.email || undefined,
        decrypted.phone || undefined,
        model.photo_data || undefined,
        model.id_photo_data || undefined,
        decrypted.isBlocked,
        decrypted.observations || undefined,
        decrypted.createdAt
      );
    } catch {
      return new Visitor(
        model.id,
        `ERR-${model.id}`,
        '(cifrado',
        'inválido)',
        'N/A',
        undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, false, undefined, undefined
      );
    }
  }
}

