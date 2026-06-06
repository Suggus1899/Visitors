import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import IntermittentLogModel from '../../models/IntermittentLog';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IntermittentLog = IntermittentLogModel as any;

/**
 * Use Case: Intermittent Re-Entry
 * Transitions a visit from Intermittent → Active and updates the log entry.
 */
export class IntermittentReEntryUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(dto: {
    visitId: number;
    notes?: string;
    registeredBy?: string;
  }): Promise<{ visit: any; log: any; duration?: { minutes: number; seconds: number; formatted: string } }> {
    // 1. Find the visit
    const visit = await this.visitRepository.findById(dto.visitId);
    if (!visit) {
      throw new Error('Visita no encontrada');
    }

    // 2. Domain transition: Intermittent → Active
    const activeVisit = visit.reEnter();

    // 3. Find the latest IntermittentLog without re_entry
    const openLog = await IntermittentLog.findOne({
      where: {
        visit_id: visit.id!,
        re_entry: null,
      },
      order: [['check_out', 'DESC']],
    });

    if (!openLog) {
      throw new Error('No se encontró un registro de salida temporal abierto para esta visita.');
    }

    // 4. Update the log with re_entry time
    const now = new Date();
    await openLog.update({
      re_entry: now,
      registered_by: dto.registeredBy || openLog.registered_by,
    });

    // 5. Update visit status in repository
    const updatedVisit = await this.visitRepository.update(visit.id!, {
      status: activeVisit.status,
    });

    // Calcular duración del período intermitente
    const durationMs = now.getTime() - openLog.check_out.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    const durationSeconds = Math.floor((durationMs % (1000 * 60)) / 1000);

    return {
      visit: {
        id: updatedVisit.id,
        visitorCedula: updatedVisit.visitorCedula,
        status: updatedVisit.status,
      },
      log: {
        id: openLog.id,
        visit_id: openLog.visit_id,
        check_out: openLog.check_out.toISOString(),
        re_entry: now.toISOString(),
        notes: openLog.notes,
        registered_by: openLog.registered_by,
      },
      duration: {
        minutes: durationMinutes,
        seconds: durationSeconds,
        formatted: `${durationMinutes}m ${durationSeconds}s`, // Formato legible
      },
    };
  }
}
