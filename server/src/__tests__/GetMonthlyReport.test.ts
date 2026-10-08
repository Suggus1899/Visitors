import { describe, expect, it, vi } from 'vitest';
import { GetMonthlyReportUseCase } from '../application/usecases/GetMonthlyReport.usecase';
import type { IVisitRepository } from '../domain/repositories/IVisitRepository';
import { Visit, VisitStatus } from '../domain/entities/Visit.entity';

describe('monthly report summary', () => {
  it('counts distinct visitors, completed visits and the actual average duration', async () => {
    const arrival = new Date('2026-10-01T12:00:00Z');
    const visits = [
      new Visit('V-12345678', arrival, 'Entrega', 'Anfitrión', VisitStatus.COMPLETED, 1, new Date('2026-10-01T12:30:00Z')),
      new Visit('V-12345678', arrival, 'Entrega', 'Anfitrión', VisitStatus.COMPLETED, 2, new Date('2026-10-01T13:00:00Z')),
      new Visit('V-87654321', arrival, 'Reunión', 'Anfitrión'),
    ];
    const repository = { findForReport: vi.fn().mockResolvedValue(visits) } as unknown as IVisitRepository;
    const report = await new GetMonthlyReportUseCase(repository).execute(9, 2026);
    expect(report.summary).toMatchObject({ totalVisits: 3, completedVisits: 2, uniqueVisitors: 2, averageDuration: 45, completionRate: 67 });
    expect(report.byReason).toContainEqual({ purpose: 'Entrega', count: 2, percentage: 67 });
  });

  it('returns zero metrics without dividing by zero for an empty month', async () => {
    const repository = { findForReport: vi.fn().mockResolvedValue([]) } as unknown as IVisitRepository;
    const report = await new GetMonthlyReportUseCase(repository).execute(9, 2026);
    expect(report.summary).toMatchObject({ totalVisits: 0, uniqueVisitors: 0, averageDuration: 0, completionRate: 0 });
    expect(report.byReason).toEqual([]);
  });
});
