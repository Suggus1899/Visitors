import { Visitor, VisitorEntity } from '../entities/Visitor.entity';

/**
 * Repository interface for Visitor
 * Defines contract without implementation details
 */
export interface IVisitorRepository {
  /**
   * Find visitor by cedula
   */
  findByCedula(cedula: string): Promise<Visitor | null>;

  /**
   * Find visitor by ID
   */
  findById(id: number): Promise<Visitor | null>;

  /**
   * Find visitor by cedula with visit history
   */
  findByCedulaWithHistory(cedula: string, historyLimit?: number): Promise<{ visitor: Visitor | null; history: any[] }>;

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
  create(visitor: Visitor): Promise<Visitor>;

  /**
   * Update existing visitor by cedula
   */
  update(cedula: string, visitor: Partial<VisitorEntity>): Promise<Visitor>;

  /**
   * Update existing visitor by ID
   */
  updateById(id: number, visitor: Partial<VisitorEntity>): Promise<Visitor>;

  /**
   * Delete visitor by cedula
   */
  delete(cedula: string): Promise<void>;

  /**
   * Delete visitor by ID
   */
  deleteById(id: number): Promise<void>;

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

