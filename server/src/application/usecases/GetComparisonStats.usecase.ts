import { IVisitRepository } from '../../domain/repositories/IVisitRepository';

export interface ComparisonStatsDto {
  summary: {
    currentMonth: number;
    lastMonth: number;
    growth: number;
  };
  reasons: {
    current: { purpose: string; count: number }[];
    last: { purpose: string; count: number }[];
  };
}

export class GetComparisonStatsUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(month?: number, year?: number): Promise<ComparisonStatsDto> {
    const today = new Date();
    const targetMonth = month !== undefined ? month : today.getMonth();
    const targetYear = year || today.getFullYear();

    // Current Month Range
    const currentMonthStart = new Date(targetYear, targetMonth, 1);
    const currentMonthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    // Last Month Range (handle year rollover automatically by Date constructor)
    const lastMonthStart = new Date(targetYear, targetMonth - 1, 1);
    const lastMonthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Fetch raw visits for both periods
    const currentVisits = await this.visitRepository.findForReport(currentMonthStart, currentMonthEnd);
    const lastVisits = await this.visitRepository.findForReport(lastMonthStart, lastMonthEnd);

    // Counts
    const currentMonthCount = currentVisits.length;
    const lastMonthCount = lastVisits.length;

    // Growth
    const growth = lastMonthCount > 0
      ? ((currentMonthCount - lastMonthCount) / lastMonthCount) * 100
      : (currentMonthCount > 0 ? 100 : 0);

    // Reasons aggregation
    const getReasonCounts = (visits: any[]) => {
      const counts: Record<string, number> = {};
      visits.forEach(v => {
        const reason = v.purpose || 'Sin especificar';
        counts[reason] = (counts[reason] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([purpose, count]) => ({ purpose, count }))
        .sort((a, b) => b.count - a.count);
    };

    return {
      summary: {
        currentMonth: currentMonthCount,
        lastMonth: lastMonthCount,
        growth
      },
      reasons: {
        current: getReasonCounts(currentVisits),
        last: getReasonCounts(lastVisits)
      }
    };
  }
}
