import { IVisitorRepository } from '../../../domain/repositories/IVisitorRepository';
import { RectifySubjectDataDto } from '../../dto/ArcoRequestDto';

export class RectifySubjectDataUseCase {
  constructor(
    private visitorRepository: IVisitorRepository
  ) { }

  async execute(dto: RectifySubjectDataDto, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<{ message: string; visitor: unknown }> {
    const visitor = await this.visitorRepository.findByCedula(dto.cedula.trim());
    if (!visitor) {
      throw new Error('NOT_FOUND');
    }

    const updates: Record<string, string | null | undefined> = {};
    if (dto.firstName !== undefined) updates.firstName = dto.firstName;
    if (dto.lastName !== undefined) updates.lastName = dto.lastName;
    if (dto.company !== undefined) updates.company = dto.company;
    if (dto.jobTitle !== undefined) updates.jobTitle = dto.jobTitle;
    if (dto.email !== undefined) updates.email = dto.email;
    if (dto.phone !== undefined) updates.phone = dto.phone;

    const updated = await this.visitorRepository.updateWithHistory(visitor.cedula, updates, { visitId: null, editedBy: actorId, editedByUsername: actorUsername });


    return { message: 'Datos rectificados correctamente', visitor: updated.toObject() };
  }
}
