import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { Visit, VisitStatus } from '../../domain/entities/Visit.entity';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { CheckInDto, VisitResponseDto } from '../dto/VisitDto';
import { VisitMapper } from '../mappers/VisitMapper';

/**
 * Use Case: Check in a visitor
 * Handles business logic for visitor check-in process
 */
export class CheckInVisitorUseCase {
  constructor(
    private visitorRepository: IVisitorRepository,
    private visitRepository: IVisitRepository
  ) { }

  async execute(tenantId: number, dto: CheckInDto): Promise<VisitResponseDto> {
    if (!dto.consent?.accepted) {
      throw new Error('Consent is required before processing check-in');
    }

    const consentAuditNote = `[consent:${dto.consent.policyVersion}|${dto.consent.acceptedAt}]`;
    const mergedNotes = [dto.notes, consentAuditNote].filter(Boolean).join(' ');

    // 1. Check if visitor exists, if not create new visitor
    let visitor = await this.visitorRepository.findByCedula(tenantId, dto.visitorCedula);

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

      visitor = await this.visitorRepository.create(tenantId, visitor, photoData, idPhotoData);
    } else if (visitor && dto.visitorData) {
      const updateData: any = {};
      if (dto.visitorData.photoBase64?.startsWith('data:')) {
        const base64Clean = dto.visitorData.photoBase64.replace(/^data:image\/\w+;base64,/, '');
        updateData.photoBlob = Buffer.from(base64Clean, 'base64');
      }
      if (dto.visitorData.idPhotoBase64?.startsWith('data:')) {
        const base64Clean = dto.visitorData.idPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
        updateData.idPhotoBlob = Buffer.from(base64Clean, 'base64');
      }
      if (updateData.photoBlob || updateData.idPhotoBlob) {
        await this.visitorRepository.update(tenantId, dto.visitorCedula, updateData);
      }
    } else if (!visitor) {
      throw new Error('Visitor not found and no visitor data provided');
    }

    // 1b. Check if visitor is blocked
    if (visitor.isBlacklisted()) {
      throw new Error(`Visitor is blocked: ${visitor.observations || 'No reason provided'}`);
    }

    // 2. Check if visitor already has an open visit (active, intermittent, or waiting)
    const existingVisits = await this.visitRepository.findByVisitor(tenantId, dto.visitorCedula);
    const openVisit = existingVisits.find(v => v.isActive() || v.status === VisitStatus.WAITING);

    if (openVisit) {
      const statusLabel: Record<string, string> = {
        active: 'ACTIVA',
        waiting: 'EN ESPERA',
        intermittent: 'SALIDA TEMPORAL',
      };
      const label = statusLabel[openVisit.status] || openVisit.status;
      const time = openVisit.checkInTime.toISOString().replace('T', ' ').substring(0, 19);

      if (openVisit.status === VisitStatus.INTERMITTENT) {
        throw new Error(
          `El visitante ya tiene una visita en estado ${label} (#${openVisit.id} desde ${time}). ` +
          `Use la opción "Reactivar" para permitir el reingreso.`
        );
      }

      throw new Error(
        `El visitante ya tiene una visita en estado ${label} (#${openVisit.id} desde ${time}). ` +
        `No puede registrar otra visita hasta que la actual sea finalizada.`
      );
    }

    // 3. Create new visit
    const visitStatus = dto.status || VisitStatus.ACTIVE;
    const now = new Date();
    const entryTime = visitStatus === VisitStatus.ACTIVE ? now : undefined;
    const visit = new Visit(
      dto.visitorCedula,
      now,
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
      dto.department,
      now,         // arrivalTime - siempre la hora actual de registro
      entryTime,   // entryTime - solo si es active directo
    );

    const createdVisit = await this.visitRepository.create(tenantId, visit);

    // 4. Return response
    return VisitMapper.toVisitResponseDto(createdVisit, visitor);
  }
}
