import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { Visit } from '../../domain/entities/Visit.entity';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { ActiveVisitDto } from '../dto/VisitDto';

/**
 * Use Case: Get active visits
 * Retrieves all currently active visits with visitor information
 */
export class GetActiveVisitsUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private visitorRepository: IVisitorRepository
  ) {}

  async execute(): Promise<ActiveVisitDto[]> {
    // 1. Get all active visits
    const activeVisits = await this.visitRepository.findActive();

    // 2. Get visitor information for each visit
    const visitsWithVisitors = await Promise.all(
      activeVisits.map(async (visit) => {
        const visitor = await this.visitorRepository.findByCedula(visit.visitorCedula);
        return this.toDto(visit, visitor);
      })
    );

    return visitsWithVisitors;
  }

  private toDto(visit: Visit, visitor: Visitor | null): ActiveVisitDto {
    return {
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName: visitor?.fullName || 'Unknown',
      company: visitor?.company || 'Unknown',
      checkInTime: visit.checkInTime.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      durationMinutes: visit.getDurationMinutes() || 0,
      photoUrl: visitor?.photoUrl,
      entryTime: visit.entryTime?.toISOString()
    };
  }
}
