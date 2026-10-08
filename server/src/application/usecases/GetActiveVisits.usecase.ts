import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { ActiveVisitDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

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
        return VisitMapper.toActiveVisitDto(visit, visitor);
      })
    );

    return visitsWithVisitors;
  }
}
