import { describe, it, expect, vi, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import type { Visit } from '../types';
import type { Chart } from 'chart.js';
import { buildVisitsPDF, buildVisitsWorkbook, sortReportVisits, visitReportRow } from '../utils/visitExport';
import { excelReportDate, formatReportDate, reportFileDate } from '../utils/reportExport';
import { downloadMonthlyPDF, downloadChartPDF } from '../components/statistics/pdfExport';
import * as reportExport from '../utils/reportExport';

const filters = { status: '' as const, startDate: '', endDate: '', search: '', company: '' };
const visit = (id: number, overrides: Partial<Visit> = {}): Visit => ({
  id, visitor_cedula: 'V-00123456', status: 'completed', reason: 'Entrega de materiales',
  arrival_time: '2026-10-08T02:30:00Z', entry_time: '2026-10-08T03:00:00Z', exit_time: '2026-10-08T04:00:00Z',
  target_department: 'Recepción', host_person: 'Responsable ficticio',
  Visitor: { cedula: 'V-00123456', first_name: `Visitante${id}`, last_name: 'Ficticio', company: 'Empresa de prueba' }, ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('real PDF and Excel exports', () => {
  it('round-trips all rows, real dates, filters and printable/frozen headers through XLSX', async () => {
    const visits = Array.from({ length: 130 }, (_, i) => visit(i + 1));
    visits[0] = visit(1, { reason: '=HYPERLINK("https://example.invalid", "texto")', status: 'waiting' });
    const buffer = await buildVisitsWorkbook(visits, { ...filters, company: 'Empresa de prueba' }, 'Operador ficticio').xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Visitas')!;
    expect(sheet.rowCount).toBe(131);
    expect(sheet.getCell('A131').value).toBe(130);
    expect(sheet.getCell('C2').value).toBe('V-00123456');
    expect(sheet.getCell('E2').value).toBe(visits[0].reason);
    expect(sheet.getCell('H2').value).toEqual(new Date('2026-10-07T22:30:00Z'));
    expect(sheet.getCell('H2').numFmt).toBe('dd/mm/yyyy hh:mm');
    expect(sheet.getCell('K2').value).toBe('En espera');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 2, ySplit: 1 });
    expect(sheet.autoFilter).toBe('A1:K131');
    expect(sheet.pageSetup).toMatchObject({ orientation: 'landscape', printTitlesRow: '1:1', printArea: 'A1:K131' });
    expect(JSON.stringify(workbook.getWorksheet('Resumen')!.getSheetValues())).toContain('Empresa: Empresa de prueba');
    expect(JSON.stringify(workbook.getWorksheet('Resumen')!.getSheetValues())).toContain('Completada: 129');
  });

  it('paginates full visit tables, wraps long text, repeats headers and numbers every PDF page', () => {
    const visits = Array.from({ length: 130 }, (_, i) => visit(i + 1, { reason: 'Texto largo de prueba '.repeat(15) }));
    visits[129].Visitor!.first_name = 'LASTRECORD';
    const doc = buildVisitsPDF(visits, filters);
    const pages = doc.getNumberOfPages();
    const pdf = doc.output();
    expect(pages).toBeGreaterThan(2);
    expect(pdf).toContain('LASTRECORD');
    expect(pdf).toContain(`1 de ${pages}`);
    expect(pdf).toContain(`${pages} de ${pages}`);
    expect(pdf.match(/LOGMASTER/g)).toHaveLength(pages);
    expect(doc.lastAutoTable!.body).toHaveLength(130);
    expect(doc.lastAutoTable!.columns.reduce((sum, column) => sum + column.width, 0)).toBeLessThanOrEqual(270);
    expect(doc.lastAutoTable!.body[0].cells[4].text.length).toBeGreaterThan(1);
  });

  it('does not export stale identifying data for anonymized visits', async () => {
    const anonymous = visit(1, { visitor_cedula: null, reason: 'PRIVATEPURPOSE', host_person: 'PRIVATEHOST',
      Visitor: { cedula: 'PRIVATEID', first_name: 'PRIVATENAME', last_name: 'PRIVATEFAMILY', company: 'PRIVATECOMPANY' } });
    const pdf = buildVisitsPDF([anonymous], filters).output();
    const buffer = await buildVisitsWorkbook([anonymous], filters).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
    const cells = JSON.stringify(workbook.getWorksheet('Visitas')!.getSheetValues());
    expect(pdf + cells).not.toContain('PRIVATE');
    expect(cells).toContain('Anonimizado');
    expect(workbook.getWorksheet('Visitas')!.getCell('H2').value).toBeInstanceOf(Date);
  });

  it('prints all four states and sorts lifecycle dates without mutating the source', () => {
    expect(['waiting', 'active', 'intermittent', 'completed'].map(status => visitReportRow(visit(1, { status: status as Visit['status'] })).status))
      .toEqual(['En espera', 'Activa', 'Salida temporal', 'Completada']);
    const records = [visit(1, { entry_time: '2026-10-09T12:00:00Z' }), visit(2, { entry_time: '2026-10-08T12:00:00Z' })];
    expect(sortReportVisits(records, 'entry_time', 'asc').map(v => v.id)).toEqual([2, 1]);
    expect(records.map(v => v.id)).toEqual([1, 2]);
    expect(visitReportRow(visit(3, { status: 'waiting', entry_time: undefined, check_in: '2026-10-08T12:00:00Z' })).entry).toBeUndefined();
  });

  it('uses Venezuela dates consistently and tolerates absent/invalid timestamps', () => {
    expect(excelReportDate('2026-10-08T02:30:00Z')?.toISOString()).toBe('2026-10-07T22:30:00.000Z');
    expect(reportFileDate(new Date('2026-10-08T02:30:00Z'))).toBe('2026-10-07');
    expect(formatReportDate('invalid')).toBe('—');
    expect(excelReportDate('invalid')).toBeNull();
    expect(excelReportDate(null)).toBeNull();
  });

  it('keeps the selected monthly period and all reasons across pages even without a chart', async () => {
    let saved: jsPDF | undefined;
    const save = vi.fn();
    const create = reportExport.createReportPDF;
    vi.spyOn(reportExport, 'createReportPDF').mockImplementation((...args) => {
      saved = create(...args);
      vi.spyOn(saved, 'save').mockImplementation(filename => { save(filename); return saved!; });
      return saved;
    });
    await downloadMonthlyPDF({ totalVisits: 100, uniqueVisitors: 90, averageDuration: 30, completionRate: 100,
      byReason: Array.from({ length: 100 }, (_, i) => ({ reason: `Reason${i} ${'extended text '.repeat(8)}`, count: 1, percentage: 1 })) }, { current: null }, 0, 2025);
    expect(save).toHaveBeenCalledWith('reporte-mensual-2025-01.pdf');
    expect(saved!.getNumberOfPages()).toBeGreaterThan(1);
    expect(saved!.output()).toContain('enero de 2025');
    expect(saved!.output()).toContain('Reason99');
  });

  it('exports an empty chart summary without infinity and does not truncate reasons', async () => {
    let saved: jsPDF | undefined;
    const create = reportExport.createReportPDF;
    vi.spyOn(reportExport, 'createReportPDF').mockImplementation((...args) => {
      saved = create(...args);
      vi.spyOn(saved, 'save').mockImplementation(() => saved!);
      return saved;
    });
    await downloadChartPDF({ current: null }, 'test', 'Estadísticas', { labels: [], values: [] },
      Array.from({ length: 20 }, (_, i) => ({ reason: `REASON${i}`, count: 1 })), 'Octubre 2026');
    expect(saved!.output()).not.toContain('Infinity');
    expect(saved!.output()).toContain('REASON19');
    expect(saved!.output()).toContain('Octubre 2026');
  });

  it('restores the chart theme even when image generation fails', async () => {
    const original = { plugins: { legend: { labels: { color: '#FFFFFF' } } } };
    const chart = { config: { options: original }, options: original, update: vi.fn(),
      canvas: { width: 200, height: 100, toDataURL: vi.fn(() => { throw new Error('Canvas unavailable'); }) } };
    await expect(downloadChartPDF({ current: chart as unknown as Chart }, 'test', 'Prueba', { labels: [], values: [] })).rejects.toThrow('Canvas unavailable');
    expect(chart.options).toBe(original);
    expect(chart.update.mock.calls).toEqual([['none'], ['none']]);
  });
});
