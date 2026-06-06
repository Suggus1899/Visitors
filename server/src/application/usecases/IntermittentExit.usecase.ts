import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import IntermittentLogModel from '../../models/IntermittentLog';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IntermittentLog = IntermittentLogModel as any;

/**
 * Use Case: Intermittent Exit
 * Transitions a visit from Active → Intermittent and creates a log entry.
 */
export class IntermittentExitUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(dto: {
    visitId: number;
    notes?: string;
    registeredBy?: string;
  }): Promise<{ visit: any; log: any; intermittentStartTime?: string }> {
    // 1. Find the visit
    const visit = await this.visitRepository.findById(dto.visitId);
    if (!visit) {
      throw new Error('Visita no encontrada');
    }

    // 2. Domain transition: Active → Intermittent
    const intermittentVisit = visit.toIntermittent();

    // 3. Update visit status in repository
    const updatedVisit = await this.visitRepository.update(visit.id!, {
      status: intermittentVisit.status,
    });

    // 4. Create IntermittentLog entry
    const log = await IntermittentLog.create({
      visit_id: visit.id!,
      check_out: new Date(),
      notes: dto.notes || null,
      registered_by: dto.registeredBy || null,
    });

    return {
      visit: {
        id: updatedVisit.id,
        visitorCedula: updatedVisit.visitorCedula,
        status: updatedVisit.status,
      },
      log: {
        id: log.id,
        visit_id: log.visit_id,
        check_out: log.check_out.toISOString(),
        notes: log.notes,
        registered_by: log.registered_by,
      },
      intermittentStartTime: log.check_out.toISOString(), // Tiempo de inicio para el contador UI
    };
  }
}
