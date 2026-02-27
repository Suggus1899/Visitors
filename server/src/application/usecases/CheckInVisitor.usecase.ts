import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { Visit, VisitStatus } from '../../domain/entities/Visit.entity';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { CheckInDto, VisitResponseDto } from '../dto/VisitDto';
import { PhotoStorage } from '../../utils/PhotoStorage';

/**
 * Use Case: Check in a visitor
 * Handles business logic for visitor check-in process
 */
export class CheckInVisitorUseCase {
  constructor(
    private visitorRepository: IVisitorRepository,
    private visitRepository: IVisitRepository
  ) {}

  async execute(dto: CheckInDto): Promise<VisitResponseDto> {
    // 1. Check if visitor exists, if not create new visitor
    let visitor = await this.visitorRepository.findByCedula(dto.visitorCedula);

    if (!visitor && dto.visitorData) {
      // Create new visitor
      let photoUrl: string | undefined;
      let idPhotoUrl: string | undefined;

      // Save photo to filesystem if provided
      if (dto.visitorData.photoBase64) {
        photoUrl = await PhotoStorage.savePhoto(
          dto.visitorData.photoBase64,
          dto.visitorCedula
        );
      }

      if (dto.visitorData.idPhotoBase64) {
        idPhotoUrl = await PhotoStorage.savePhoto(
          dto.visitorData.idPhotoBase64,
          `${dto.visitorCedula}_id`
        );
      }

      visitor = new Visitor(
        dto.visitorCedula,
        dto.visitorData.firstName,
        dto.visitorData.lastName,
        dto.visitorData.company,
        dto.visitorData.jobTitle,
        photoUrl,
        idPhotoUrl,
        undefined, // email removed
        dto.visitorData.phone
      );

      visitor = await this.visitorRepository.create(visitor);
    } else if (!visitor) {
      throw new Error('Visitor not found and no visitor data provided');
    }

    // 2. Check if visitor has an active visit
    const activeVisits = await this.visitRepository.findByVisitor(dto.visitorCedula);
    const hasActiveVisit = activeVisits.some(v => v.isActive());

    if (hasActiveVisit) {
      throw new Error('Visitor already has an active visit');
    }

    // 3. Create new visit
    const visitStatus = dto.status || VisitStatus.ACTIVE;
    const visit = new Visit(
      dto.visitorCedula,
      new Date(),
      dto.purpose,
      dto.personToVisit,
      visitStatus,
      undefined,
      undefined,
      dto.notes,
      undefined, // visitorName (inherited)
      undefined, // visitorCompany
      dto.companionName,
      dto.companionCedula,
      dto.vehicleBrand,
      dto.vehicleModel,
      dto.vehiclePlate,
      dto.area,
      dto.action,
      dto.department
    );

    const createdVisit = await this.visitRepository.create(visit);

    // 4. Return response
    return this.toResponseDto(createdVisit, visitor);
  }

  private toResponseDto(visit: Visit, visitor: Visitor): VisitResponseDto {
    return {
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName: visitor.fullName,
      checkInTime: visit.checkInTime.toISOString(),
      checkOutTime: visit.checkOutTime?.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      status: visit.status,
      durationMinutes: visit.getDurationMinutes() || undefined,
      notes: visit.notes,
      companionName: visit.companionName,
      companionCedula: visit.companionCedula,
      vehicleBrand: visit.vehicleBrand,
      vehicleModel: visit.vehicleModel,
      vehiclePlate: visit.vehiclePlate,
      area: visit.area,
      action: visit.action,
      department: visit.department
    };
  }
}
