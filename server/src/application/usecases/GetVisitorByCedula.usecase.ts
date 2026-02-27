import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { VisitorDto } from '../dto/VisitorDto';

/**
 * Use Case: Get visitor by Cedula
 * Used to auto-fill forms
 */
export class GetVisitorByCedulaUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(cedula: string): Promise<VisitorDto | null> {
    const visitor = await this.visitorRepository.findByCedula(cedula);
    
    if (!visitor) {
      return null;
    }

    // Map entity to DTO (simple mapping)
    // In a real app we might use a mapper class
    return {
      cedula: visitor.cedula,
      firstName: visitor.firstName,
      lastName: visitor.lastName,
      company: visitor.company,
      jobTitle: visitor.jobTitle,
      photoUrl: visitor.photoUrl,
      email: visitor.email,
      phone: visitor.phone
    };
  }
}
