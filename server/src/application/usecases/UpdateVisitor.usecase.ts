import { IVisitorRepository, VisitorEditContext } from '../../domain/repositories/IVisitorRepository';
import { VisitorEntity } from '../../domain/entities/Visitor.entity';
import { VisitorDto } from '../dto/VisitorDto';
import { VisitorMapper } from '../mappers/VisitorMapper';

export type EditContext = VisitorEditContext;

export class UpdateVisitorUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(cedula: string, data: Partial<VisitorEntity>, actor: EditContext): Promise<VisitorDto> {
    if (!actor?.editedBy || !actor.editedByUsername) throw new Error('Actor is required');
    return VisitorMapper.toVisitorDto(await this.visitorRepository.updateWithHistory(cedula, data, actor));
  }
}
