import { Visitor, VisitorEntity } from '../entities/Visitor.entity';
import { VisitEntity } from '../entities/Visit.entity';

/**
 * Repository interface for Visitor
 * Defines contract without implementation details
 */
export interface IVisitorRepository {
  /**
   * Find visitor by cedula
   */
  findByCedula(tenantId: number, cedula: string): Promise<Visitor | null>;

  /**
   * Find visitor by ID
   */
  findById(tenantId: number, id: number): Promise<Visitor | null>;

  /**
   * Find visitor by cedula with visit history
   */
  findByCedulaWithHistory(tenantId: number, cedula: string, historyLimit?: number): Promise<{ visitor: Visitor | null; history: VisitEntity[] }>;

  /**
   * Find all visitors with optional filters
   */
  findAll(tenantId: number, filters?: VisitorFilters): Promise<Visitor[]>;

  /**
   * Search visitors by name or company
   */
  search(tenantId: number, query: string): Promise<Visitor[]>;

  /**
   * Get distinct companies for autocomplete
   */
  findDistinctCompanies(tenantId: number, query?: string): Promise<string[]>;

  /**
   * Create new visitor
   */
  create(tenantId: number, visitor: Visitor, photoData?: Buffer, idPhotoData?: Buffer): Promise<Visitor>;

  /**
   * Update existing visitor by cedula
   */
  update(tenantId: number, cedula: string, visitor: Partial<VisitorEntity>): Promise<Visitor>;

  /**
   * Update existing visitor by ID
   */
  updateById(tenantId: number, id: number, visitor: Partial<VisitorEntity>): Promise<Visitor>;

  /**
   * Delete visitor by cedula
   */
  delete(tenantId: number, cedula: string): Promise<void>;

  /**
   * Delete visitor by ID
   */
  deleteById(tenantId: number, id: number): Promise<void>;

  /**
   * Check if visitor exists
   */
  exists(tenantId: number, cedula: string): Promise<boolean>;

  /**
   * Get total count of visitors
   */
  count(tenantId: number, filters?: VisitorFilters): Promise<number>;

  getPhotoBlob(tenantId: number, cedula: string): Promise<Buffer | null>;
  getIdPhotoBlob(tenantId: number, cedula: string): Promise<Buffer | null>;
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

