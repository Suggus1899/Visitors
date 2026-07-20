import { IVisitorEditHistoryRepository, VisitorEditHistoryEntity } from '../../../domain/repositories/IVisitorEditHistoryRepository';
import VisitorEditHistoryModel, { PII_EDIT_FIELDS } from '../../../models/VisitorEditHistory';
import Encryption from '../../../utils/Encryption';

/**
 * Decrypts an edit-history value when the tracked field is PII. Non-PII
 * values are returned unchanged. Legacy plain-text PII rows (encrypted
 * after the hook was introduced) are handled transparently by
 * Encryption.decrypt, which returns plain text as-is when not encrypted.
 */
const decryptEditValue = (field: string, value: string | null): string | null => {
    if (value === null || value === undefined) return null;
    if (!PII_EDIT_FIELDS.has(field)) return value;
    if (!Encryption.isEncrypted(value)) return value;
    return Encryption.decrypt(value);
};

/**
 * Sequelize implementation of IVisitorEditHistoryRepository
 */
export class SequelizeVisitorEditHistoryRepository implements IVisitorEditHistoryRepository {
  async create(tenantId: number, entry: Omit<VisitorEditHistoryEntity, 'id' | 'editedAt' | 'tenantId'>): Promise<VisitorEditHistoryEntity> {
    const model = await VisitorEditHistoryModel.create({
      tenantId,
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

  async findByVisitId(tenantId: number, visitId: number): Promise<VisitorEditHistoryEntity[]> {
    const models = await VisitorEditHistoryModel.findAll({
      where: { tenantId, visitId },
      order: [['editedAt', 'ASC']],
    });
    return models.map(m => this.toEntity(m));
  }

  async findByVisitorId(tenantId: number, visitorId: number): Promise<VisitorEditHistoryEntity[]> {
    const models = await VisitorEditHistoryModel.findAll({
      where: { tenantId, visitorId },
      order: [['editedAt', 'ASC']],
    });
    return models.map(m => this.toEntity(m));
  }

  private toEntity(model: InstanceType<typeof VisitorEditHistoryModel>): VisitorEditHistoryEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      visitId: model.visitId,
      visitorId: model.visitorId,
      field: model.field,
      oldValue: decryptEditValue(model.field, model.oldValue),
      newValue: decryptEditValue(model.field, model.newValue),
      editedBy: model.editedBy,
      editedByUsername: model.editedByUsername,
      editedAt: model.editedAt,
    };
  }
}
