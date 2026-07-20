import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { VisitStatus } from '../../domain/entities/Visit.entity';
import { VisitStatsDto } from '../dto/VisitStatsDto';

/**
 * Use Case: Get visit statistics
 * Aggregates visit data for dashboards and reports
 */
export class GetVisitStatsUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(tenantId: number, startDate?: Date, endDate?: Date): Promise<VisitStatsDto> {
    // Default to last 30 days if request is not specific
    const end = endDate || new Date();
    const start = startDate || new Date(new Date().setDate(end.getDate() - 30));

    // Get raw data from repository
    const visits = await this.visitRepository.findForReport(tenantId, start, end);
    const totalActive = await this.visitRepository.countByStatus(tenantId, VisitStatus.ACTIVE);

    // Calculate Summary
    const totalVisits = visits.length;
    const completedVisits = visits.filter(v => v.status === VisitStatus.COMPLETED).length;
    const activeInPeriod = visits.filter(v => v.status === VisitStatus.ACTIVE).length;
    
    // Average visits per day
    const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const avgVisitsPerDay = parseFloat((totalVisits / daysDiff).toFixed(1));

    // Group by Reason
    const reasonCounts: Record<string, number> = {};
    visits.forEach(v => {
      const reason = v.purpose || 'Sin especificar';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const byReason = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([purpose, count]) => ({
        purpose,
        count,
        percentage: Math.round((count / totalVisits) * 100)
      }));

    // Group by Day of Week
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayCounts = new Array(7).fill(0);
    
    visits.forEach(v => {
      const day = v.checkInTime.getDay();
      dayCounts[day]++;
    });

    const byDayOfWeek = dayCounts.map((count, index) => ({
      dayName: dayNames[index],
      count
    }));

    // Recent Activity (Daily counts)
    const dailyCounts: Record<string, number> = {};
    visits.forEach(v => {
      const dateStr = v.checkInTime.toISOString().split('T')[0];
      dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;
    });

    const recentActivity = Object.entries(dailyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    // Group by Week
    const weeklyCounts: Record<string, number> = {};
    visits.forEach(v => {
      const date = new Date(v.checkInTime);
      // Get start of week (Sunday)
      const day = date.getDay();
      const diff = date.getDate() - day;
      const weekStart = new Date(date.setDate(diff));
      weekStart.setHours(0, 0, 0, 0);
      const weekKey = weekStart.toISOString();
      weeklyCounts[weekKey] = (weeklyCounts[weekKey] || 0) + 1;
    });

    const byWeek = Object.entries(weeklyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, count]) => ({ weekStart, count }));

    return {
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      summary: {
        totalVisits,
        activeVisits: totalActive, // Total currently active in system
        completedVisits,
        avgVisitsPerDay
      },
      byStatus: {
        active: totalActive,
        completed: completedVisits
      },
      byReason,
      byDayOfWeek,
      recentActivity,
      byWeek
    };
  }
}
