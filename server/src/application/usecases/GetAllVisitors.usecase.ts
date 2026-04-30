import { IVisitorRepository, VisitorFilters } from '../../domain/repositories/IVisitorRepository';
import { VisitorDto } from '../dto/VisitorDto';

/**
 * Use Case: Get All Visitors
 * Used for admin view with pagination and filters
 */
export class GetAllVisitorsUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(filters?: VisitorFilters): Promise<{ visitors: VisitorDto[]; total: number }> {
    const [visitors, total] = await Promise.all([
      this.visitorRepository.findAll(filters),
      this.visitorRepository.count(filters)
    ]);

    const visitorDtos = visitors.map(visitor => ({
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
    }));

    return { visitors: visitorDtos, total };
  }
}
