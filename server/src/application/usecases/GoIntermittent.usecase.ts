import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IIntermittentLogRepository } from '../../domain/repositories/IIntermittentLogRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { VisitResponseDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

export class GoIntermittentUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private intermittentLogRepository: IIntermittentLogRepository
  ) {}

  async execute(visitId: number, notes?: string): Promise<VisitResponseDto> {
    const visit = await this.visitRepository.findById(visitId);

    if (!visit) {
      throw new Error('Visit not found');
    }

    if (visit.status !== VisitStatus.ACTIVE) {
      throw new Error('Only active visits can be marked as intermittent');
    }

    const intermittentVisit = visit.goIntermittent();

    const updatedVisit = await this.visitRepository.update(visitId, {
      status: intermittentVisit.status
    });

    const exitTime = new Date();
    await this.intermittentLogRepository.create({
      visitId,
      checkOut: exitTime,
      notes: notes || null,
    });

    return VisitMapper.toVisitResponseDto(updatedVisit);
  }
}
