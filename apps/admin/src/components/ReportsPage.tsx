'use client';

import { useState, useMemo, useCallback } from 'react';
import { useStatsQuery, useComparisonStatsQuery, useMonthlyReportQuery, useVisitListQuery } from '../services/useAdminQueries';
import { Skeleton } from '@logmaster/ui';
import ComparisonCard from './statistics/ComparisonCard';
import ChartsRow from './statistics/ChartsRow';
import MonthlyReportCard from './statistics/MonthlyReportCard';
import { useRef } from 'react';
import type { Chart } from 'chart.js';
import type { StatsData, ComparisonStats, ReasonData, Visit } from '@logmaster/types';
import toast from 'react-hot-toast';

import Download from 'lucide-react/dist/esm/icons/download';
import FileSpreadsheet from 'lucide-react/dist/esm/icons/file-spreadsheet';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface MonthlyReport {
    totalVisits: number;
    uniqueVisitors: number;
    averageDuration: number;
    completionRate: number;
    byReason: { reason: string; count: number; percentage: number }[];
}

const ReportsPage = () => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const weekChartRef = useRef<Chart | null>(null);
    const dayChartRef = useRef<Chart | null>(null);
    const dayOfWeekChartRef = useRef<Chart | null>(null);
    const pieChartRef = useRef<Chart | null>(null);

    // Stats for the selected date range
    const { data: stats, isLoading: statsLoading } = useStatsQuery(startDate || undefined, endDate || undefined);
    const { data: comparison, isLoading: compLoading } = useComparisonStatsQuery(selectedMonth, selectedYear);
    const { data: monthlyReport } = useMonthlyReportQuery(selectedMonth, selectedYear);

    // Visit list for CSV export
    const { data: visitData } = useVisitListQuery({
        page: 1,
        limit: 1000,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
    });

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const statsData = stats as StatsData | undefined;
    const compData = comparison as ComparisonStats | undefined;
    const monthlyData = monthlyReport as MonthlyReport | undefined;

    const visitsByWeek = useMemo(() => {
        return (statsData?.byWeek || []).map((w) => {
            const datePart = typeof w.weekStart === 'string' ? w.weekStart.split('T')[0] : new Date(w.weekStart).toISOString().split('T')[0];
            const [, month, day] = datePart.split('-');
            return { label: `${parseInt(day)}/${parseInt(month)}`, count: w.count };
        });
    }, [statsData]);

    const visitsByDayOfWeek = statsData?.byDayOfWeek || [];
    const visitsPerDay = statsData?.visitsPerDay || [];
    const topReasons: ReasonData[] = (statsData?.topReasons || (statsData?.byReason || []).map((r) => ({ reason: r.purpose, count: r.count }))).map((r) => ({
        reason: r.reason,
        count: r.count,
    }));

    const handleExportPDF = useCallback(() => {
        const visits = visitData?.visits || [];
        if (visits.length === 0) {
            toast.error('No visits to export');
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFillColor(45, 212, 191);
        doc.rect(0, 0, pageWidth, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Visits Report', 15, 18);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 15, 18, { align: 'right' });

        // Filters
        let y = 40;
        doc.setTextColor(31, 41, 55);
        doc.setFontSize(10);
        if (startDate) { doc.text(`From: ${startDate}`, 15, y); y += 6; }
        if (endDate) { doc.text(`To: ${endDate}`, 15, y); y += 6; }
        doc.text(`Total visits: ${visits.length}`, 15, y); y += 10;

        // Table
        const tableData = visits.map((v: Visit) => [
            `${v.Visitor?.first_name || ''} ${v.Visitor?.last_name || ''}`.trim(),
            v.Visitor?.company || '',
            v.reason || v.purpose || '',
            v.check_in || v.check_in_time || '',
            v.check_out || v.check_out_time || '',
            v.status,
        ]);

        autoTable(doc, {
            head: [['Visitor', 'Company', 'Reason', 'Check In', 'Check Out', 'Status']],
            body: tableData,
            startY: y,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [45, 212, 191], textColor: 255 },
        });

        doc.save(`visits-report-${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success('PDF exported successfully');
    }, [visitData, startDate, endDate]);

    const handleExportCSV = useCallback(() => {
        const visits = visitData?.visits || [];
        if (visits.length === 0) {
            toast.error('No visits to export');
            return;
        }

        const headers = ['Visitor', 'Cedula', 'Company', 'Reason', 'Check In', 'Check Out', 'Status', 'Person To Visit'];
        const rows = visits.map((v: Visit) => [
            `${v.Visitor?.first_name || ''} ${v.Visitor?.last_name || ''}`.trim(),
            v.visitor_cedula,
            v.Visitor?.company || '',
            v.reason || v.purpose || '',
            v.check_in || v.check_in_time || '',
            v.check_out || v.check_out_time || '',
            v.status,
            v.personToVisit || v.person_to_visit || '',
        ]);

        const csv = [
            headers.join(','),
            ...rows.map((row: string[]) => row.map((cell: string) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `visits-report-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exported successfully');
    }, [visitData]);

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
                borderWidth: 1,
            },
        },
        scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, color: '#b1bcc6' }, grid: { color: '#1f2a33' }, border: { color: '#2e3842' } },
            x: { ticks: { color: '#7c8a97' }, grid: { display: false }, border: { color: '#2e3842' } },
        },
    };

    const tealColor = 'rgba(77, 215, 255, 0.7)';
    const tealColorHover = 'rgba(77, 215, 255, 1)';

    const weekChartData = {
        labels: visitsByWeek.map((d) => d.label),
        datasets: [{ label: 'Visitors', data: visitsByWeek.map((d) => d.count), backgroundColor: tealColor, hoverBackgroundColor: tealColorHover, borderColor: '#1c9bc0', borderWidth: 1, borderRadius: 4 }],
    };

    const dayOfWeekChartData = {
        labels: visitsByDayOfWeek.map((d) => d.dayName.substring(0, 3)),
        datasets: [{ label: 'Visitors', data: visitsByDayOfWeek.map((d) => d.count), backgroundColor: tealColor, hoverBackgroundColor: tealColorHover, borderColor: '#1c9bc0', borderWidth: 1, borderRadius: 4 }],
    };

    const perDayChartData = {
        labels: visitsPerDay.map((d) => { const date = new Date(d.date); return `${date.getDate()}/${date.getMonth() + 1}`; }),
        datasets: [{ label: 'Visitors', data: visitsPerDay.map((d) => d.count), backgroundColor: tealColor, hoverBackgroundColor: tealColorHover, borderColor: '#1c9bc0', borderWidth: 1, borderRadius: 4 }],
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Reportes</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">Generate and export visit reports</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExportPDF} className="btn-ghost px-4 py-2 text-sm flex items-center gap-2">
                        <Download size={16} /> Export PDF
                    </button>
                    <button onClick={handleExportCSV} className="btn-ghost px-4 py-2 text-sm flex items-center gap-2">
                        <FileSpreadsheet size={16} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Date range selector */}
            <div className="panel-tech rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[color:var(--text-2)] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Calendar size={16} className="text-[color:var(--accent-0)]" /> Date Range
                </h3>
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs text-[color:var(--text-3)] mb-1">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="input-tech text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-[color:var(--text-3)] mb-1">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="input-tech text-sm"
                        />
                    </div>
                    <button
                        onClick={() => { setStartDate(''); setEndDate(''); }}
                        className="btn-ghost px-4 py-2 text-sm"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Comparison card */}
            {compLoading ? (
                <div className="panel-tech rounded-lg p-5"><Skeleton height={80} /></div>
            ) : (
                <ComparisonCard comparison={compData || null} />
            )}

            {/* Charts */}
            {statsLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="panel-tech rounded-lg p-5"><Skeleton height={192} /></div>
                    ))}
                </div>
            ) : (
                <ChartsRow
                    weekChartRef={weekChartRef}
                    dayChartRef={dayChartRef}
                    dayOfWeekChartRef={dayOfWeekChartRef}
                    weekChartData={weekChartData}
                    perDayChartData={perDayChartData}
                    dayOfWeekChartData={dayOfWeekChartData}
                    chartOptions={chartOptions}
                    topReasons={topReasons}
                    visitsByWeek={visitsByWeek}
                    visitsPerDay={visitsPerDay}
                    visitsByDayOfWeek={visitsByDayOfWeek}
                />
            )}

            {/* Monthly report card */}
            <MonthlyReportCard
                monthlyReport={monthlyData || null}
                pieChartRef={pieChartRef}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                months={months}
                isLoading={statsLoading}
            />
        </div>
    );
};

export default ReportsPage;
