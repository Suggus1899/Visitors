export interface AuditLogEntity {
  id: number;
  userId: number;
  username: string;
  action: string;
  entity: string;
  entityId: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLogEntry {
  userId: number;
  username: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilters {
  userId?: number;
  action?: string;
  username?: string;
  entity?: string;
  ip?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogStats {
  today: {
    logins: number;
    actions: number;
    uniqueUsers: number;
    uniqueIPs: number;
  };
  lastWeek: {
    actionsByType: Array<{ action: string; count: number }>;
    topUsers: Array<{ username: string; count: number }>;
    dailyActivity: Array<{ date: string; count: number }>;
  };
}

export interface IAuditLogRepository {
  log(entry: AuditLogEntry): Promise<void>;
  findAll(filters?: AuditLogFilters): Promise<{ logs: AuditLogEntity[]; total: number }>;
  getStats(): Promise<AuditLogStats>;
  getDistinctActions(): Promise<string[]>;
  getDistinctUsers(): Promise<string[]>;
  count(filters?: AuditLogFilters): Promise<number>;
}
