import { Visit, VisitEntity, VisitStatus } from '../entities/Visit.entity';

/**
 * Repository interface for Visit
 * Defines contract without implementation details
 */
export interface IVisitRepository {
  /**
   * Find visit by ID
   */
  findById(id: number): Promise<Visit | null>;

  /**
   * Find all visits with optional filters
   */
  findAll(filters?: VisitFilters): Promise<Visit[]>;

  /**
   * Find active visits (not checked out)
   */
  findActive(): Promise<Visit[]>;

  /**
   * Find intermittent visits (temporarily outside)
   */
  findIntermittent(): Promise<Visit[]>;

  /**
   * Find visits by visitor cedula
   */
  findByVisitor(visitorCedula: string): Promise<Visit[]>;

  /**
   * Find visits by date range
   */
  findByDateRange(startDate: Date, endDate: Date): Promise<Visit[]>;

  /**
   * Create new visit (check-in)
   */
  create(visit: Visit): Promise<Visit>;

  /**
   * Update a visit
   * @param id - Visit ID
   * @param data - Partial visit data to update
   * @returns Promise of the updated visit
   */
  update(id: number, data: {
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
  delete(id: number): Promise<void>;

  /**
   * Get total count of visits
   */
  count(filters?: VisitFilters): Promise<number>;

  /**
   * Delete old visits (for GDPR compliance)
   */
  deleteOlderThan(date: Date): Promise<number>;

  /**
   * Statistics methods
   */
  countByStatus(status: VisitStatus): Promise<number>;
  
  countByDateRange(startDate: Date, endDate: Date): Promise<number>;
  
  /**
   * Get raw visits for reporting (optimized for fetching large datasets)
   */
  /**
   * Find visits for report (raw data)
   */
  findForReport(startDate: Date, endDate: Date): Promise<Visit[]>;

  /**
   * Find active visits that should have checked out (older than threshold)
   */
  findMissedCheckouts(thresholdDate: Date): Promise<Visit[]>;

  /**
   * Count visits in a specific date range
   */
  countByDateRange(startDate: Date, endDate: Date): Promise<number>;

  /**
   * Find all intermittent visits (visitor temporarily outside)
   */
  findIntermittent(): Promise<Visit[]>;
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
