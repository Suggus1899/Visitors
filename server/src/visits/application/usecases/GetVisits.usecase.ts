import { IVisitRepository, VisitFilters } from '../../domain/repositories/IVisitRepository';
import { VisitResponseDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

/**
 * Use Case: Get visits with filters
 * Used for the main dashboard table
 */
export class GetVisitsUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(tenantId: number, filters: VisitFilters): Promise<{ visits: VisitResponseDto[], total: number }> {
    const visits = await this.visitRepository.findAll(tenantId, filters);
    const total = await this.visitRepository.count(tenantId, filters);

    const visitDtos = visits.map(visit => VisitMapper.toVisitResponseDto(visit));

    return {
      visits: visitDtos,
      total
    };
  }
}
