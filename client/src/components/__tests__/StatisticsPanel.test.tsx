import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StatisticsPanel from '../StatisticsPanel';
import { VisitService } from '../../services/api.v1';
import toast from 'react-hot-toast';
import type { MonthlyReportData } from '../statistics/pdfExport';

vi.mock('../../services/api.v1', () => ({ VisitService: { getStats: vi.fn(), getComparisonStats: vi.fn(), getMonthlyReport: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../statistics/ComparisonCard', () => ({ default: () => null }));
vi.mock('../statistics/ChartsRow', () => ({ default: ({ period }: { period: string }) => <p>{period}</p> }));
vi.mock('../statistics/MonthlyReportCard', () => ({ default: ({ monthlyReport, setSelectedMonth }: {
  monthlyReport: MonthlyReportData | null; setSelectedMonth: (month: number) => void;
}) => <div><span>{monthlyReport ? `${monthlyReport.totalVisits} visitas mensuales` : 'Sin reporte'}</span>
  <button onClick={() => setSelectedMonth(0)}>Enero</button></div> }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(VisitService.getStats).mockResolvedValue({ byWeek: [], byDayOfWeek: [], topReasons: [], visitsPerDay: [] });
  vi.mocked(VisitService.getComparisonStats).mockResolvedValue({} as Awaited<ReturnType<typeof VisitService.getComparisonStats>>);
  vi.mocked(VisitService.getMonthlyReport).mockResolvedValue({ totalVisits: 3, uniqueVisitors: 3, averageDuration: 30, completionRate: 100, byReason: [] });
});
afterEach(cleanup);

describe('statistics report period', () => {
  it('reloads chart and monthly data together for the selected month', async () => {
    render(<StatisticsPanel />);
    await screen.findByText('3 visitas mensuales');
    fireEvent.click(screen.getByRole('button', { name: 'Enero' }));
    await waitFor(() => expect(VisitService.getMonthlyReport).toHaveBeenLastCalledWith(0, new Date().getFullYear()));
    expect(VisitService.getStats).toHaveBeenLastCalledWith(`${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-01-31`);
    await screen.findByText(`Enero ${new Date().getFullYear()}`);
  });

  it('clears a previous report when the newly selected period cannot be loaded', async () => {
    render(<StatisticsPanel />);
    await screen.findByText('3 visitas mensuales');
    vi.mocked(VisitService.getMonthlyReport).mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Enero' }));
    await screen.findByText('Sin reporte');
    expect(screen.queryByText('3 visitas mensuales')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('No se pudieron cargar las estadísticas del período seleccionado.');
  });
});
