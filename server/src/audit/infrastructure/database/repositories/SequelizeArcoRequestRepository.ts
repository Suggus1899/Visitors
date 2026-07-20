import { Op } from 'sequelize';
import {
  IArcoRequestRepository,
  ArcoRequestEntity,
  ArcoRequestFilters,
  CreateArcoRequestData,
  UpdateArcoRequestData
} from '../../../domain/repositories/IArcoRequestRepository';
import ArcoRequest from '../../../../models/ArcoRequest';

export class SequelizeArcoRequestRepository implements IArcoRequestRepository {
  async create(tenantId: number, data: CreateArcoRequestData): Promise<ArcoRequestEntity> {
    const record = await ArcoRequest.create({
      tenantId,
      requestType: data.requestType,
      subjectCedulaHash: data.subjectCedulaHash,
      subjectCedulaEncrypted: data.subjectCedulaEncrypted,
      requestedByName: data.requestedByName,
      requestedByUserId: data.requestedByUserId,
      contactEmail: data.contactEmail,
      reason: data.reason,
      requestPayload: data.requestPayload,
      status: data.status
    });
    return this.toDomain(record);
  }

  async findById(tenantId: number, id: number): Promise<ArcoRequestEntity | null> {
    const record = await ArcoRequest.findOne({ where: { tenantId, id } });
    return record ? this.toDomain(record) : null;
  }

  async findAll(tenantId: number, filters?: ArcoRequestFilters): Promise<{ rows: ArcoRequestEntity[]; count: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.requestType) where.requestType = filters.requestType;
    if (filters?.search) {
      where[Op.or as unknown as string] = [
        { requestedByName: { [Op.like]: `%${filters.search}%` } },
        { contactEmail: { [Op.like]: `%${filters.search}%` } },
        { reason: { [Op.like]: `%${filters.search}%` } }
      ];
    }

    const { rows, count } = await ArcoRequest.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: filters?.limit || 20,
      offset: filters?.offset || 0
    });

    return {
      rows: rows.map((r) => this.toDomain(r)),
      count
    };
  }

  async update(tenantId: number, id: number, data: Partial<UpdateArcoRequestData>): Promise<ArcoRequestEntity | null> {
    const record = await ArcoRequest.findOne({ where: { tenantId, id } });
    if (!record) return null;
    await record.update(data);
    return this.toDomain(record);
  }

  private toDomain(model: typeof ArcoRequest.prototype): ArcoRequestEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      requestType: model.requestType,
      subjectCedulaHash: model.subjectCedulaHash,
      subjectCedulaEncrypted: model.subjectCedulaEncrypted,
      requestedByName: model.requestedByName,
      requestedByUserId: model.requestedByUserId,
      contactEmail: model.contactEmail,
      reason: model.reason,
      requestPayload: model.requestPayload,
      status: model.status,
      resolutionNotes: model.resolutionNotes,
      resolvedAt: model.resolvedAt,
      createdAt: model.createdAt
    };
  }
}
