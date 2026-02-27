import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { Visit } from '../../domain/entities/Visit.entity';
import { CheckOutDto, VisitResponseDto } from '../dto/VisitDto';

/**
 * Use Case: Check out a visitor
 * Handles business logic for visitor check-out process
 */
export class CheckOutVisitorUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(dto: CheckOutDto): Promise<VisitResponseDto> {
    // 1. Find the visit
    const visit = await this.visitRepository.findById(dto.visitId);

    if (!visit) {
      throw new Error('Visit not found');
    }

    // 2. Validate and checkout - creates a NEW visit object
    const checkedOutVisit = visit.checkout(new Date(), dto.notes);

    // 3. Update in repository with the checked out visit data
    const updatedVisit = await this.visitRepository.update(visit.id!, {
      checkOutTime: checkedOutVisit.checkOutTime,
      status: checkedOutVisit.status,
      notes: checkedOutVisit.notes
    });

    // 4. Return response
    return this.toResponseDto(updatedVisit);
  }

  private toResponseDto(visit: Visit): VisitResponseDto {
    return {
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      checkInTime: visit.checkInTime.toISOString(),
      checkOutTime: visit.checkOutTime?.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      status: visit.status,
      durationMinutes: visit.getDurationMinutes() || undefined,
      notes: visit.notes
    };
  }
}
