import { IVisitorRepository } from '../../../domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../../../domain/repositories/IVisitRepository';
import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import { AccessSubjectDataResponseDto } from '../../dto/ArcoRequestDto';

export class AccessSubjectDataUseCase {
  constructor(
    private visitorRepository: IVisitorRepository,
    private visitRepository: IVisitRepository,
    private auditLogRepository: IAuditLogRepository
  ) { }

  async execute(tenantId: number, cedula: string, limit: number, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<AccessSubjectDataResponseDto> {
    const visitor = await this.visitorRepository.findByCedula(tenantId, cedula.trim());
    if (!visitor) {
      throw new Error('NOT_FOUND');
    }

    const allVisits = await this.visitRepository.findByVisitor(tenantId, visitor.cedula);
    const visits = allVisits.slice(0, limit);

    await this.auditLogRepository.log({
      tenantId,
      userId: actorId,
      username: actorUsername,
      action: 'ARCO_ACCESS_EXECUTED',
      entity: 'Visitor',
      entityId: visitor.cedula,
      details: `Consulta de datos personales. Registros: ${visits.length}`,
      ipAddress: ip,
      userAgent
    });

    return {
      visitor: visitor.toObject(),
      visits: visits.map((v) => ({
        id: v.id || 0,
        status: v.status,
        purpose: v.purpose,
        personToVisit: v.personToVisit,
        checkInTime: v.checkInTime,
        checkOutTime: v.checkOutTime ?? null,
        notes: v.notes || null
      }))
    };
  }
}
