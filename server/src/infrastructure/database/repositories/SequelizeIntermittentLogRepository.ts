import { IIntermittentLogRepository, IntermittentLogEntity, CreateIntermittentLogInput, CloseLogInput } from '../../../domain/repositories/IIntermittentLogRepository';
import IntermittentLogModel from '../../../models/IntermittentLog';
import { Op } from 'sequelize';

export class SequelizeIntermittentLogRepository implements IIntermittentLogRepository {
  async create(input: CreateIntermittentLogInput): Promise<IntermittentLogEntity> {
    const model = await IntermittentLogModel.create({
      visit_id: input.visitId,
      check_out: input.checkOut,
      notes: input.notes ?? null,
      registered_by: input.registeredBy ?? null,
    });
    return this.toDomain(model);
  }

  async findByVisitId(visitId: number): Promise<IntermittentLogEntity[]> {
    const models = await IntermittentLogModel.findAll({
      where: { visit_id: visitId },
      order: [['check_out', 'DESC']],
    });
    return models.map(m => this.toDomain(m));
  }

  async findOpenByVisitId(visitId: number): Promise<IntermittentLogEntity | null> {
    const model = await IntermittentLogModel.findOne({
      where: {
        visit_id: visitId,
        re_entry: { [Op.is]: null as any },
      },
      order: [['check_out', 'DESC']],
    });
    return model ? this.toDomain(model) : null;
  }

  async closeLog(id: number, input: CloseLogInput): Promise<IntermittentLogEntity> {
    const model = await IntermittentLogModel.findByPk(id);
    if (!model) {
      throw new Error('Intermittent log not found');
    }
    await model.update({
      re_entry: input.reEntry,
      registered_by: input.registeredBy ?? model.registered_by,
    });
    return this.toDomain(model);
  }

  async findAll(): Promise<IntermittentLogEntity[]> {
    const models = await IntermittentLogModel.findAll();
    return models.map(m => this.toDomain(m));
  }

  private toDomain(model: InstanceType<typeof IntermittentLogModel>): IntermittentLogEntity {
    return {
      id: model.id,
      visitId: model.visit_id,
      checkOut: model.check_out,
      reEntry: model.re_entry,
      notes: model.notes,
      registeredBy: model.registered_by,
    };
  }
}
