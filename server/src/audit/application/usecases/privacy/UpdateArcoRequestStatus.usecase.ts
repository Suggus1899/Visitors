import { IArcoRequestRepository, ArcoRequestStatus } from '../../../domain/repositories/IArcoRequestRepository';
import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import { UpdateArcoRequestStatusDto } from '../../dto/ArcoRequestDto';

export class UpdateArcoRequestStatusUseCase {
  constructor(
    private arcoRepository: IArcoRequestRepository,
    private auditLogRepository: IAuditLogRepository
  ) { }

  async execute(tenantId: number, id: number, dto: UpdateArcoRequestStatusDto, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<{ id: number; status: ArcoRequestStatus; resolvedAt: Date | null; resolutionNotes: string | null }> {
    const existing = await this.arcoRepository.findById(tenantId, id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }

    const terminalStatus = dto.status === 'completed' || dto.status === 'rejected';
    const updated = await this.arcoRepository.update(tenantId, id, {
      status: dto.status,
      resolutionNotes: dto.resolutionNotes || null,
      resolvedAt: terminalStatus ? new Date() : null
    });

    if (!updated) throw new Error('UPDATE_FAILED');

    await this.auditLogRepository.log({
      tenantId,
      userId: actorId,
      username: actorUsername,
      action: 'ARCO_REQUEST_STATUS_UPDATED',
      entity: 'ArcoRequest',
      entityId: String(id),
      details: `Nuevo estado: ${dto.status}`,
      ipAddress: ip,
      userAgent
    });

    return {
      id: updated.id,
      status: updated.status,
      resolvedAt: updated.resolvedAt,
      resolutionNotes: updated.resolutionNotes
    };
  }
}
