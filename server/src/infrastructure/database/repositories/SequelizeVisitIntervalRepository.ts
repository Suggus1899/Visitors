import { IVisitIntervalRepository } from '../../../domain/repositories/IVisitIntervalRepository';
import { VisitInterval } from '../../../domain/entities/VisitInterval.entity';
import VisitIntervalModel from '../../../models/VisitInterval';
import { Op } from 'sequelize';

export class SequelizeVisitIntervalRepository implements IVisitIntervalRepository {
  async create(interval: VisitInterval): Promise<VisitInterval> {
    const model = await VisitIntervalModel.create({
      visit_id: interval.visitId,
      exit_time: interval.exitTime,
      reentry_time: interval.reentryTime || null,
      notes: interval.notes || null
    });
    return this.toDomain(model);
  }

  async findByVisit(visitId: number): Promise<VisitInterval[]> {
    const models = await VisitIntervalModel.findAll({
      where: { visit_id: visitId },
      order: [['exit_time', 'ASC']]
    });
    return models.map(m => this.toDomain(m));
  }

  async findOpenByVisit(visitId: number): Promise<VisitInterval | null> {
    const model = await VisitIntervalModel.findOne({
      where: {
        visit_id: visitId,
        reentry_time: { [Op.is]: null as any }
      }
    });
    return model ? this.toDomain(model) : null;
  }

  async closeInterval(intervalId: number, reentryTime: Date): Promise<VisitInterval> {
    const model = await VisitIntervalModel.findByPk(intervalId);
    if (!model) {
      throw new Error('Visit interval not found');
    }
    await model.update({ reentry_time: reentryTime });
    return this.toDomain(model);
  }

  async delete(id: number): Promise<void> {
    await VisitIntervalModel.destroy({ where: { id } });
  }

  private toDomain(model: InstanceType<typeof VisitIntervalModel>): VisitInterval {
    return new VisitInterval(
      model.visit_id,
      model.exit_time,
      model.id,
      model.reentry_time || undefined,
      model.notes || undefined
    );
  }
}
