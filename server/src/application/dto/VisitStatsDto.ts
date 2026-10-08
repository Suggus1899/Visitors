/**
 * DTO for visit statistics
 */
export interface VisitStatsDto {
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalVisits: number;
    activeVisits: number;
    completedVisits: number;
    avgVisitsPerDay: number;
  };
  byStatus: {
    active: number;
    completed: number;
  };
  byReason: {
    purpose: string;
    count: number;
    percentage: number;
  }[];
  byDayOfWeek: {
    dayName: string;
    count: number;
  }[];
  recentActivity: {
    date: string;
    count: number;
  }[];
  byWeek: {
    weekStart: string;
    count: number;
  }[];
}
