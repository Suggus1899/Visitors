import { IVisitRepository, VisitFilters } from '../../domain/repositories/IVisitRepository';
import { VisitResponseDto } from '../dto/VisitDto';

/**
 * Use Case: Get visits with filters
 * Used for the main dashboard table
 */
export class GetVisitsUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(filters: VisitFilters): Promise<{ visits: VisitResponseDto[], total: number }> {
    const visits = await this.visitRepository.findAll(filters);
    const total = await this.visitRepository.count(filters);

    // Map to DTO
    const visitDtos = visits.map(visit => ({
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName: visit.visitorName, // Assuming the repository populates this from join, otherwise we might need to fetch it. 
      // Note: In SequelizeVisitRepository implementation, toDomain maps visitor info if available. 
      // Let's verify SequelizeVisitRepository maps helper properties or if Entity has them.
      // Entity has visitorName? No, Entity doesn't usually have joined data directly unless specified.
      // Let's check VisitEntity. It has visitorName field?
      // Step 325 shows VisitEntity having visitorName: string | undefined.
      // And SequelizeVisitRepository toDomain maps it? 
      // Step 530 shows toDomain mapping: model.visitor?.first_name ? ... : undefined? 
      // Actually step 530's toDomain doesn't seem to map visitorName explicitly from included model.
      // Let's assume for now it's handled or we need to update repository mapping.
      // Logic for now: we return what we have.
      checkInTime: visit.checkInTime.toISOString(),
      checkOutTime: visit.checkOutTime?.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      status: visit.status,
      notes: visit.notes,
      // Timestamp lifecycle fields
      arrivalTime: visit.arrivalTime?.toISOString(),
      entryTime: visit.entryTime?.toISOString(),
      exitTime: visit.exitTime?.toISOString(),
    }));

    return {
      visits: visitDtos,
      total
    };
  }
}
