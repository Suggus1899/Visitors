import React, { useState } from 'react';
import { Pie } from 'react-chartjs-2';
import Download from 'lucide-react/dist/esm/icons/download';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up';
import { downloadMonthlyPDF } from './pdfExport';

interface MonthlyReportCardProps {
    monthlyReport: any;
    pieChartRef: React.RefObject<any>;
    selectedMonth: number;
    setSelectedMonth: (month: number) => void;
    selectedYear: number;
    setSelectedYear: (year: number) => void;
    months: string[];
}

const MonthlyReportCard = ({
    monthlyReport,
    pieChartRef,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    months
}: MonthlyReportCardProps) => {
    const [showAllReasons, setShowAllReasons] = useState(false);

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
                        onClick={() => downloadMonthlyPDF(monthlyReport, pieChartRef)} 
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
                                        labels: monthlyReport.byReason.slice(0, 5).map((r: any) => r.reason),
                                        datasets: [{ data: monthlyReport.byReason.slice(0, 5).map((r: any) => r.count), backgroundColor: ['#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59'] }]
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
                                {(showAllReasons ? monthlyReport.byReason : monthlyReport.byReason.slice(0, 5)).map((r: any, i: number) => (
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
    );
};

export default MonthlyReportCard;
