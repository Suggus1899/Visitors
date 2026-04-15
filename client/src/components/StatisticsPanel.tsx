import { useEffect, useState, useRef, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartData, ArcElement, ChartOptions } from 'chart.js';
import ComparisonCard from './statistics/ComparisonCard';
import ChartsRow from './statistics/ChartsRow';
import MonthlyReportCard from './statistics/MonthlyReportCard';

import { StatsData, ComparisonStats, ReasonData } from '../types';
import { VisitService } from '../services/api.v1';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface WeekData { label: string; count: number; }
interface DayOfWeekData { dayName: string; count: number; }
interface DayData { date: string; count: number; } // Removed reasons from daily as it is not provided by new API
interface MonthlyReport {
    period: { month: number; monthName: string; year: number };
    summary: { totalVisits: number; completedVisits: number; activeVisits: number; avgVisitsPerDay: string };
    byReason: { reason: string; count: number; percentage: number }[];
    byWeek: { weekStart: string; count: number; topReasons: ReasonData[] }[];
    byDayOfWeek: { day: number; dayName: string; count: number; topReasons: ReasonData[] }[];
}

const StatisticsPanel = () => {
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
            const report = await VisitService.getMonthlyReport(selectedMonth, selectedYear);
            setMonthlyReport(report as MonthlyReport);
        } catch { /* errors handled via loading state */ }
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
                setVisitsByWeek(weekData);
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

        } catch {
            // errors handled via loading state
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, selectedYear]);

    useEffect(() => { 
        fetchAllStats(); 
        fetchMonthlyReport();
    }, [fetchAllStats, fetchMonthlyReport]);

    if (loading) return <div className="text-center py-8 text-[color:var(--text-3)]">Cargando estadísticas...</div>;

    const chartOptions: ChartOptions<'bar'> = {
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

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return (
        <div className="space-y-6 mb-8">
            <ComparisonCard comparison={comparison} />

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

            <MonthlyReportCard 
                monthlyReport={monthlyReport}
                pieChartRef={pieChartRef}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                months={months}
            />
        </div>
    );
};

export default StatisticsPanel;
