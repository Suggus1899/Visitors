import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { VisitorDto, VisitorWithHistoryDto } from '../dto/VisitorDto';

/**
 * Use Case: Get visitor by Cedula
 * Used to auto-fill forms and show visitor history
 */
export class GetVisitorByCedulaUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(cedula: string, includeHistory: boolean = false): Promise<VisitorDto | VisitorWithHistoryDto | null> {
    if (includeHistory) {
      const { visitor, history } = await this.visitorRepository.findByCedulaWithHistory(cedula);
      
      if (!visitor) {
        return null;
      }

      return {
        id: visitor.id,
        cedula: visitor.cedula,
        firstName: visitor.firstName,
        lastName: visitor.lastName,
        company: visitor.company,
        jobTitle: visitor.jobTitle,
        photoUrl: visitor.photoUrl,
        idPhotoUrl: visitor.idPhotoUrl,
        email: visitor.email,
        phone: visitor.phone,
        isBlocked: visitor.isBlocked,
        observations: visitor.observations,
        createdAt: visitor.createdAt,
        history: history.map((visit: any) => ({
          id: visit.id,
          purpose: visit.purpose,
          checkInTime: visit.check_in_time,
          checkOutTime: visit.check_out_time,
          status: visit.status,
          targetDepartment: visit.target_department
        }))
      };
    }

    const visitor = await this.visitorRepository.findByCedula(cedula);
    
    if (!visitor) {
      return null;
    }

    return {
      id: visitor.id,
      cedula: visitor.cedula,
      firstName: visitor.firstName,
      lastName: visitor.lastName,
      company: visitor.company,
      jobTitle: visitor.jobTitle,
      photoUrl: visitor.photoUrl,
      idPhotoUrl: visitor.idPhotoUrl,
      email: visitor.email,
      phone: visitor.phone,
      isBlocked: visitor.isBlocked,
      observations: visitor.observations,
      createdAt: visitor.createdAt
    };
  }
}
