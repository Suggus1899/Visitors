import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { VisitorDto } from '../dto/VisitorDto';

/**
 * Use Case: Get companies list
 * Used for autocomplete in frontend
 */
export class GetCompaniesUseCase {
  constructor(private visitorRepository: IVisitorRepository) {}

  async execute(query?: string): Promise<string[]> {
    return await this.visitorRepository.findDistinctCompanies(query);
  }
}
