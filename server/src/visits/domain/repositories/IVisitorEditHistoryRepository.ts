/**
 * Repository interface for VisitorEditHistory
 * Tracks field-level changes to visitor data within a visit context.
 */
export interface VisitorEditHistoryEntity {
  id?: number;
  tenantId: number;
  visitId: number;
  visitorId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  editedBy: number;
  editedByUsername: string;
  editedAt: Date;
}

export interface IVisitorEditHistoryRepository {
  /**
   * Create a single edit history record
   */
  create(tenantId: number, entry: Omit<VisitorEditHistoryEntity, 'id' | 'editedAt' | 'tenantId'>): Promise<VisitorEditHistoryEntity>;

  /**
   * Find all edit history records for a specific visit
   */
  findByVisitId(tenantId: number, visitId: number): Promise<VisitorEditHistoryEntity[]>;

  /**
   * Find all edit history records for a specific visitor
   */
  findByVisitorId(tenantId: number, visitorId: number): Promise<VisitorEditHistoryEntity[]>;
}
