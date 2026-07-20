import { IVisitorRepository, VisitorFilters } from '../../domain/repositories/IVisitorRepository';
import { VisitorDto } from '../dto/VisitorDto';
import { VisitorMapper } from '../mappers/VisitorMapper';

/**
 * Use Case: Get All Visitors
 * Used for admin view with pagination and filters
 */
export class GetAllVisitorsUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(tenantId: number, filters?: VisitorFilters): Promise<{ visitors: VisitorDto[]; total: number }> {
    const [visitors, total] = await Promise.all([
      this.visitorRepository.findAll(tenantId, filters),
      this.visitorRepository.count(tenantId, filters)
    ]);

    const visitorDtos = visitors.map(visitor => VisitorMapper.toVisitorListDto(visitor));

    return { visitors: visitorDtos, total };
  }
}
