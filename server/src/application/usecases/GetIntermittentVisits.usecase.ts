import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import IntermittentLogModel from '../../models/IntermittentLog';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IntermittentLog = IntermittentLogModel as any;

/**
 * Use Case: Get Intermittent Visits
 * Retrieves all visits currently in intermittent state with visitor info and logs.
 */
export class GetIntermittentVisitsUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private visitorRepository: IVisitorRepository
  ) {}

  async execute(): Promise<any[]> {
    const visits = await this.visitRepository.findIntermittent();

    const enriched = await Promise.all(
      visits.map(async (visit) => {
        const visitor = await this.visitorRepository.findByCedula(visit.visitorCedula);
        const logs = await IntermittentLog.findAll({
          where: { visit_id: visit.id! },
          order: [['check_out', 'DESC']],
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentLog = logs.find((l: any) => !l.re_entry);

        return {
          id: visit.id,
          visitorCedula: visit.visitorCedula,
          visitorName: visitor?.fullName || 'Desconocido',
          firstName: visitor?.firstName,
          lastName: visitor?.lastName,
          company: visitor?.company || 'Sin empresa',
          checkInTime: visit.checkInTime.toISOString(),
          purpose: visit.purpose,
          personToVisit: visit.personToVisit,
          status: visit.status,
          photoUrl: visitor?.photoUrl,
          targetDepartment: visit.targetDepartment,
          hostPerson: visit.hostPerson,
          area: visit.area,
          department: visit.department,
          intermittentSince: currentLog?.check_out?.toISOString() || null,
          intermittentNotes: currentLog?.notes || null,
          totalIntermittentEvents: logs.length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          intermittent_logs: logs.map((l: any) => ({
            id: l.id,
            visit_id: l.visit_id,
            check_out: l.check_out.toISOString(),
            re_entry: l.re_entry?.toISOString() || null,
            notes: l.notes,
            registered_by: l.registered_by,
          })),
        };
      })
    );

    return enriched;
  }
}
