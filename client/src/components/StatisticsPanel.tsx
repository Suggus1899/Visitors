import { useEffect, useState, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, ChartData, ChartOptions } from 'chart.js';
import type { Chart } from 'chart.js';
import ComparisonCard from './statistics/ComparisonCard';
import ChartsRow from './statistics/ChartsRow';
import MonthlyReportCard from './statistics/MonthlyReportCard';

import { ComparisonStats, ReasonData } from '../types';
import { VisitService } from '../services/api.v1';
import toast from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface WeekData { label: string; count: number; }
interface DayOfWeekData { dayName: string; count: number; }
interface DayData { date: string; count: number; } // Removed reasons from daily as it is not provided by new API
interface MonthlyReport {
    totalVisits: number;
    uniqueVisitors: number;
    averageDuration: number;
    completionRate: number;
    byReason: { reason: string; count: number; percentage: number }[];
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

    const weekChartRef = useRef<Chart<'bar'> | null>(null);
    const dayChartRef = useRef<Chart<'bar'> | null>(null);
    const dayOfWeekChartRef = useRef<Chart<'bar'> | null>(null);
    const pieChartRef = useRef<Chart<'pie'> | null>(null);

    useEffect(() => {
        let current = true;
        setLoading(true);
        setMonthlyReport(null);
        const start = new Date(selectedYear, selectedMonth, 1).toLocaleDateString('en-CA');
        const end = new Date(selectedYear, selectedMonth + 1, 0).toLocaleDateString('en-CA');
        Promise.all([
            VisitService.getStats(start, end),
            VisitService.getComparisonStats(selectedMonth, selectedYear),
            VisitService.getMonthlyReport(selectedMonth, selectedYear),
        ]).then(([stats, compData, report]) => {
            if (!current) return;
            setVisitsByWeek((stats.byWeek || []).map(w => {
                const [, month, day] = w.weekStart.split('T')[0].split('-');
                return { label: parseInt(day) + '/' + parseInt(month), count: w.count };
            }));
            setVisitsByDayOfWeek(stats.byDayOfWeek || []);
            setVisitsPerDay(stats.visitsPerDay || []);
            setTopReasons(stats.byReason ? stats.byReason.map(r => ({ reason: r.purpose, count: r.count })) : stats.topReasons || []);
            setComparison(compData);
            setMonthlyReport(report);
        }).catch(() => {
            if (!current) return;
            setVisitsByWeek([]); setVisitsByDayOfWeek([]); setVisitsPerDay([]); setTopReasons([]); setComparison(null);
            toast.error('No se pudieron cargar las estadísticas del período seleccionado.');
        }).finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [selectedMonth, selectedYear]);

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
        labels: visitsPerDay.map(d => { const date = new Date(d.date.slice(0, 10) + 'T12:00:00'); return `${date.getDate()}/${date.getMonth() + 1}`; }),
        datasets: [{ label: 'Visitantes', data: visitsPerDay.map(d => d.count), backgroundColor: tealColor, hoverBackgroundColor: tealColorHover, borderColor: '#1c9bc0', borderWidth: 1, borderRadius: 4 }]
    };

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return (
        <div className="space-y-6 mb-8">
            <ComparisonCard comparison={comparison} />

            <ChartsRow
                period={`${months[selectedMonth]} ${selectedYear}`}
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
