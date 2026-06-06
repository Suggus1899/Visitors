import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { VisitorDto, VisitorInputDto } from '../dto/VisitorDto';

/**
 * Use Case: Update Visitor
 * Used to edit visitor data and manage blacklist status
 */
export class UpdateVisitorUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(cedula: string, data: VisitorInputDto): Promise<VisitorDto> {
    // Check if visitor exists
    const existingVisitor = await this.visitorRepository.findByCedula(cedula);
    
    if (!existingVisitor) {
      throw new Error('Visitor not found');
    }

    // Update visitor
    const updatedVisitor = await this.visitorRepository.update(cedula, {
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      jobTitle: data.jobTitle,
      email: data.email,
      phone: data.phone,
      isBlocked: data.isBlocked,
      observations: data.observations,
      photoBlob: data.photoBlob,
      idPhotoBlob: data.idPhotoBlob,
    });

    return {
      id: updatedVisitor.id,
      cedula: updatedVisitor.cedula,
      firstName: updatedVisitor.firstName,
      lastName: updatedVisitor.lastName,
      company: updatedVisitor.company,
      jobTitle: updatedVisitor.jobTitle,
      photoUrl: updatedVisitor.photoUrl,
      idPhotoUrl: updatedVisitor.idPhotoUrl,
      email: updatedVisitor.email,
      phone: updatedVisitor.phone,
      isBlocked: updatedVisitor.isBlocked,
      observations: updatedVisitor.observations,
      createdAt: updatedVisitor.createdAt
    };
  }
}
