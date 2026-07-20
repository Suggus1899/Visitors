import { IArcoRequestRepository } from '../../../domain/repositories/IArcoRequestRepository';
import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import Encryption from '../../../../utils/Encryption';
import { CreateOppositionRequestDto, ArcoRequestResponseDto } from '../../dto/ArcoRequestDto';

export class CreateOppositionRequestUseCase {
  constructor(
    private arcoRepository: IArcoRequestRepository,
    private auditLogRepository: IAuditLogRepository
  ) { }

  async execute(tenantId: number, dto: CreateOppositionRequestDto, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<ArcoRequestResponseDto> {
    const normalizedCedula = dto.cedula.trim();
    const hash = Encryption.hash(normalizedCedula);

    const record = await this.arcoRepository.create(tenantId, {
      requestType: 'opposition',
      subjectCedulaHash: hash,
      subjectCedulaEncrypted: Encryption.encrypt(normalizedCedula),
      requestedByName: dto.requestedByName,
      requestedByUserId: actorId,
      contactEmail: dto.contactEmail || null,
      reason: dto.reason || 'Solicitud de oposicion registrada',
      status: 'pending',
      requestPayload: null
    });

    await this.auditLogRepository.log({
      tenantId,
      userId: actorId,
      username: actorUsername,
      action: 'ARCO_OPPOSITION_REQUESTED',
      entity: 'ArcoRequest',
      entityId: String(record.id),
      details: 'Solicitud de oposicion creada',
      ipAddress: ip,
      userAgent
    });

    return {
      id: record.id,
      status: record.status,
      requestType: record.requestType,
      createdAt: record.createdAt
    };
  }
}
