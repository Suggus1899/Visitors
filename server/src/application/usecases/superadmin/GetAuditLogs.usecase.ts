import { IAuditLogRepository, AuditLogFilters, AuditLogEntity } from '../../../domain/repositories/IAuditLogRepository';

export type { AuditLogFilters, AuditLogEntity };

export class GetAuditLogsUseCase {
  constructor(private readonly auditLogRepository: IAuditLogRepository) {}

  async execute(filter?: AuditLogFilters): Promise<{ logs: AuditLogEntity[]; total: number }> {
    // SuperAdmin queries are global (cross-tenant); tenantId=0 means "all tenants"
    return await this.auditLogRepository.findAll(0, filter);
  }
}
