import ExcelJS from 'exceljs';
import autoTable from 'jspdf-autotable';
import type { Visit } from '../types';
import type { Filters } from '../components/admin/VisitsTable';
import { createReportPDF, finishReportPDF, formatReportDate, excelReportDate, REPORT_COLOR, REPORT_MARGINS } from './reportExport';

import { VISIT_STATUS_LABELS, visitReportRow } from './visitReport';
export * from './visitReport';

function reportMetadata(visits: Visit[], filters: Filters, username: string, generatedAt: Date) {
    const selected = [filters.status && `Estado: ${VISIT_STATUS_LABELS[filters.status]}`,
        filters.startDate && `Desde: ${filters.startDate}`, filters.endDate && `Hasta: ${filters.endDate}`,
        filters.search && `Búsqueda: ${filters.search}`, filters.company && `Empresa: ${filters.company}`].filter(Boolean);
    return [['Generado por', username], ['Fecha', formatReportDate(generatedAt)], ['Registros', String(visits.length)],
        ['Filtros', selected.join('\n') || 'Todos los registros'],
        ['Resumen', Object.entries(VISIT_STATUS_LABELS).map(([status, label]) => `${label}: ${visits.filter(v => v.status === status).length}`).join(' · ')]];
}

export function buildVisitsPDF(visits: Visit[], filters: Filters, username = 'Sistema', generatedAt = new Date()) {
    const title = 'Reporte de control de visitas';
    const doc = createReportPDF(title, reportMetadata(visits, filters, username, generatedAt));
    const rows = visits.map(visitReportRow);
    autoTable(doc, { startY: (doc.lastAutoTable?.finalY || 40) + 8, margin: REPORT_MARGINS,
        head: [['ID', 'Visitante', 'Cédula', 'Empresa', 'Motivo', 'Departamento', 'Anfitrión', 'Llegada', 'Entrada', 'Salida', 'Estado']],
        body: rows.map(r => [r.id, r.name, r.cedula || '—', r.company || '—', r.reason, r.department || '—', r.host || '—',
            formatReportDate(r.arrival), formatReportDate(r.entry), formatReportDate(r.exit), r.status]),
        styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: REPORT_COLOR, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [243, 247, 249] },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 34 }, 2: { cellWidth: 24 }, 3: { cellWidth: 32 }, 4: { cellWidth: 30 },
            5: { cellWidth: 22 }, 6: { cellWidth: 24 }, 7: { cellWidth: 25 }, 8: { cellWidth: 25 }, 9: { cellWidth: 25 }, 10: { cellWidth: 18 } },
        rowPageBreak: 'avoid',
    });
    finishReportPDF(doc, title, generatedAt);
    return doc;
}

export function buildVisitsWorkbook(visits: Visit[], filters: Filters, username = 'Sistema', generatedAt = new Date()) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = username; workbook.created = generatedAt; workbook.modified = generatedAt;
    workbook.title = 'LogMaster · Reporte de visitas';
    const summary = workbook.addWorksheet('Resumen');
    summary.columns = [{ width: 26 }, { width: 100 }];
    summary.mergeCells('A1:B1'); summary.getCell('A1').value = 'LOGMASTER · Industrias de Alimentos el Trébol';
    summary.getRow(1).height = 32;
    summary.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF122834' } };
    summary.addRow(['Reporte', 'Control de visitas']);
    reportMetadata(visits, filters, username, generatedAt).forEach(row => summary.addRow(row));
    summary.addRow(['Zona horaria', 'Venezuela · America/Caracas. Las fechas de la hoja Visitas muestran la hora local.']);
    summary.eachRow(row => { row.alignment = { vertical: 'middle', wrapText: true }; });
    summary.getRow(6).height = 60;

    const sheet = workbook.addWorksheet('Visitas', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' } });
    sheet.columns = [
        { header: 'ID', width: 10 }, { header: 'Visitante', width: 30 }, { header: 'Cédula', width: 18 },
        { header: 'Empresa', width: 30 }, { header: 'Motivo', width: 45 }, { header: 'Departamento', width: 26 },
        { header: 'Anfitrión', width: 30 }, { header: 'Llegada', width: 23 }, { header: 'Entrada', width: 23 },
        { header: 'Salida', width: 23 }, { header: 'Estado', width: 22 },
    ];
    visits.map(visitReportRow).forEach(r => {
        const row = sheet.addRow([r.id, r.name, r.cedula, r.company, r.reason, r.department, r.host,
            excelReportDate(r.arrival), excelReportDate(r.entry), excelReportDate(r.exit), r.status]);
        row.alignment = { vertical: 'top', wrapText: true };
        row.height = Math.max(30, Math.ceil(Math.max(r.name.length / 28, r.company.length / 28, r.reason.length / 42, r.host.length / 28)) * 15);
        row.eachCell({ includeEmpty: true }, cell => {
            cell.font = { size: 10, color: { argb: 'FF283441' } };
            if (row.number % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7F9' } };
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFD2DCE1' } } };
        });
        [8, 9, 10].forEach(column => { row.getCell(column).numFmt = 'dd/mm/yyyy hh:mm'; });
    });
    sheet.getRow(1).height = 28;
    sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D7369' } };
        cell.alignment = { vertical: 'middle' };
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: 11 } };
    sheet.pageSetup.printArea = `A1:K${sheet.rowCount}`;
    sheet.headerFooter.oddHeader = '&LLogMaster&RControl de visitas';
    sheet.headerFooter.oddFooter = '&LHora de Venezuela&RPágina &P de &N';
    return workbook;
}
