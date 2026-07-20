import { IVisitRepository } from '../../domain/repositories/IVisitRepository';
import { Visit } from '../../domain/entities/Visit.entity';

export interface MissedCheckoutsDto {
  total: number;
  byDate: { date: string; count: number }[];
  visits: Visit[]; // Or a simplified DTO if needed
}

export class GetMissedCheckoutsUseCase {
  constructor(private visitRepository: IVisitRepository) {}

  async execute(tenantId: number, hoursThreshold: number = 8): Promise<MissedCheckoutsDto> {
    const thresholdDate = new Date();
    thresholdDate.setHours(thresholdDate.getHours() - hoursThreshold);

    const missedVisits = await this.visitRepository.findMissedCheckouts(tenantId, thresholdDate);

    // Group by date
    const dateCounts: Record<string, number> = {};
    missedVisits.forEach(visit => {
      const date = visit.checkInTime.toISOString().split('T')[0];
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    });

    const byDate = Object.entries(dateCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      total: missedVisits.length,
      byDate,
      visits: missedVisits
    };
  }
}
