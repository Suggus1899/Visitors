import type { Chart } from 'chart.js';
import autoTable from 'jspdf-autotable';
import type { jsPDF } from 'jspdf';
import type { ReasonData } from '../../types';
import { createReportPDF, finishReportPDF, reportFileDate, REPORT_COLOR, REPORT_MARGINS } from '../../utils/reportExport';

export interface MonthlyReportData {
  totalVisits: number;
  uniqueVisitors: number;
  averageDuration: number;
  completionRate: number;
  byReason: Array<{ reason: string; count: number; percentage: number }>;
}

function addChart(doc: jsPDF, chart: Chart | null, y: number) {
  if (!chart || !chart.canvas.width || !chart.canvas.height) return y;
  const canvas = chart.canvas;
  const previous = chart.config.options;
  let image: string;
  try {
    chart.options = { ...previous, plugins: { ...previous?.plugins,
      legend: { ...previous?.plugins?.legend, labels: { ...previous?.plugins?.legend?.labels, color: '#283441' } } },
      scales: Object.fromEntries(Object.entries(previous?.scales || {}).map(([key, scale]) => [key, { ...scale,
        ticks: { ...scale?.ticks, color: '#283441' }, grid: { ...scale?.grid, color: '#D2DCE1' } }])),
    };
    chart.update('none');
    image = canvas.toDataURL('image/png');
  } finally {
    chart.options = previous || {};
    chart.update('none');
  }
  const maxHeight = doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? 55 : 65;
  const scale = Math.min(150 / canvas.width, maxHeight / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  doc.addImage(image, 'PNG', (doc.internal.pageSize.getWidth() - width) / 2, y, width, height);
  return y + height + 8;
}

const tableStyles = {
  margin: REPORT_MARGINS,
  styles: { fontSize: 9, overflow: 'linebreak' as const, cellPadding: 3 },
  headStyles: { fillColor: REPORT_COLOR },
  alternateRowStyles: { fillColor: [245, 248, 250] as [number, number, number] },
  rowPageBreak: 'avoid' as const,
};

export function downloadChartPDF(chartRef: React.RefObject<Chart | null>, filename: string, title: string, data: { labels: string[]; values: number[] }, reasons?: ReasonData[], period = 'Período seleccionado') {
  const generatedAt = new Date();
  const total = data.values.reduce((a, b) => a + b, 0);
  const max = data.values.length ? Math.max(...data.values) : 0;
  const maxLabel = data.labels[data.values.indexOf(max)] || 'Sin registros';
  const doc = createReportPDF(title, [['Período', period], ['Total de visitas', String(total)], ['Máximo', `${max} · ${maxLabel}`]]);
  const startY = addChart(doc, chartRef.current, (doc.lastAutoTable?.finalY || 40) + 8);
  autoTable(doc, { ...tableStyles, head: [['Período / categoría', 'Visitas']], body: data.labels.map((label, i) => [label, data.values[i] || 0]), startY });
  if (reasons?.length) {
    autoTable(doc, { ...tableStyles, head: [['Motivo de visita', 'Visitas']], body: reasons.map(r => [r.reason, r.count]), startY: (doc.lastAutoTable?.finalY || startY) + 8 });
  }
  finishReportPDF(doc, title, generatedAt);
  doc.save(`${filename}-${reportFileDate(generatedAt)}.pdf`);
}

export function downloadMonthlyPDF(report: MonthlyReportData, pieChartRef: React.RefObject<Chart | null>, month: number, year: number) {
  const generatedAt = new Date();
  const title = 'Reporte mensual de visitas';
  const period = new Date(year, month, 15).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
  const doc = createReportPDF(title, [['Período', period]], 'portrait');
  autoTable(doc, {
    ...tableStyles,
    head: [['Indicador', 'Resultado']],
    body: [
      ['Total de visitas', report.totalVisits],
      ['Visitantes únicos', report.uniqueVisitors],
      ['Duración promedio', `${report.averageDuration.toLocaleString('es-VE', { maximumFractionDigits: 1 })} min`],
      ['Tasa de finalización', `${report.completionRate.toLocaleString('es-VE', { maximumFractionDigits: 1 })}%`],
    ],
    startY: (doc.lastAutoTable?.finalY || 40) + 8,
  });
  const startY = addChart(doc, pieChartRef.current, (doc.lastAutoTable?.finalY || 40) + 8);
  autoTable(doc, {
    ...tableStyles,
    head: [['Motivo de visita', 'Visitas', 'Porcentaje']],
    body: report.byReason.map(r => [r.reason, r.count, `${r.percentage.toLocaleString('es-VE', { maximumFractionDigits: 1 })}%`]),
    startY,
  });
  finishReportPDF(doc, title, generatedAt);
  doc.save(`reporte-mensual-${year}-${String(month + 1).padStart(2, '0')}.pdf`);
}
