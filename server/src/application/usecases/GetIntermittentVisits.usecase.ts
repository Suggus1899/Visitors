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

  async execute(): Promise<IntermittentVisitResponseDto[]> {
    const visits = await this.visitRepository.findIntermittent();

    const enriched = await Promise.all(
      visits.map(async (visit) => {
        const visitor = await this.visitorRepository.findByCedula(visit.visitorCedula);
        const logs = await this.intermittentLogRepository.findByVisitId(visit.id!);
        return VisitMapper.toIntermittentVisitDto(visit, visitor, logs);
      })
    );

    return enriched;
  }
}
