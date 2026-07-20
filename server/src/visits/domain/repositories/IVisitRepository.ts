import { Visit, VisitEntity, VisitStatus } from '../entities/Visit.entity';

/**
 * Repository interface for Visit
 * Defines contract without implementation details
 */
export interface IVisitRepository {
  /**
   * Find visit by ID
   */
  findById(tenantId: number, id: number): Promise<Visit | null>;

  /**
   * Find all visits with optional filters
   */
  findAll(tenantId: number, filters?: VisitFilters): Promise<Visit[]>;

  /**
   * Find active visits (not checked out)
   */
  findActive(tenantId: number): Promise<Visit[]>;

  /**
   * Find intermittent visits (temporarily outside)
   */
  findIntermittent(tenantId: number): Promise<Visit[]>;

  /**
   * Find visits by visitor cedula
   */
  findByVisitor(tenantId: number, visitorCedula: string): Promise<Visit[]>;

  /**
   * Find visits by date range
   */
  findByDateRange(tenantId: number, startDate: Date, endDate: Date): Promise<Visit[]>;

  /**
   * Create new visit (check-in)
   */
  create(tenantId: number, visit: Visit): Promise<Visit>;

  /**
   * Update a visit
   * @param id - Visit ID
   * @param data - Partial visit data to update
   * @returns Promise of the updated visit
   */
  update(tenantId: number, id: number, data: {
    checkInTime?: Date;
    checkOutTime?: Date;
    arrivalTime?: Date;  // Hora de llegada original (no se modifica, solo se preserva)
    entryTime?: Date;
    exitTime?: Date;
    status?: VisitStatus;
    notes?: string;
  }): Promise<Visit>;

  /**
   * Delete visit
   */
  delete(tenantId: number, id: number): Promise<void>;

  /**
   * Get total count of visits
   */
  count(tenantId: number, filters?: VisitFilters): Promise<number>;

  /**
   * Delete old visits (for GDPR compliance)
   */
  deleteOlderThan(tenantId: number, date: Date): Promise<number>;

  /**
   * Statistics methods
   */
  countByStatus(tenantId: number, status: VisitStatus): Promise<number>;
  
  countByDateRange(tenantId: number, startDate: Date, endDate: Date): Promise<number>;
  
  /**
   * Get raw visits for reporting (optimized for fetching large datasets)
   */
  /**
   * Find visits for report (raw data)
   */
  findForReport(tenantId: number, startDate: Date, endDate: Date): Promise<Visit[]>;

  /**
   * Find active visits that should have checked out (older than threshold)
   */
  findMissedCheckouts(tenantId: number, thresholdDate: Date): Promise<Visit[]>;

  /**
   * Count visits in a specific date range
   */
  countByDateRange(tenantId: number, startDate: Date, endDate: Date): Promise<number>;

  /**
   * Find all intermittent visits (visitor temporarily outside)
   */
  findIntermittent(tenantId: number): Promise<Visit[]>;
}

/**
 * Filters for querying visits
 */
export interface VisitFilters {
  status?: VisitStatus;
  visitorCedula?: string;
  personToVisit?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}
