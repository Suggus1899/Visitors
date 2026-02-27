import { useEffect, useState, useRef, useCallback } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartData, ArcElement } from 'chart.js';
import Download from 'lucide-react/dist/esm/icons/download';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import TrendingUpIcon from 'lucide-react/dist/esm/icons/trending-up';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up';

import { jsPDF } from 'jspdf';
import { StatsData, ComparisonStats } from '../types';
import { VisitService } from '../services/api.v1';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface WeekData { label: string; count: number; }
interface DayOfWeekData { dayName: string; count: number; }
interface ReasonData { reason: string; count: number; }
interface DayData { date: string; count: number; } // Removed reasons from daily as it is not provided by new API
interface MonthlyReport {
    period: { month: number; monthName: string; year: number };
    summary: { totalVisits: number; completedVisits: number; activeVisits: number; avgVisitsPerDay: string };
    byReason: { reason: string; count: number; percentage: number }[];
    byWeek: { weekStart: string; count: number; topReasons: ReasonData[] }[];
    byDayOfWeek: { day: number; dayName: string; count: number; topReasons: ReasonData[] }[];
}

const StatisticsPanel = () => {
    const [showAllReasons, setShowAllReasons] = useState(false);
    const [visitsByWeek, setVisitsByWeek] = useState<WeekData[]>([]);
    const [visitsByDayOfWeek, setVisitsByDayOfWeek] = useState<DayOfWeekData[]>([]);
    const [visitsPerDay, setVisitsPerDay] = useState<DayData[]>([]);
    const [topReasons, setTopReasons] = useState<ReasonData[]>([]); // New state for global top reasons
    const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
    const [comparison, setComparison] = useState<ComparisonStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weekChartRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayChartRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayOfWeekChartRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pieChartRef = useRef<any>(null);

    const fetchMonthlyReport = useCallback(async () => {
        try {
            const report = await VisitService.getMonthlyReport(selectedMonth, selectedYear); // Backend expects 0-11
            setMonthlyReport(report as MonthlyReport);
        } catch (err) { console.error('Error fetching monthly report:', err); }
    }, [selectedMonth, selectedYear]);

    const fetchAllStats = useCallback(async () => {
        setLoading(true);
        try {
            // Calculate start and end of selected month
            // Backend expects 0-based month for getMonthlyReport, but standard Date for getStats
            const start = new Date(selectedYear, selectedMonth, 1);
            const end = new Date(selectedYear, selectedMonth + 1, 0); // Last day of month
            
            // Format as YYYY-MM-DD for API
            // Adjust for timezone to avoid off-by-one errors when converting to string
            const startStr = start.toLocaleDateString('en-CA'); // YYYY-MM-DD
            const endStr = end.toLocaleDateString('en-CA');

            // Fetch main stats and comparison
            const [stats, compData] = await Promise.all([
                VisitService.getStats(startStr, endStr),
                VisitService.getComparisonStats(selectedMonth, selectedYear)
            ]) as [StatsData, ComparisonStats];

            // Map Backend DTO to Frontend State
            if (stats) {
                console.log('Stats received:', stats);
                // By Week
                const weekData = (stats.byWeek || []).map(w => {
                    // Parse "2026-02-01T04:00:00.000Z" directly as string to avoid timezone shifts
                    // Extract YYYY-MM-DD
                    const datePart = (typeof w.weekStart === 'string') 
                        ? w.weekStart.split('T')[0] 
                        : new Date(w.weekStart).toISOString().split('T')[0];
                        
                    const [, month, day] = datePart.split('-');
                    return {
                        label: `${parseInt(day)}/${parseInt(month)}`,
                        count: w.count
                    };
                });
                console.log('Mapped Week Data Robust:', weekData);
                setVisitsByWeek(weekData);

                // By Day of Week
                setVisitsByDayOfWeek(stats.byDayOfWeek || []);

                // Recent Activity (Per Day)
                setVisitsPerDay(stats.visitsPerDay || []);
                setTopReasons(stats.topReasons || []);

                // Global Top Reasons (from byReason summary)
                if (stats.byReason) {
                    const reasons: ReasonData[] = stats.byReason.map(r => ({
                        reason: r.purpose,
                        count: r.count
                    }));
                    setTopReasons(reasons);
                }
            }

            if (compData) {
                setComparison(compData);
            }

        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, selectedYear]);

    useEffect(() => { 
        fetchAllStats(); 
        fetchMonthlyReport();
    }, [fetchAllStats, fetchMonthlyReport]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadChartPDF = (chartRef: React.RefObject<any>, filename: string, title: string, data: { labels: string[], values: number[] }, reasons?: ReasonData[]) => {
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

    const downloadMonthlyPDF = () => {
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
        monthlyReport.byReason.forEach(r => {
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
        monthlyReport.byWeek.forEach(w => {
            const weekDate = new Date(w.weekStart);
            const weekLabel = `Semana del ${weekDate.getDate()}/${weekDate.getMonth() + 1}`;
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${weekLabel}: ${w.count} visitas`, 20, y);
            y += 5;
            if (w.topReasons.length > 0) {
                pdf.setFont('helvetica', 'normal');
                const reasons = w.topReasons.map(r => `${r.reason}(${r.count})`).join(', ');
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
            monthlyReport.byDayOfWeek.filter(d => d.count > 0).forEach(d => {
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

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#0f1418',
                titleColor: '#e5edf5',
                bodyColor: '#b1bcc6',
                borderColor: '#2e3842',
                borderWidth: 1
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { stepSize: 1, color: '#b1bcc6' },
                grid: { color: '#1f2a33' },
                border: { color: '#2e3842' }
            },
            x: {
                ticks: { color: '#7c8a97' },
                grid: { display: false },
                border: { color: '#2e3842' }
            }
        }
    };

    const tealColor = 'rgba(77, 215, 255, 0.7)';
    const tealColorHover = 'rgba(77, 215, 255, 1)';

    const weekChartData: ChartData<'bar'> = {
        labels: visitsByWeek.map(d => d.label),
        datasets: [{ label: 'Visitantes', data: visitsByWeek.map(d => d.count), backgroundColor: tealColor, hoverBackgroundColor: tealColorHover, borderColor: '#1c9bc0', borderWidth: 1, borderRadius: 4 }]
    };

    const dayOfWeekChartData: ChartData<'bar'> = {
        labels: visitsByDayOfWeek.map(d => d.dayName.substring(0, 3)),
        datasets: [{ label: 'Visitantes', data: visitsByDayOfWeek.map(d => d.count), backgroundColor: tealColor, hoverBackgroundColor: tealColorHover, borderColor: '#1c9bc0', borderWidth: 1, borderRadius: 4 }]
    };

    const perDayChartData: ChartData<'bar'> = {
        labels: visitsPerDay.map(d => { const date = new Date(d.date); return `${date.getDate()}/${date.getMonth() + 1}`; }),
        datasets: [{ label: 'Visitantes', data: visitsPerDay.map(d => d.count), backgroundColor: tealColor, hoverBackgroundColor: tealColorHover, borderColor: '#1c9bc0', borderWidth: 1, borderRadius: 4 }]
    };

    // const reasonPieData: ChartData<'pie'> = {
    //     labels: topReasons.slice(0, 5).map(r => r.reason),
    //     datasets: [{ data: topReasons.slice(0, 5).map(r => r.count), backgroundColor: ['#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59'] }]
    // };

    if (loading) return <div className="text-center py-8 text-[color:var(--text-3)]">Cargando estadísticas...</div>;

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return (
        <div className="space-y-6 mb-8">
            {/* Comparison Section */}
            {comparison && (
                <div className="panel-tech rounded-lg p-5 border-l-4 border-[color:var(--accent-0)]">
                    <h3 className="font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                        <TrendingUpIcon size={20} className="text-[color:var(--accent-0)]" /> Comparativa vs Mes Anterior
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex flex-col">
                            <span className="text-sm text-[color:var(--text-3)]">Total Visitas (Mes Actual)</span>
                            <span className="text-2xl font-bold text-[color:var(--text-1)]">{comparison.summary.currentMonth}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm text-[color:var(--text-3)]">Total Visitas (Mes Anterior)</span>
                            <span className="text-2xl font-bold text-[color:var(--text-2)]">{comparison.summary.lastMonth}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm text-[color:var(--text-3)]">Crecimiento</span>
                            <span className={`text-2xl font-bold ${comparison.summary.growth >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                {comparison.summary.growth > 0 ? '+' : ''}{comparison.summary.growth.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="panel-tech rounded-lg p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-[color:var(--text-1)]">Visitantes por semana</h3>
                        <button onClick={() => downloadChartPDF(weekChartRef, 'visitantes_semana', 'Visitantes por Semana', { labels: visitsByWeek.map(d => d.label), values: visitsByWeek.map(d => d.count) }, topReasons)} className="btn-ghost px-2 py-2" title="Descargar PDF"><Download size={18} /></button>
                    </div>
                    <div className="h-48"><Bar ref={weekChartRef} data={weekChartData} options={chartOptions} /></div>
                    <div className="flex items-center mt-3 p-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded text-xs text-[color:var(--text-3)]"><AlertTriangle size={14} className="mr-2" />Semanas parciales incluidas.</div>
                </div>

                <div className="panel-tech rounded-lg p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-[color:var(--text-1)]">Visitantes por día</h3>
                        <button onClick={() => downloadChartPDF(dayChartRef, 'visitantes_dia', 'Visitantes por Día', { labels: visitsPerDay.map(d => new Date(d.date).toLocaleDateString('es-ES')), values: visitsPerDay.map(d => d.count) }, topReasons)} className="btn-ghost px-2 py-2" title="Descargar PDF"><Download size={18} /></button>
                    </div>
                    <div className="h-48"><Bar ref={dayChartRef} data={perDayChartData} options={chartOptions} /></div>
                </div>

                <div className="panel-tech rounded-lg p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-[color:var(--text-1)]">Por día de semana</h3>
                        <button onClick={() => downloadChartPDF(dayOfWeekChartRef, 'visitantes_dia_semana', 'Por Día de la Semana', { labels: visitsByDayOfWeek.map(d => d.dayName), values: visitsByDayOfWeek.map(d => d.count) }, topReasons)} className="btn-ghost px-2 py-2" title="Descargar PDF"><Download size={18} /></button>
                    </div>
                    <div className="h-48"><Bar ref={dayOfWeekChartRef} data={dayOfWeekChartData} options={chartOptions} /></div>
                </div>
            </div>

            {/* Monthly Report Section - Executive Style */}
            <div className="panel-tech rounded-2xl border border-[color:var(--border-1)] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-[color:var(--border-1)] flex flex-col md:flex-row justify-between items-center gap-4 bg-[color:var(--surface-2)]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[color:var(--surface-1)] text-[color:var(--accent-0)] rounded-lg border border-[color:var(--border-1)]">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Reporte Mensual</h3>
                            <p className="text-xs text-[color:var(--text-3)] font-medium">Resumen ejecutivo de actividad</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="flex items-center bg-[color:var(--surface-1)] border border-[color:var(--border-1)] rounded-full px-1 p-1">
                            <select 
                                value={selectedMonth} 
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))} 
                                className="bg-transparent border-none text-sm font-medium text-[color:var(--text-2)] focus:ring-0 cursor-pointer py-1 pl-3 pr-8 rounded-full hover:bg-[color:var(--surface-2)] transition-colors"
                            >
                                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                            <div className="w-px h-4 bg-[color:var(--border-1)] mx-1"></div>
                            <select 
                                value={selectedYear} 
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))} 
                                className="bg-transparent border-none text-sm font-medium text-[color:var(--text-2)] focus:ring-0 cursor-pointer py-1 pl-3 pr-8 rounded-full hover:bg-[color:var(--surface-2)] transition-colors"
                            >
                                <option value={2025}>2025</option>
                                <option value={2026}>2026</option>
                            </select>
                        </div>

                        <button 
                            onClick={downloadMonthlyPDF} 
                            disabled={!monthlyReport}
                            className="btn-ghost px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Download size={16} />
                            <span>Descargar PDF</span>
                        </button>
                    </div>
                </div>

                {monthlyReport && (
                    <div className="p-6 space-y-8">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                                <span className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-wider mb-1">Total Visitas</span>
                                <span className="text-3xl font-black text-[color:var(--text-1)]">{monthlyReport.summary.totalVisits}</span>
                            </div>
                            <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                                <span className="text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-1">Completadas</span>
                                <span className="text-3xl font-black text-emerald-300">{monthlyReport.summary.completedVisits}</span>
                            </div>
                            <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                                <span className="text-sky-300 text-xs font-semibold uppercase tracking-wider mb-1">Activas</span>
                                <span className="text-3xl font-black text-sky-300">{monthlyReport.summary.activeVisits}</span>
                            </div>
                            <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                                <span className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-wider mb-1">Promedio Diario</span>
                                <span className="text-3xl font-black text-[color:var(--text-2)]">{monthlyReport.summary.avgVisitsPerDay}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                             {/* Reasons Pie Chart */}
                            <div className="lg:col-span-1 bg-[color:var(--surface-2)] rounded-2xl p-4 flex flex-col border border-[color:var(--border-1)]">
                                <h4 className="font-bold text-[color:var(--text-1)] mb-6 flex items-center gap-2">
                                    <span className="w-1.5 h-6 bg-[color:var(--accent-0)] rounded-full"></span>
                                    Distribución por Motivo
                                </h4>
                                <div className="h-64 relative">
                                    {monthlyReport && monthlyReport.byReason && monthlyReport.byReason.length > 0 ? (
                                        <Pie ref={pieChartRef} data={{
                                            labels: monthlyReport.byReason.slice(0, 5).map(r => r.reason),
                                            datasets: [{ data: monthlyReport.byReason.slice(0, 5).map(r => r.count), backgroundColor: ['#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59'] }]
                                        }} options={{ 
                                            plugins: { 
                                                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { size: 11, family: '"IBM Plex Sans"' } } } 
                                            }, 
                                            maintainAspectRatio: false,
                                            layout: { padding: 10 }
                                        }} />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-[color:var(--text-3)] text-sm">No hay datos suficientes para mostrar el gráfico</div>
                                    )}
                                </div>
                            </div>

                            {/* Top Reasons List with Progress Bars */}
                            <div className="lg:col-span-2">
                                <h4 className="font-bold text-[color:var(--text-1)] mb-6 flex items-center gap-2">
                                    <span className="w-1.5 h-6 bg-[color:var(--accent-1)] rounded-full"></span>
                                    Detalle de Motivos
                                </h4>
                                <div className="space-y-4">
                                    {(showAllReasons ? monthlyReport.byReason : monthlyReport.byReason.slice(0, 5)).map((r, i) => (
                                        <div key={i} className="group">
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="font-medium text-[color:var(--text-2)] group-hover:text-[color:var(--text-1)] transition-colors">{r.reason}</span>
                                                <div className="text-right">
                                                    <span className="font-bold text-[color:var(--text-1)]">{r.count}</span>
                                                    <span className="text-xs text-[color:var(--text-3)] ml-1 font-medium">{r.percentage}%</span>
                                                </div>
                                            </div>
                                            <div className="w-full h-2.5 bg-[color:var(--surface-2)] rounded-full overflow-hidden border border-[color:var(--border-1)]">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-[color:var(--accent-0)] to-[color:var(--accent-1)] rounded-full transition-all duration-500 relative"
                                                    style={{ width: `${Math.max(r.percentage, 2)}%` }}
                                                >
                                                    <div className="absolute inset-0 bg-white/10 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {monthlyReport.byReason.length > 5 && (
                                        <button 
                                            onClick={() => setShowAllReasons(!showAllReasons)}
                                            className="w-full mt-4 flex items-center justify-center gap-2 text-sm font-medium text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] hover:bg-[color:var(--surface-2)] py-2 rounded-lg transition-all"
                                        >
                                            {showAllReasons ? (
                                                <>
                                                    <span>Ver menos</span>
                                                    <ChevronUp size={16} />
                                                </>
                                            ) : (
                                                <>
                                                    <span>Ver todos ({monthlyReport.byReason.length})</span>
                                                    <ChevronDown size={16} />
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatisticsPanel;
