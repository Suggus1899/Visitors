import { describe, expect, it, vi } from 'vitest';
import { GetVisitStatsUseCase } from '../application/usecases/GetVisitStats.usecase';
import type { IVisitRepository } from '../domain/repositories/IVisitRepository';
import { Visit } from '../domain/entities/Visit.entity';

describe('daily report dates', () => {
  it('groups visits by Venezuelan date across UTC midnight', async () => {
    const visits = ['2026-10-08T02:30:00Z', '2026-10-08T06:00:00Z'].map(date =>
      new Visit('V-00123456', new Date(date), 'Entrega ficticia', 'Responsable ficticio'));
    const repository = { findForReport: vi.fn().mockResolvedValue(visits), countByStatus: vi.fn().mockResolvedValue(2) } as unknown as IVisitRepository;
    const report = await new GetVisitStatsUseCase(repository).execute(new Date('2026-10-07T04:00:00Z'), new Date('2026-10-09T03:59:59Z'));
    expect(report.recentActivity).toEqual([{ date: '2026-10-07', count: 1 }, { date: '2026-10-08', count: 1 }]);
    expect(report.summary.totalVisits).toBe(2);
    expect(visits[0].checkInTime.toISOString()).toBe('2026-10-08T02:30:00.000Z');
  });
});
