/**
 * Repository interface for VisitorEditHistory
 * Tracks field-level changes to visitor data within a visit context.
 */
export interface VisitorEditHistoryEntity {
  id?: number;
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
  create(entry: Omit<VisitorEditHistoryEntity, 'id' | 'editedAt'>): Promise<VisitorEditHistoryEntity>;

  /**
   * Find all edit history records for a specific visit
   */
  findByVisitId(visitId: number): Promise<VisitorEditHistoryEntity[]>;

  /**
   * Find all edit history records for a specific visitor
   */
  findByVisitorId(visitorId: number): Promise<VisitorEditHistoryEntity[]>;
}
