import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { ActiveVisitDto } from '../dto/VisitDto';

export class GetWaitingVisitsUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private visitorRepository: IVisitorRepository
  ) {}

  async execute(): Promise<ActiveVisitDto[]> {
    const visits = await this.visitRepository.findAll({ status: VisitStatus.WAITING });

    return visits.map(visit => ({
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName: visit.visitorName || 'Unknown',
      company: visit.visitorCompany || 'Unknown',
      checkInTime: visit.checkInTime.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      photoUrl: '', // This will be fetched via normal photo logic if needed
      notes: visit.notes,
      durationMinutes: 0 // Waiting visits have 0 active duration
    }));
  }
}
