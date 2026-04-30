import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitIntervalRepository } from '../../domain/repositories/IVisitIntervalRepository';
import { IntermittentVisitDto } from '../dto/VisitDto';

export class GetIntermittentVisitsUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private visitIntervalRepository: IVisitIntervalRepository
  ) {}

  async execute(): Promise<IntermittentVisitDto[]> {
    const visits = await this.visitRepository.findIntermittent();

    const results: IntermittentVisitDto[] = [];

    for (const visit of visits) {
      const intervals = await this.visitIntervalRepository.findByVisit(visit.id!);
      const lastOpenInterval = intervals.find(i => i.isOpen());

      results.push({
        id: visit.id!,
        visitorCedula: visit.visitorCedula,
        visitorName: visit.visitorName || 'Unknown',
        firstName: visit.visitorName?.split(' ')[0],
        lastName: visit.visitorName?.split(' ').slice(1).join(' '),
        company: visit.visitorCompany || 'Unknown',
        checkInTime: visit.checkInTime.toISOString(),
        purpose: visit.purpose,
        personToVisit: visit.personToVisit,
        durationMinutes: 0,
        lastExitTime: lastOpenInterval?.exitTime.toISOString() || new Date().toISOString(),
        minutesOutside: lastOpenInterval
          ? Math.floor((Date.now() - lastOpenInterval.exitTime.getTime()) / 60000)
          : 0,
        intervals: intervals.map(i => ({
          id: i.id,
          exitTime: i.exitTime.toISOString(),
          reentryTime: i.reentryTime?.toISOString(),
          notes: i.notes
        })),
        notes: visit.notes
      });
    }

    return results;
  }
}
