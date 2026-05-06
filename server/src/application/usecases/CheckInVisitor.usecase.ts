import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { Visit, VisitStatus } from '../../domain/entities/Visit.entity';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { CheckInDto, VisitResponseDto } from '../dto/VisitDto';

/**
 * Use Case: Check in a visitor
 * Handles business logic for visitor check-in process
 */
export class CheckInVisitorUseCase {
  constructor(
    private visitorRepository: IVisitorRepository,
    private visitRepository: IVisitRepository
  ) { }

  async execute(dto: CheckInDto): Promise<VisitResponseDto> {
    if (!dto.consent?.accepted) {
      throw new Error('Consent is required before processing check-in');
    }

    const consentAuditNote = `[consent:${dto.consent.policyVersion}|${dto.consent.acceptedAt}]`;
    const mergedNotes = [dto.notes, consentAuditNote].filter(Boolean).join(' ');

    // 1. Check if visitor exists, if not create new visitor
    let visitor = await this.visitorRepository.findByCedula(dto.visitorCedula);

    if (!visitor && dto.visitorData) {
      // Create new visitor — photos stored as BYTEA in PostgreSQL
      let photoData: Buffer | undefined;
      let idPhotoData: Buffer | undefined;

      if (dto.visitorData.photoBase64) {
        const base64Clean = dto.visitorData.photoBase64.replace(/^data:image\/\w+;base64,/, '');
        photoData = Buffer.from(base64Clean, 'base64');
      }

      if (dto.visitorData.idPhotoBase64) {
        const base64Clean = dto.visitorData.idPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
        idPhotoData = Buffer.from(base64Clean, 'base64');
      }

      visitor = new Visitor(
        undefined, // id will be generated
        dto.visitorCedula,
        dto.visitorData.firstName,
        dto.visitorData.lastName,
        dto.visitorData.company,
        dto.visitorData.jobTitle,
        undefined, // photoUrl
        undefined, // idPhotoUrl
        dto.visitorData.email,
        dto.visitorData.phone,
        photoData,
        idPhotoData,
        false, // isBlocked - new visitors are not blocked
        undefined, // observations
        new Date() // createdAt
      );

      visitor = await this.visitorRepository.create(visitor, photoData, idPhotoData);
    } else if (!visitor) {
      throw new Error('Visitor not found and no visitor data provided');
    }

    // 1b. Check if visitor is blocked
    if (visitor.isBlacklisted()) {
      throw new Error(`Visitor is blocked: ${visitor.observations || 'No reason provided'}`);
    }

    // 2. Check if visitor has an active or intermittent visit
    const activeVisits = await this.visitRepository.findByVisitor(dto.visitorCedula);
    const openVisit = activeVisits.find(v => v.isActive());

    if (openVisit) {
      if (openVisit.status === VisitStatus.INTERMITTENT) {
        throw new Error('Visitor has an active intermittent visit. Use reactivate to let them back in.');
      }
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
      mergedNotes,
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
      firstName: visitor.firstName,
      lastName: visitor.lastName,
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
      action: visit.action,
      department: visit.department
    };
  }
}
