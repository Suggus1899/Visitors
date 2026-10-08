import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import type { Visit, CalendarEvent } from '../../types';
import VisitsTable from '../admin/VisitsTable';
import CalendarView from '../admin/CalendarView';
import { VisitService } from '../../services/api.v1';
import * as reportExport from '../../utils/reportExport';
import toast from 'react-hot-toast';

vi.mock('../../services/api.v1', () => ({ VisitService: { getAllVisits: vi.fn() } }));
vi.mock('../visit/VisitorDetailsModal', () => ({ VisitorDetailsModal: () => null }));
vi.mock('../CalendarEventModal', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-big-calendar', () => ({
  dateFnsLocalizer: vi.fn(), Views: { MONTH: 'month', WEEK: 'week', DAY: 'day', AGENDA: 'agenda' },
  Calendar: ({ events, onRangeChange }: { events: CalendarEvent[]; onRangeChange: (range: { start: Date; end: Date }) => void }) => (
    <div><span>{events.length} eventos</span><button onClick={() => onRangeChange({ start: new Date(2026, 0, 1), end: new Date(2026, 0, 31) })}>Cambiar período</button></div>
  ),
}));

const visits: Visit[] = Array.from({ length: 125 }, (_, i) => ({ id: i + 1, visitor_cedula: 'V-00123456', status: 'completed',
  reason: 'Prueba', arrival_time: '2026-10-08T12:00:00Z',
  Visitor: { cedula: 'V-00123456', first_name: `Visitante${i + 1}`, last_name: 'Ficticio', company: 'Empresa de prueba' } }));
const filters = { status: '' as const, startDate: '', endDate: '', search: '', company: '' };
const props = { visits: visits.slice(0, 10), sortedVisits: visits.slice(0, 10), totalVisitsCount: 125, currentPage: 1, totalPages: 13,
  filters, sortField: 'visitor' as const, sortDirection: 'asc' as const, onFilterChange: vi.fn(), onSort: vi.fn(), onPageChange: vi.fn() };

beforeEach(() => vi.mocked(VisitService.getAllVisits).mockReset());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('report download controls', () => {
  it('downloads all filtered rows rather than the visible ten and blocks concurrent downloads', async () => {
    let resolve!: (value: Visit[]) => void;
    vi.mocked(VisitService.getAllVisits).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    let rowCount = 0;
    const save = vi.fn();
    const create = reportExport.createReportPDF;
    vi.spyOn(reportExport, 'createReportPDF').mockImplementation((...args) => {
      const doc = create(...args);
      vi.spyOn(doc, 'save').mockImplementation(() => { rowCount = doc.lastAutoTable!.body.length; save(); return doc; });
      return doc;
    });
    render(<VisitsTable {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    expect(screen.getAllByRole('button', { name: 'Preparando…' }).every(button => button.hasAttribute('disabled'))).toBe(true);
    resolve(visits);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(rowCount).toBe(125);
    expect(VisitService.getAllVisits).toHaveBeenCalledWith(filters);
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
  });

  it('shows export failures and restores both controls', async () => {
    vi.mocked(VisitService.getAllVisits).mockRejectedValueOnce(new Error('Los registros cambiaron durante la exportación.'));
    render(<VisitsTable {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Los registros cambiaron durante la exportación.'));
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
  });

  it('loads the visible calendar range and exports more than fifty events', async () => {
    vi.mocked(VisitService.getAllVisits).mockResolvedValue(visits);
    let rowCount = 0;
    const create = reportExport.createReportPDF;
    vi.spyOn(reportExport, 'createReportPDF').mockImplementation((...args) => {
      const doc = create(...args);
      vi.spyOn(doc, 'save').mockImplementation(() => { rowCount = doc.lastAutoTable!.body.length; return doc; });
      return doc;
    });
    render(<CalendarView fetchVisits={vi.fn()} />);
    await screen.findByText('125 eventos');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Calendario' }));
    expect(rowCount).toBe(125);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar período' }));
    await waitFor(() => expect(VisitService.getAllVisits).toHaveBeenLastCalledWith({ startDate: '2026-01-01', endDate: '2026-01-31', status: undefined }));
  });
});
