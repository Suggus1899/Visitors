import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { CheckOutDto, VisitResponseDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

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
    return VisitMapper.toVisitResponseDto(updatedVisit);
  }
}
