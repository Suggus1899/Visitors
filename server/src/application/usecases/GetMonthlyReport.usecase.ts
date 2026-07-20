import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { MonthlyReportDto } from '../dto/MonthlyReportDto';
import { VisitStatus } from '../../domain/entities/Visit.entity';

export class GetMonthlyReportUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(tenantId: number, month?: number, year?: number): Promise<MonthlyReportDto> {
    const targetMonth = month !== undefined ? month : new Date().getMonth();
    const targetYear = year || new Date().getFullYear();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    const visits = await this.visitRepository.findForReport(tenantId, startDate, endDate);

    // Statistics
    const totalVisits = visits.length;
    const completedVisits = visits.filter(v => v.status === VisitStatus.COMPLETED).length;
    const activeVisits = visits.filter(v => v.isActive()).length;
    const daysInMonth = endDate.getDate();
    const avgVisitsPerDay = parseFloat((totalVisits / daysInMonth).toFixed(1));

    // By Reason
    const reasonCounts: Record<string, number> = {};
    visits.forEach(v => {
      const reason = v.purpose || 'Sin especificar';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const byReason = Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([purpose, count]) => ({
        purpose,
        count,
        percentage: Math.round((count / totalVisits) * 100)
      }));

    // By Week
    const weekCounts: Record<string, { count: number; reasons: Record<string, number> }> = {};
    visits.forEach(visit => {
      const date = visit.checkInTime;
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Sunday as start
      const key = weekStart.toISOString().split('T')[0];

      if (!weekCounts[key]) {
        weekCounts[key] = { count: 0, reasons: {} };
      }
      weekCounts[key].count++;
      const reason = visit.purpose || 'Sin especificar';
      weekCounts[key].reasons[reason] = (weekCounts[key].reasons[reason] || 0) + 1;
    });

    const byWeek = Object.entries(weekCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, data]) => ({
        weekStart,
        count: data.count,
        topReasons: Object.entries(data.reasons)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([purpose, count]) => ({ purpose, count }))
      }));

    // By Day of Week
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayStats = Array.from({ length: 7 }, () => ({ count: 0, reasons: {} as Record<string, number> }));

    visits.forEach(visit => {
      const day = visit.checkInTime.getDay();
      dayStats[day].count++;
      const reason = visit.purpose || 'Sin especificar';
      dayStats[day].reasons[reason] = (dayStats[day].reasons[reason] || 0) + 1;
    });

    const byDayOfWeek = dayStats.map((data, index) => ({
      day: index,
      dayName: dayNames[index],
      count: data.count,
      topReasons: Object.entries(data.reasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([purpose, count]) => ({ purpose, count }))
    }));

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return {
      period: {
        month: targetMonth,
        monthName: monthNames[targetMonth],
        year: targetYear
      },
      summary: {
        totalVisits,
        completedVisits,
        activeVisits,
        avgVisitsPerDay
      },
      byReason,
      byWeek,
      byDayOfWeek
    };
  }
}
