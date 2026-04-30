import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitIntervalRepository } from '../../domain/repositories/IVisitIntervalRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { VisitInterval } from '../../domain/entities/VisitInterval.entity';
import { VisitResponseDto } from '../dto/VisitDto';

export class GoIntermittentUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private visitIntervalRepository: IVisitIntervalRepository
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
    await this.visitIntervalRepository.create(
      new VisitInterval(visitId, exitTime, undefined, undefined, notes)
    );

    return {
      id: updatedVisit.id!,
      visitorCedula: updatedVisit.visitorCedula,
      visitorName: updatedVisit.visitorName,
      firstName: updatedVisit.visitorName?.split(' ')[0],
      lastName: updatedVisit.visitorName?.split(' ').slice(1).join(' '),
      checkInTime: updatedVisit.checkInTime.toISOString(),
      checkOutTime: updatedVisit.checkOutTime?.toISOString(),
      purpose: updatedVisit.purpose,
      personToVisit: updatedVisit.personToVisit,
      status: updatedVisit.status,
      durationMinutes: updatedVisit.getDurationMinutes() || undefined,
      notes: updatedVisit.notes,
      companionName: updatedVisit.companionName,
      companionCedula: updatedVisit.companionCedula,
      vehicleBrand: updatedVisit.vehicleBrand,
      vehicleModel: updatedVisit.vehicleModel,
      vehiclePlate: updatedVisit.vehiclePlate,
      area: updatedVisit.area,
      action: updatedVisit.action,
      department: updatedVisit.department
    };
  }
}
