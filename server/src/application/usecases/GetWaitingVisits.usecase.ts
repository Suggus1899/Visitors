import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { ActiveVisitDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

export class GetWaitingVisitsUseCase {
  constructor(
    private visitRepository: IVisitRepository
  ) {}

  async execute(): Promise<ActiveVisitDto[]> {
    const visits = await this.visitRepository.findAll({ status: VisitStatus.WAITING });

    return visits.map(visit => VisitMapper.toWaitingVisitDto(visit));
  }
}
