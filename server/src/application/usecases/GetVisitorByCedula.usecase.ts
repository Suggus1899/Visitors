import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { VisitorDto, VisitorWithHistoryDto } from '../dto/VisitorDto';
import { VisitorMapper } from '../mappers/VisitorMapper';

/**
 * Use Case: Get visitor by Cedula
 * Used to auto-fill forms and show visitor history
 */
export class GetVisitorByCedulaUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(tenantId: number, cedula: string, includeHistory: boolean = false): Promise<VisitorDto | VisitorWithHistoryDto | null> {
    if (includeHistory) {
      const { visitor, history } = await this.visitorRepository.findByCedulaWithHistory(tenantId, cedula);

      if (!visitor) {
        return null;
      }

      return VisitorMapper.toVisitorWithHistoryDto(visitor, history);
    }

    const visitor = await this.visitorRepository.findByCedula(tenantId, cedula);

    if (!visitor) {
      return null;
    }

    return VisitorMapper.toVisitorDto(visitor);
  }
}
