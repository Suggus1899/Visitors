import React, { useState, useCallback, useMemo } from 'react';
import { Pie } from 'react-chartjs-2';
import Download from 'lucide-react/dist/esm/icons/download';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up';
import { downloadMonthlyPDF } from './pdfExport';

interface MonthlyReportData {
    totalVisits: number;
    uniqueVisitors: number;
    averageDuration: number;
    completionRate: number;
    byReason: Array<{
        reason: string;
        count: number;
        percentage: number;
    }>;
}

interface MonthlyReportCardProps {
    monthlyReport: MonthlyReportData | null;
    pieChartRef: React.RefObject<any>;
    selectedMonth: number;
    setSelectedMonth: (month: number) => void;
    selectedYear: number;
    setSelectedYear: (year: number) => void;
    months: string[];
    isLoading?: boolean;
}

const MonthlyReportCard = ({
    monthlyReport,
    pieChartRef,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    months,
    isLoading = false
}: MonthlyReportCardProps) => {
    const [showAllReasons, setShowAllReasons] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Memoize chart data to prevent unnecessary re-renders
    const chartData = useMemo(() => {
        if (!monthlyReport?.byReason) return null;
        
        return {
            labels: monthlyReport.byReason.map(item => item.reason),
            datasets: [{
                data: monthlyReport.byReason.map(item => item.count),
                backgroundColor: [
                    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
                ],
                borderWidth: 0,
            }]
        };
    }, [monthlyReport?.byReason]);

    // Memoize displayed reasons to optimize rendering
    const displayedReasons = useMemo(() => {
        if (!monthlyReport?.byReason) return [];
        return showAllReasons 
            ? monthlyReport.byReason 
            : monthlyReport.byReason.slice(0, 5);
    }, [monthlyReport?.byReason, showAllReasons]);

    // Optimized download handler with loading state
    const handleDownloadPDF = useCallback(async () => {
        if (!monthlyReport || isDownloading) return;
        
        setIsDownloading(true);
        try {
            await downloadMonthlyPDF(monthlyReport, pieChartRef);
        } catch (error) {
            console.error('Error downloading PDF:', error);
        } finally {
            setIsDownloading(false);
        }
    }, [monthlyReport, pieChartRef, isDownloading]);

    // Optimized month/year handlers
    const handleMonthChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedMonth(parseInt(e.target.value));
        setShowAllReasons(false); // Reset when changing period
    }, [setSelectedMonth]);

    const handleYearChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedYear(parseInt(e.target.value));
        setShowAllReasons(false); // Reset when changing period
    }, [setSelectedYear]);

    // Generate year options dynamically
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let year = currentYear - 2; year <= currentYear + 2; year++) {
            years.push(year);
        }
        return years;
    }, []);

    return (
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
                            onChange={handleMonthChange} 
                            disabled={isLoading}
                            className="bg-transparent border-none text-sm font-medium text-[color:var(--text-2)] focus:ring-0 cursor-pointer py-1 pl-3 pr-8 rounded-full hover:bg-[color:var(--surface-2)] transition-colors disabled:opacity-50"
                        >
                            {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <div className="w-px h-4 bg-[color:var(--border-1)] mx-1"></div>
                        <select 
                            value={selectedYear} 
                            onChange={handleYearChange} 
                            disabled={isLoading}
                            className="bg-transparent border-none text-sm font-medium text-[color:var(--text-2)] focus:ring-0 cursor-pointer py-1 pl-3 pr-8 rounded-full hover:bg-[color:var(--surface-2)] transition-colors disabled:opacity-50"
                        >
                            {yearOptions.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>

                    <button 
                        onClick={handleDownloadPDF} 
                        disabled={!monthlyReport || isDownloading || isLoading}
                        className="btn-ghost px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Download size={16} className={isDownloading ? 'animate-spin' : ''} />
                        <span>{isDownloading ? 'Generando...' : 'Descargar PDF'}</span>
                    </button>
                </div>
            </div>

            {monthlyReport && (
                <div className="p-6 space-y-8">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                            <span className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-wider mb-1">Total Visitas</span>
                            <span className="text-3xl font-black text-[color:var(--text-1)]">{monthlyReport.totalVisits || 0}</span>
                        </div>
                        <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                            <span className="text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-1">Completadas</span>
                            <span className="text-3xl font-black text-emerald-300">{monthlyReport.completionRate || 0}%</span>
                        </div>
                        <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                            <span className="text-sky-300 text-xs font-semibold uppercase tracking-wider mb-1">Visitantes Únicos</span>
                            <span className="text-3xl font-black text-sky-300">{monthlyReport.uniqueVisitors || 0}</span>
                        </div>
                        <div className="bg-[color:var(--surface-2)] rounded-2xl p-4 border border-[color:var(--border-1)] flex flex-col items-center justify-center text-center">
                            <span className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-wider mb-1">Duración Promedio</span>
                            <span className="text-3xl font-black text-[color:var(--text-2)]">{Math.round(monthlyReport.averageDuration || 0)}m</span>
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
                                {chartData ? (
                                    <Pie 
                                        ref={pieChartRef} 
                                        data={chartData} 
                                        options={{ 
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            plugins: { 
                                                legend: { 
                                                    position: 'bottom', 
                                                    labels: { 
                                                        usePointStyle: true, 
                                                        padding: 20, 
                                                        font: { size: 11, family: '"IBM Plex Sans"' },
                                                        color: 'rgba(255, 255, 255, 0.7)'
                                                    } 
                                                },
                                                tooltip: {
                                                    callbacks: {
                                                        label: (context) => {
                                                            const label = context.label || '';
                                                            const value = context.parsed || 0;
                                                            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                                                            const percentage = ((value / total) * 100).toFixed(1);
                                                            return `${label}: ${value} (${percentage}%)`;
                                                        }
                                                    }
                                                }
                                            }, 
                                            layout: { padding: 10 }
                                        }} 
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-[color:var(--text-3)] text-sm">
                                        {isLoading ? 'Cargando datos...' : 'No hay datos suficientes para mostrar el gráfico'}
                                    </div>
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
                                {displayedReasons.map((reason, index) => (
                                    <div key={`${reason.reason}-${index}`} className="group">
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="font-medium text-[color:var(--text-2)] group-hover:text-[color:var(--text-1)] transition-colors">
                                                {reason.reason}
                                            </span>
                                            <div className="text-right">
                                                <span className="font-bold text-[color:var(--text-1)]">{reason.count}</span>
                                                <span className="text-xs text-[color:var(--text-3)] ml-1 font-medium">
                                                    {reason.percentage.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full h-2.5 bg-[color:var(--surface-2)] rounded-full overflow-hidden border border-[color:var(--border-1)]">
                                            <div 
                                                className="h-full bg-gradient-to-r from-[color:var(--accent-0)] to-[color:var(--accent-1)] rounded-full transition-all duration-500 relative"
                                                style={{ width: `${Math.max(reason.percentage, 2)}%` }}
                                            >
                                                <div className="absolute inset-0 bg-white/10 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                
                                {monthlyReport?.byReason && monthlyReport.byReason.length > 5 && (
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
    );
};

export default MonthlyReportCard;
