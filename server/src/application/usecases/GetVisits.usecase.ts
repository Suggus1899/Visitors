import { IVisitRepository, VisitFilters } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { VisitResponseDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

/**
 * Use Case: Get visits with filters
 * Used for the main dashboard table
 */
export class GetVisitsUseCase {
  constructor(private visitRepository: IVisitRepository, private visitorRepository: IVisitorRepository) {}

  async execute(filters: VisitFilters): Promise<{ visits: VisitResponseDto[], total: number }> {
    const visits = await this.visitRepository.findAll(filters);
    const total = await this.visitRepository.count(filters);

    const visitDtos = await Promise.all(visits.map(async visit => VisitMapper.toVisitResponseDto(visit, visit.anonymized ? null : await this.visitorRepository.findByCedula(visit.visitorCedula))));

    return {
      visits: visitDtos,
      total
    };
  }
}
