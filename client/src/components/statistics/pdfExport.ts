import { jsPDF } from 'jspdf';
import { ReasonData } from '../../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const downloadChartPDF = (chartRef: React.RefObject<any>, filename: string, title: string, data: { labels: string[], values: number[] }, reasons?: ReasonData[]) => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    const chartImage = chart.canvas.toDataURL('image/png', 1.0);

    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Header
    pdf.setFillColor(45, 212, 191);
    pdf.rect(0, 0, pageWidth, 25, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, 15, 17);

    const dateStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generado: ${dateStr}`, pageWidth - 15, 17, { align: 'right' });

    // Chart
    pdf.addImage(chartImage, 'PNG', 15, 35, 150, 85);

    // Stats
    const tableX = 175;
    pdf.setTextColor(31, 41, 55);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Resumen', tableX, 40);

    const total = data.values.reduce((a, b) => a + b, 0);
    const max = Math.max(...data.values);
    const maxLabel = data.labels[data.values.indexOf(max)] || '-';

    pdf.setFontSize(10);
    let y = 50;
    pdf.setFont('helvetica', 'bold'); pdf.text('Total:', tableX, y);
    pdf.setFont('helvetica', 'normal'); pdf.text(total.toString(), tableX + 40, y);
    y += 7;
    pdf.setFont('helvetica', 'bold'); pdf.text('Máximo:', tableX, y);
    pdf.setFont('helvetica', 'normal'); pdf.text(`${max} (${maxLabel})`, tableX + 40, y);

    // Reasons section
    if (reasons && reasons.length > 0) {
        y += 15;
        pdf.setFont('helvetica', 'bold');
        pdf.text('Motivos de Visita:', tableX, y);
        y += 7;
        pdf.setFontSize(9);
        reasons.slice(0, 8).forEach(r => {
            pdf.setFont('helvetica', 'normal');
            const text = `${r.reason}: ${r.count}`;
            pdf.text(text.substring(0, 35), tableX, y);
            y += 5;
        });
    }

    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(8);
    pdf.text('Sistema de Control de Visitantes', pageWidth - 15, pageHeight - 10, { align: 'right' });

    pdf.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const downloadMonthlyPDF = (monthlyReport: any, pieChartRef: React.RefObject<any>) => {
    if (!monthlyReport) return;
    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();

    // Header
    pdf.setFillColor(45, 212, 191);
    pdf.rect(0, 0, pageWidth, 30, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Reporte Mensual: ${monthlyReport.period.monthName} ${monthlyReport.period.year}`, 15, 20);

    pdf.setTextColor(31, 41, 55);
    let y = 45;

    // Summary
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Resumen General', 15, y);
    y += 10;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Total de visitas: ${monthlyReport.summary.totalVisits}`, 15, y); y += 6;
    pdf.text(`Visitas completadas: ${monthlyReport.summary.completedVisits}`, 15, y); y += 6;
    pdf.text(`Visitas activas: ${monthlyReport.summary.activeVisits}`, 15, y); y += 6;
    pdf.text(`Promedio diario: ${monthlyReport.summary.avgVisitsPerDay} visitas/día`, 15, y);
    y += 15;

    // By Reason
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Motivos de Visita', 15, y);
    y += 8;

    pdf.setFontSize(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monthlyReport.byReason.forEach((r: any) => {
        pdf.setFont('helvetica', 'normal');
        pdf.text(`• ${r.reason}: ${r.count} (${r.percentage}%)`, 20, y);
        y += 5;
    });

    // Pie Chart Image
    if (pieChartRef.current) {
        const pieCanvas = pieChartRef.current.canvas;
        const pieImage = pieCanvas.toDataURL('image/png', 1.0);
        pdf.addImage(pieImage, 'PNG', 120, 70, 75, 55);
    }
    y += 10;

    // By Week
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Por Semana', 15, y);
    y += 8;

    pdf.setFontSize(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monthlyReport.byWeek.forEach((w: any) => {
        const weekDate = new Date(w.weekStart);
        const weekLabel = `Semana del ${weekDate.getDate()}/${weekDate.getMonth() + 1}`;
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${weekLabel}: ${w.count} visitas`, 20, y);
        y += 5;
        if (w.topReasons.length > 0) {
            pdf.setFont('helvetica', 'normal');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reasons = w.topReasons.map((r: any) => `${r.reason}(${r.count})`).join(', ');
            pdf.text(`   Principales: ${reasons}`, 20, y);
            y += 5;
        }
    });
    y += 10;

    // By Day of Week
    if (y < 250) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Por Día de la Semana', 15, y);
        y += 8;

        pdf.setFontSize(10);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        monthlyReport.byDayOfWeek.filter((d: any) => d.count > 0).forEach((d: any) => {
            pdf.setFont('helvetica', 'normal');
            pdf.text(`${d.dayName}: ${d.count} visitas`, 20, y);
            y += 5;
        });
    }

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    const dateStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    pdf.text(`Generado: ${dateStr} | Sistema de Control de Visitantes`, pageWidth / 2, 285, { align: 'center' });

    pdf.save(`reporte_mensual_${monthlyReport.period.monthName}_${monthlyReport.period.year}.pdf`);
};
