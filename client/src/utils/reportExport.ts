import { jsPDF } from 'jspdf';
import autoTable, { type Table } from 'jspdf-autotable';
import { REPORT_COLOR, REPORT_MARGINS, formatReportDate } from './reportFormatting';
export * from './reportFormatting';
declare module 'jspdf' { interface jsPDF { lastAutoTable?: Table } }

export function createReportPDF(title: string, metadata: string[][], orientation: 'portrait' | 'landscape' = 'landscape') {
    const doc = new jsPDF({ orientation, format: 'a4' });
    doc.setProperties({ title, author: 'LogMaster', subject: 'Control de acceso · Industrias de Alimentos el Trébol' });
    autoTable(doc, { body: metadata, startY: 40, margin: REPORT_MARGINS, theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2, textColor: [40, 52, 65], overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [243, 247, 249] },
    });
    return doc;
}

export function finishReportPDF(doc: jsPDF, title: string, generatedAt = new Date()) {
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFillColor(18, 40, 52); doc.rect(0, 0, width, 31, 'F');
        doc.setFillColor(...REPORT_COLOR); doc.rect(0, 31, width, 1.4, 'F');
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text('LOGMASTER', 14, 10);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text('Industrias de Alimentos el Trébol', width - 14, 10, { align: 'right' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(title, 14, 23);
        doc.setDrawColor(210, 220, 225); doc.line(14, height - 15, width - 14, height - 15);
        doc.setTextColor(90, 105, 115); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(`Uso interno · Hora de Venezuela · ${formatReportDate(generatedAt)}`, 14, height - 9);
        doc.text(`Página ${page} de ${pages}`, width - 14, height - 9, { align: 'right' });
    }
}
