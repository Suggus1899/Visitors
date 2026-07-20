import { IArcoRequestRepository } from '../../../domain/repositories/IArcoRequestRepository';
import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import Encryption from '../../../utils/Encryption';
import { CreateArcoRequestDto, ArcoRequestResponseDto } from '../../dto/ArcoRequestDto';

export class CreateArcoRequestUseCase {
  constructor(
    private arcoRepository: IArcoRequestRepository,
    private auditLogRepository: IAuditLogRepository
  ) { }

  async execute(tenantId: number, dto: CreateArcoRequestDto, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<ArcoRequestResponseDto> {
    const normalizedCedula = dto.cedula.trim();
    const hash = Encryption.hash(normalizedCedula);

    const record = await this.arcoRepository.create(tenantId, {
      requestType: dto.requestType,
      subjectCedulaHash: hash,
      subjectCedulaEncrypted: Encryption.encrypt(normalizedCedula),
      requestedByName: dto.requestedByName,
      requestedByUserId: actorId,
      contactEmail: dto.contactEmail || null,
      reason: dto.reason || null,
      requestPayload: dto.requestPayload ? JSON.stringify(dto.requestPayload) : null,
      status: 'pending'
    });

    await this.auditLogRepository.log({
      tenantId,
      userId: actorId,
      username: actorUsername,
      action: 'ARCO_REQUEST_CREATED',
      entity: 'ArcoRequest',
      entityId: String(record.id),
      details: `Tipo: ${dto.requestType}`,
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
