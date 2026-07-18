import { IVisitorEditHistoryRepository, VisitorEditHistoryEntity } from '../../../domain/repositories/IVisitorEditHistoryRepository';
import VisitorEditHistoryModel from '../../../models/VisitorEditHistory';

/**
 * Sequelize implementation of IVisitorEditHistoryRepository
 */
export class SequelizeVisitorEditHistoryRepository implements IVisitorEditHistoryRepository {
  async create(entry: Omit<VisitorEditHistoryEntity, 'id' | 'editedAt'>): Promise<VisitorEditHistoryEntity> {
    const model = await VisitorEditHistoryModel.create({
      visitId: entry.visitId,
      visitorId: entry.visitorId,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      editedBy: entry.editedBy,
      editedByUsername: entry.editedByUsername,
    });
    return this.toEntity(model);
  }

  async findByVisitId(visitId: number): Promise<VisitorEditHistoryEntity[]> {
    const models = await VisitorEditHistoryModel.findAll({
      where: { visitId },
      order: [['editedAt', 'ASC']],
    });
    return models.map(m => this.toEntity(m));
  }

  async findByVisitorId(visitorId: number): Promise<VisitorEditHistoryEntity[]> {
    const models = await VisitorEditHistoryModel.findAll({
      where: { visitorId },
      order: [['editedAt', 'ASC']],
    });
    return models.map(m => this.toEntity(m));
  }

  private toEntity(model: InstanceType<typeof VisitorEditHistoryModel>): VisitorEditHistoryEntity {
    return {
      id: model.id,
      visitId: model.visitId,
      visitorId: model.visitorId,
      field: model.field,
      oldValue: model.oldValue,
      newValue: model.newValue,
      editedBy: model.editedBy,
      editedByUsername: model.editedByUsername,
      editedAt: model.editedAt,
    };
  }
}
