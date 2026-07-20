import { IVisitorRepository } from '../../../../visits/domain/repositories/IVisitorRepository';
import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import { RectifySubjectDataDto } from '../../dto/ArcoRequestDto';

export class RectifySubjectDataUseCase {
  constructor(
    private visitorRepository: IVisitorRepository,
    private auditLogRepository: IAuditLogRepository
  ) { }

  async execute(tenantId: number, dto: RectifySubjectDataDto, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<{ message: string; visitor: unknown }> {
    const visitor = await this.visitorRepository.findByCedula(tenantId, dto.cedula.trim());
    if (!visitor) {
      throw new Error('NOT_FOUND');
    }

    const updates: Record<string, string | null | undefined> = {};
    if (dto.firstName !== undefined) updates.firstName = dto.firstName;
    if (dto.lastName !== undefined) updates.lastName = dto.lastName;
    if (dto.company !== undefined) updates.company = dto.company;
    if (dto.jobTitle !== undefined) updates.jobTitle = dto.jobTitle;
    if (dto.email !== undefined) updates.email = dto.email;
    if (dto.phone !== undefined) updates.phone = dto.phone;

    const updated = await this.visitorRepository.update(tenantId, visitor.cedula, updates);

    await this.auditLogRepository.log({
      tenantId,
      userId: actorId,
      username: actorUsername,
      action: 'ARCO_RECTIFICATION_EXECUTED',
      entity: 'Visitor',
      entityId: visitor.cedula,
      details: `Campos rectificados: ${Object.keys(updates).join(', ')}`,
      ipAddress: ip,
      userAgent
    });

    return { message: 'Datos rectificados correctamente', visitor: updated.toObject() };
  }
}
