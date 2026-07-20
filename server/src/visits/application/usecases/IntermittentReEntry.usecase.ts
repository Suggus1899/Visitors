import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IIntermittentLogRepository } from '../../domain/repositories/IIntermittentLogRepository';

/**
 * Use Case: Intermittent Re-Entry
 * Transitions a visit from Intermittent → Active and updates the log entry.
 */
export class IntermittentReEntryUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private intermittentLogRepository: IIntermittentLogRepository
  ) {}

  async execute(tenantId: number, dto: {
    visitId: number;
    notes?: string;
    registeredBy?: string;
  }): Promise<{ visit: any; log: any; duration?: { minutes: number; seconds: number; formatted: string } }> {
    // 1. Find the visit
    const visit = await this.visitRepository.findById(tenantId, dto.visitId);
    if (!visit) {
      throw new Error('Visita no encontrada');
    }

    // 2. Domain transition: Intermittent → Active
    const activeVisit = visit.reEnter();

    // 3. Find the latest IntermittentLog without re_entry
    const openLog = await this.intermittentLogRepository.findOpenByVisitId(tenantId, visit.id!);

    if (!openLog) {
      throw new Error('No se encontró un registro de salida temporal abierto para esta visita.');
    }

    // 4. Update the log with re_entry time
    const now = new Date();
    const closedLog = await this.intermittentLogRepository.closeLog(tenantId, openLog.id, {
      reEntry: now,
      registeredBy: dto.registeredBy || openLog.registeredBy,
    });

    // 5. Update visit status in repository
    const updatedVisit = await this.visitRepository.update(tenantId, visit.id!, {
      status: activeVisit.status,
    });

    // Calcular duración del período intermitente
    const durationMs = now.getTime() - closedLog.checkOut.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    const durationSeconds = Math.floor((durationMs % (1000 * 60)) / 1000);

    return {
      visit: {
        id: updatedVisit.id,
        visitorCedula: updatedVisit.visitorCedula,
        status: updatedVisit.status,
      },
      log: {
        id: closedLog.id,
        visit_id: closedLog.visitId,
        check_out: closedLog.checkOut.toISOString(),
        re_entry: now.toISOString(),
        notes: closedLog.notes,
        registered_by: closedLog.registeredBy,
      },
      duration: {
        minutes: durationMinutes,
        seconds: durationSeconds,
        formatted: `${durationMinutes}m ${durationSeconds}s`, // Formato legible
      },
    };
  }
}
