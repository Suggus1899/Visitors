import { useState, useMemo, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, ChartData, ChartOptions } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { useStatsQuery, useAuditStatsQuery } from '../services/useAdminQueries';
import { Skeleton } from '@logmaster/ui';
import type { AuditStats } from '@logmaster/types';

import Calendar from 'lucide-react/dist/esm/icons/calendar';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up';
import TrendingDown from 'lucide-react/dist/esm/icons/trending-down';
import Activity from 'lucide-react/dist/esm/icons/activity';
import Users from 'lucide-react/dist/esm/icons/users';
import BarChart from 'lucide-react/dist/esm/icons/bar-chart';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface StatsSummary {
    today: { count: number; label: string };
    lastWeek: { count: number; label: string };
}

const StatisticsPage = () => {
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

    // Calculate date range based on selected period
    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        switch (period) {
            case 'today':
                return { startDate: today.toLocaleDateString('en-CA'), endDate: now.toLocaleDateString('en-CA') };
            case 'week': {
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return { startDate: weekAgo.toLocaleDateString('en-CA'), endDate: now.toLocaleDateString('en-CA') };
            }
            case 'month': {
                const monthAgo = new Date(today);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                return { startDate: monthAgo.toLocaleDateString('en-CA'), endDate: now.toLocaleDateString('en-CA') };
            }
        }
    }, [period]);

    const { data: stats, isLoading: statsLoading } = useStatsQuery(startDate, endDate);
    const { data: auditStats, isLoading: auditLoading } = useAuditStatsQuery();

    const loading = statsLoading || auditLoading;

    // Compute summary stats
    const summary: StatsSummary = useMemo(() => {
        const today = new Date().toDateString();
        const visitsPerDay = stats?.visitsPerDay || [];
        const todayCount = visitsPerDay.filter((d: { date: string; count: number }) => new Date(d.date).toDateString() === today).reduce((a: number, b: { count: number }) => a + b.count, 0);
        const last7Days = visitsPerDay.slice(-7).reduce((a: number, b: { count: number }) => a + b.count, 0);
        return {
            today: { count: todayCount, label: 'Today' },
            lastWeek: { count: last7Days, label: 'Last 7 days' },
        };
    }, [stats]);

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
                borderWidth: 1,
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { stepSize: 1, color: '#b1bcc6' },
                grid: { color: '#1f2a33' },
                border: { color: '#2e3842' },
            },
            x: {
                ticks: { color: '#7c8a97' },
                grid: { display: false },
                border: { color: '#2e3842' },
            },
        },
    };

    const tealColor = 'rgba(77, 215, 255, 0.7)';
    const tealColorHover = 'rgba(77, 215, 255, 1)';

    const visitsPerDayData: ChartData<'bar'> = {
        labels: (stats?.visitsPerDay || []).map((d: { date: string; count: number }) => {
            const date = new Date(d.date);
            return `${date.getDate()}/${date.getMonth() + 1}`;
        }),
        datasets: [{
            label: 'Visits',
            data: (stats?.visitsPerDay || []).map((d: { count: number }) => d.count),
            backgroundColor: tealColor,
            hoverBackgroundColor: tealColorHover,
            borderColor: '#1c9bc0',
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    const topReasonsData: ChartData<'pie'> = {
        labels: (stats?.topReasons || []).map((r: { reason: string; count: number }) => r.reason),
        datasets: [{
            data: (stats?.topReasons || []).map((r: { count: number }) => r.count),
            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
            borderWidth: 0,
        }],
    };

    const byDayOfWeekData: ChartData<'bar'> = {
        labels: (stats?.byDayOfWeek || []).map((d: { dayName: string; count: number }) => d.dayName.substring(0, 3)),
        datasets: [{
            label: 'Visits',
            data: (stats?.byDayOfWeek || []).map((d: { count: number }) => d.count),
            backgroundColor: tealColor,
            hoverBackgroundColor: tealColorHover,
            borderColor: '#1c9bc0',
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    const audit = auditStats as AuditStats | undefined;

    const dailyActivityData: ChartData<'bar'> = {
        labels: (audit?.lastWeek?.dailyActivity || []).map((d) => {
            const date = new Date(d.date);
            return `${date.getDate()}/${date.getMonth() + 1}`;
        }),
        datasets: [{
            label: 'Actions',
            data: (audit?.lastWeek?.dailyActivity || []).map((d) => d.count),
            backgroundColor: 'rgba(167, 139, 250, 0.7)',
            hoverBackgroundColor: 'rgba(167, 139, 250, 1)',
            borderColor: '#7c3aed',
            borderWidth: 1,
            borderRadius: 4,
        }],
    };

    const periodButtons = [
        { value: 'today' as const, label: 'Today' },
        { value: 'week' as const, label: 'Last 7 days' },
        { value: 'month' as const, label: 'Last 30 days' },
    ];

    const StatCard = ({ icon: Icon, label, value, color, loading: cardLoading }: {
        icon: React.ElementType;
        label: string;
        value: number;
        color: string;
        loading?: boolean;
    }) => (
        <div className={`panel-tech p-5 rounded-xl border-l-2 ${color}`}>
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-[0.2em]">{label}</h3>
                    {cardLoading ? (
                        <div className="mt-2"><Skeleton variant="text" width={60} height={28} /></div>
                    ) : (
                        <p className="text-3xl font-bold text-[color:var(--text-1)] mt-1">{value}</p>
                    )}
                </div>
                <div className="p-3 rounded-xl bg-[color:var(--surface-2)]">
                    <Icon size={24} className={color.includes('emerald') ? 'text-emerald-400' : color.includes('amber') ? 'text-amber-400' : color.includes('violet') ? 'text-violet-400' : 'text-[color:var(--accent-0)]'} />
                </div>
            </div>
        </div>
    );

    const ChartCard = ({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon: React.ElementType }) => (
        <div className="panel-tech rounded-xl p-5">
            <h3 className="font-semibold text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                <Icon size={18} className="text-[color:var(--accent-0)]" />
                {title}
            </h3>
            <div className="h-56">{children}</div>
        </div>
    );

    // Comparison with previous period
    const previousPeriodComparison = useCallback(() => {
        const current = summary.lastWeek.count;
        // TODO: Fetch previous period stats for real comparison
        const previous = Math.round(current * 0.85); // Mock: assume 15% growth
        const growth = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        return { current, previous, growth };
    }, [summary]);

    const comparison = previousPeriodComparison();

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Estadísticas</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">Activity statistics and trends</p>
                </div>
                <div className="flex bg-[color:var(--surface-2)] rounded-lg p-1 border border-[color:var(--border-1)]">
                    {periodButtons.map((btn) => (
                        <button
                            key={btn.value}
                            onClick={() => setPeriod(btn.value)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                                period === btn.value
                                    ? 'bg-[color:var(--surface-1)] text-[color:var(--accent-0)] shadow-sm'
                                    : 'text-[color:var(--text-3)] hover:text-[color:var(--text-1)]'
                            }`}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Calendar} label="Visits Today" value={summary.today.count} color="border-[color:var(--accent-0)]" loading={loading} />
                <StatCard icon={Activity} label="Last 7 Days" value={summary.lastWeek.count} color="border-emerald-400" loading={loading} />
                <StatCard icon={Users} label="Unique Users (today)" value={audit?.today?.uniqueUsers ?? 0} color="border-amber-400" loading={loading} />
                <StatCard icon={BarChart} label="Actions (today)" value={audit?.today?.actions ?? 0} color="border-violet-400" loading={loading} />
            </div>

            {/* Comparison card */}
            <div className="panel-tech rounded-xl p-5 border-l-4 border-[color:var(--accent-0)]">
                <h3 className="font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-[color:var(--accent-0)]" /> Period Comparison
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col">
                        <span className="text-sm text-[color:var(--text-3)]">Current Period</span>
                        <span className="text-2xl font-bold text-[color:var(--text-1)]">{comparison.current}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm text-[color:var(--text-3)]">Previous Period</span>
                        <span className="text-2xl font-bold text-[color:var(--text-2)]">{comparison.previous}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm text-[color:var(--text-3)]">Growth</span>
                        <span className={`text-2xl font-bold flex items-center gap-1 ${comparison.growth >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                            {comparison.growth >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                            {comparison.growth > 0 ? '+' : ''}{comparison.growth.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Charts */}
            {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="panel-tech rounded-xl p-5"><Skeleton height={224} /></div>
                    <div className="panel-tech rounded-xl p-5"><Skeleton height={224} /></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ChartCard title="Visits per Day" icon={Calendar}>
                        <Bar data={visitsPerDayData} options={chartOptions} />
                    </ChartCard>
                    <ChartCard title="Visits by Day of Week" icon={BarChart}>
                        <Bar data={byDayOfWeekData} options={chartOptions} />
                    </ChartCard>
                    <ChartCard title="Top Reasons" icon={Activity}>
                        {(stats?.topReasons || []).length > 0 ? (
                            <Pie data={topReasonsData} options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { position: 'bottom', labels: { color: '#b1bcc6', padding: 15, font: { size: 11 } } },
                                },
                            }} />
                        ) : (
                            <div className="h-full flex items-center justify-center text-[color:var(--text-3)] text-sm">
                                No data available
                            </div>
                        )}
                    </ChartCard>
                    <ChartCard title="Daily Activity (Audit)" icon={Users}>
                        {(audit?.lastWeek?.dailyActivity || []).length > 0 ? (
                            <Bar data={dailyActivityData} options={chartOptions} />
                        ) : (
                            <div className="h-full flex items-center justify-center text-[color:var(--text-3)] text-sm">
                                No activity data available
                            </div>
                        )}
                    </ChartCard>
                </div>
            )}
        </div>
    );
};

export default StatisticsPage;
