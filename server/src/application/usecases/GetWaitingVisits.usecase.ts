import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { ActiveVisitDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

export class GetWaitingVisitsUseCase {
  constructor(
    private visitRepository: IVisitRepository, private visitorRepository: IVisitorRepository
  ) {}

  async execute(): Promise<ActiveVisitDto[]> {
    const visits = await this.visitRepository.findAll({ status: VisitStatus.WAITING });

    return Promise.all(visits.map(async visit => VisitMapper.toWaitingVisitDto(visit, await this.visitorRepository.findByCedula(visit.visitorCedula))));
  }
}
