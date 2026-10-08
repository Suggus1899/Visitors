import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IIntermittentLogRepository } from '../../domain/repositories/IIntermittentLogRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { VisitResponseDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

export class ReactivateVisitUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private intermittentLogRepository: IIntermittentLogRepository
  ) {}

  async execute(visitId: number): Promise<VisitResponseDto> {
    const visit = await this.visitRepository.findById(visitId);

    if (!visit) {
      throw new Error('Visit not found');
    }

    if (visit.status !== VisitStatus.INTERMITTENT) {
      throw new Error('Only intermittent visits can be reactivated');
    }

    const reactivatedVisit = visit.reactivate();

    const updatedVisit = await this.visitRepository.update(visitId, {
      status: reactivatedVisit.status
    });

    const reentryTime = new Date();
    const openLog = await this.intermittentLogRepository.findOpenByVisitId(visitId);
    if (openLog) {
      await this.intermittentLogRepository.closeLog(openLog.id, { reEntry: reentryTime });
    }

    return VisitMapper.toVisitResponseDto(updatedVisit);
  }
}
