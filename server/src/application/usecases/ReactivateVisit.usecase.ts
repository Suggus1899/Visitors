import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { IVisitIntervalRepository } from '../../domain/repositories/IVisitIntervalRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { VisitResponseDto } from '../dto/VisitDto';

export class ReactivateVisitUseCase {
  constructor(
    private visitRepository: IVisitRepository,
    private visitIntervalRepository: IVisitIntervalRepository
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
    const openInterval = await this.visitIntervalRepository.findOpenByVisit(visitId);
    if (openInterval && openInterval.id) {
      await this.visitIntervalRepository.closeInterval(openInterval.id, reentryTime);
    }

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
