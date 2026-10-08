import { IVisitorRepository } from '../../../domain/repositories/IVisitorRepository';

export class CancelSubjectDataUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(cedula: string, actorId: number, actorUsername: string, ip?: string, userAgent?: string): Promise<{ message: string }> {
    await this.visitorRepository.anonymize(cedula.trim(), { visitId: null, editedBy: actorId, editedByUsername: actorUsername }, ip, userAgent);
    return { message: 'Datos del titular anonimizados correctamente' };
  }
}
