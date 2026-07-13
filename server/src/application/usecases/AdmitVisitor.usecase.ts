import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { VisitResponseDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

export class AdmitVisitorUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(visitId: number): Promise<VisitResponseDto> {
    const visit = await this.visitRepository.findById(visitId);

    if (!visit) {
      throw new Error('Visit not found');
    }

    if (visit.status !== VisitStatus.WAITING) {
      throw new Error('Only visits in waiting status can be admitted');
    }

    const now = new Date();
    const admittedVisit = visit.admit(now);

    // Preservar arrivalTime original y checkInTime, solo actualizar entryTime
    const updatedVisit = await this.visitRepository.update(visitId, {
      checkInTime: visit.checkInTime,  // Preservar hora original de check-in
      arrivalTime: visit.arrivalTime,  // Preservar hora original de llegada
      entryTime: now,                  // Hora actual de entrada (cuando se admite)
      status: admittedVisit.status
    });

    return VisitMapper.toVisitResponseDto(updatedVisit);
  }
}
