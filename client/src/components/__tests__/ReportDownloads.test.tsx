import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import type { Visit, CalendarEvent } from '../../types';
import VisitsTable from '../admin/VisitsTable';
import CalendarView from '../admin/CalendarView';
import { VisitService } from '../../services/api.v1';
import * as reportExport from '../../utils/reportExport';
import * as visitExport from '../../utils/visitExport';
import toast from 'react-hot-toast';

vi.mock('../../services/api.v1', () => ({ VisitService: { getAllVisits: vi.fn(), getExportVisits: vi.fn(), getCalendar: vi.fn(), getVisits: vi.fn() } }));
vi.mock('../visit/VisitorDetailsModal', () => ({ VisitorDetailsModal: () => null }));
vi.mock('../CalendarEventModal', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
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
const props = { visits: visits.slice(0, 10), totalVisitsCount: 125, currentPage: 1, totalPages: 13,
  filters, sortField: 'company' as const, sortDirection: 'asc' as const, onFilterChange: vi.fn(), onSort: vi.fn(), onPageChange: vi.fn() };

beforeEach(() => { vi.mocked(VisitService.getAllVisits).mockReset(); vi.mocked(VisitService.getExportVisits).mockReset(); vi.mocked(VisitService.getCalendar).mockResolvedValue([{ date: '2026-10-08', count: 125 }]); vi.mocked(toast.success).mockReset(); vi.mocked(toast.error).mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('report download controls', () => {
  it('downloads all filtered rows rather than the visible ten and blocks concurrent downloads', async () => {
    let resolve!: (value: { visits: Visit[]; total: number }) => void;
    vi.mocked(VisitService.getExportVisits).mockReturnValueOnce(new Promise(done => { resolve = done; }));
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
    resolve({ visits, total: 125 });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(rowCount).toBe(125);
    expect(VisitService.getExportVisits).toHaveBeenCalledWith(filters, { format: 'pdf', sortField: 'company', sortDirection: 'asc', signal: expect.any(AbortSignal) });
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
  });

  it('shows export failures and restores both controls', async () => {
    vi.mocked(VisitService.getExportVisits).mockRejectedValueOnce(new Error('Los registros cambiaron durante la exportación.'));
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
    await waitFor(() => expect(rowCount).toBe(125));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar período' }));
    await waitFor(() => expect(VisitService.getAllVisits).toHaveBeenLastCalledWith({ startDate: '2026-01-01', endDate: '2026-01-31', status: undefined }, { maxRecords: 2000, signal: expect.any(AbortSignal) }));
  });

  it('uses daily counts for a dense calendar and refuses its PDF without collecting visits', async () => {
    vi.mocked(VisitService.getCalendar).mockResolvedValueOnce([{ date: '2026-10-08', count: 2001 }]);
    render(<CalendarView fetchVisits={vi.fn()} />);
    await screen.findByText('1 eventos');
    expect(VisitService.getAllVisits).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Calendario' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(VisitService.getAllVisits).not.toHaveBeenCalled();
  });

  it('aborts collection when the user cancels an export', async () => {
    vi.mocked(VisitService.getExportVisits).mockImplementationOnce((_filters, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')));
    }));
    render(<VisitsTable {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar exportación' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeEnabled());
    expect(vi.mocked(VisitService.getExportVisits).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('does not download a workbook if cancellation happens during serialization', async () => {
    vi.mocked(VisitService.getExportVisits).mockResolvedValueOnce({ visits, total: 125 });
    let finish!: (value: ArrayBuffer) => void;
    const workbook = { xlsx: { writeBuffer: vi.fn(() => new Promise<ArrayBuffer>(resolve => { finish = resolve; })) } };
    vi.spyOn(visitExport, 'buildVisitsWorkbook').mockReturnValue(workbook as unknown as ReturnType<typeof visitExport.buildVisitsWorkbook>);
    render(<VisitsTable {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(workbook.xlsx.writeBuffer).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar exportación' }));
    finish(new ArrayBuffer(0));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('uses keyboard-operable sorting buttons with an announced sort state', () => {
    render(<VisitsTable {...props} />);
    const companySort = screen.getByRole('button', { name: 'Ordenar por Empresa, ascendente' });
    expect(companySort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Llegada' }));
    expect(props.onSort).toHaveBeenCalledWith('arrival_time');
    expect(screen.getByRole('button', { name: 'Ver detalles de Visitante1 Ficticio' })).toBeInTheDocument();
  });
});
