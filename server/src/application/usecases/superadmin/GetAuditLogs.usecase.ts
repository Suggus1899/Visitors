import { IAuditLogRepository, AuditLogFilters, AuditLogEntity } from '../../../domain/repositories/IAuditLogRepository';

export type { AuditLogFilters, AuditLogEntity };

export class GetAuditLogsUseCase {
  constructor(private readonly auditLogRepository: IAuditLogRepository) {}

  async execute(filter?: AuditLogFilters): Promise<{ logs: AuditLogEntity[]; total: number }> {
    return await this.auditLogRepository.findAll(filter);
  }
}
