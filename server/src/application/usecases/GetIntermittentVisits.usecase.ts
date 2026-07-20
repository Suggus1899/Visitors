import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { IIntermittentLogRepository } from '../../domain/repositories/IIntermittentLogRepository';
import { VisitMapper, IntermittentVisitResponseDto } from '../mappers/VisitMapper';

/**
 * Use Case: Get Intermittent Visits
 * Retrieves all visits currently in intermittent state with visitor info and logs.
 */
export class GetIntermittentVisitsUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private visitorRepository: IVisitorRepository,
    private intermittentLogRepository: IIntermittentLogRepository
  ) {}

  async execute(tenantId: number): Promise<IntermittentVisitResponseDto[]> {
    const visits = await this.visitRepository.findIntermittent(tenantId);

    const enriched = await Promise.all(
      visits.map(async (visit) => {
        const visitor = await this.visitorRepository.findByCedula(tenantId, visit.visitorCedula);
        const logs = await this.intermittentLogRepository.findByVisitId(tenantId, visit.id!);
        return VisitMapper.toIntermittentVisitDto(visit, visitor, logs);
      })
    );

    return enriched;
  }
}
