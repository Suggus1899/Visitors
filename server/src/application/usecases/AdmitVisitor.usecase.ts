import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { VisitResponseDto } from '../dto/VisitDto';

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

    // Preservar arrivalTime original y solo actualizar entryTime
    const updatedVisit = await this.visitRepository.update(visitId, {
      checkInTime: admittedVisit.checkInTime,
      arrivalTime: visit.arrivalTime,  // Preservar hora original de llegada
      entryTime: now,  // Hora actual de entrada (cuando se admite)
      status: admittedVisit.status
    });

    return {
      id: updatedVisit.id!,
      visitorCedula: updatedVisit.visitorCedula,
      checkInTime: updatedVisit.checkInTime.toISOString(),
      purpose: updatedVisit.purpose,
      personToVisit: updatedVisit.personToVisit,
      status: updatedVisit.status,
      notes: updatedVisit.notes
    };
  }
}
