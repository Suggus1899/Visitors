export interface MonthlyReportDto {
  period: {
    month: number;
    monthName: string;
    year: number;
  };
  summary: {
    totalVisits: number;
    completedVisits: number;
    activeVisits: number;
    avgVisitsPerDay: number;
    uniqueVisitors: number;
    averageDuration: number;
    completionRate: number;
  };
  byReason: {
    purpose: string;
    count: number;
    percentage: number;
  }[];
  byWeek: {
    weekStart: string;
    count: number;
    topReasons: { purpose: string; count: number }[];
  }[];
  byDayOfWeek: {
    day: number;
    dayName: string;
    count: number;
    topReasons: { purpose: string; count: number }[];
  }[];
}
