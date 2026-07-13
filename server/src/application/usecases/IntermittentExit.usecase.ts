import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IIntermittentLogRepository } from '../../domain/repositories/IIntermittentLogRepository';

/**
 * Use Case: Intermittent Exit
 * Transitions a visit from Active → Intermittent and creates a log entry.
 */
export class IntermittentExitUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private intermittentLogRepository: IIntermittentLogRepository
  ) {}

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
    const log = await this.intermittentLogRepository.create({
      visitId: visit.id!,
      checkOut: new Date(),
      notes: dto.notes || null,
      registeredBy: dto.registeredBy || null,
    });

    return {
      visit: {
        id: updatedVisit.id,
        visitorCedula: updatedVisit.visitorCedula,
        status: updatedVisit.status,
      },
      log: {
        id: log.id,
        visit_id: log.visitId,
        check_out: log.checkOut.toISOString(),
        notes: log.notes,
        registered_by: log.registeredBy,
      },
      intermittentStartTime: log.checkOut.toISOString(), // Tiempo de inicio para el contador UI
    };
  }
}
