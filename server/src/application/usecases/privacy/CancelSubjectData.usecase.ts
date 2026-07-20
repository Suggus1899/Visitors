import { IVisitorRepository } from '../../../domain/repositories/IVisitorRepository';
import { IArcoRequestRepository } from '../../../domain/repositories/IArcoRequestRepository';
import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import Encryption from '../../../utils/Encryption';

export class CancelSubjectDataUseCase {
  constructor(
    private visitorRepository: IVisitorRepository,
    private arcoRepository: IArcoRequestRepository,
    private auditLogRepository: IAuditLogRepository
  ) { }

  async execute(tenantId: number, cedula: string, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<{ message: string }> {
    const visitor = await this.visitorRepository.findByCedula(tenantId, cedula.trim());
    if (!visitor) {
      throw new Error('NOT_FOUND');
    }

    await this.visitorRepository.update(tenantId, visitor.cedula, {
      firstName: 'ANONIMO',
      lastName: 'ANONIMO',
      company: 'ANONIMIZADO',
      jobTitle: undefined,
      email: undefined,
      phone: undefined,
      photoUrl: undefined,
      idPhotoUrl: undefined,
    });

    const normalizedCedula = cedula.trim();
    const hash = Encryption.hash(normalizedCedula);

    await this.arcoRepository.create(tenantId, {
      requestType: 'cancellation',
      subjectCedulaHash: hash,
      subjectCedulaEncrypted: null,
      requestedByName: actorUsername,
      requestedByUserId: actorId,
      reason: 'Cancelacion ejecutada por administrador',
      status: 'completed',
      requestPayload: null,
      contactEmail: null
    });

    await this.auditLogRepository.log({
      tenantId,
      userId: actorId,
      username: actorUsername,
      action: 'ARCO_CANCELLATION_EXECUTED',
      entity: 'Visitor',
      entityId: visitor.cedula,
      details: 'Datos personales anonimizados y fotos eliminadas',
      ipAddress: ip,
      userAgent
    });

    return { message: 'Datos del titular anonimizados correctamente' };
  }
}
