import { Visitor, VisitorEntity } from '../entities/Visitor.entity';

/**
 * Repository interface for Visitor
 * Defines contract without implementation details
 */
export interface IVisitorRepository {
  /**
   * Find visitor by cedula (primary key)
   */
  findByCedula(cedula: string): Promise<Visitor | null>;

  /**
   * Find all visitors with optional filters
   */
  findAll(filters?: VisitorFilters): Promise<Visitor[]>;

  /**
   * Search visitors by name or company
   */
  search(query: string): Promise<Visitor[]>;

  /**
   * Get distinct companies for autocomplete
   */
  findDistinctCompanies(query?: string): Promise<string[]>;

  /**
   * Create new visitor
   */
  create(visitor: Visitor, photoData?: Buffer, idPhotoData?: Buffer): Promise<Visitor>;

  /**
   * Update existing visitor
   */
  update(cedula: string, visitor: Partial<VisitorEntity>): Promise<Visitor>;

  /**
   * Delete visitor (soft delete for GDPR compliance)
   */
  delete(cedula: string): Promise<void>;

  /**
   * Check if visitor exists
   */
  exists(cedula: string): Promise<boolean>;

  /**
   * Get total count of visitors
   */
  count(filters?: VisitorFilters): Promise<number>;
}

/**
 * Filters for querying visitors
 */
export interface VisitorFilters {
  company?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  page?: number;
  limit?: number;
}

