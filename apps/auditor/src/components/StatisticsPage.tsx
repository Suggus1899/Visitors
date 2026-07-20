import { useMemo, useState } from 'react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { BarChart3, Download, TrendingUp, Users, Activity, Globe } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useAuditStatsQuery, useAuditLogsQuery } from '../hooks/useAuditQueries';
import { PageHeader } from './common/PageHeader';
import { StatCard } from './common/StatCard';
import { ErrorState } from './common/ErrorState';
import { SkeletonCard } from '@logmaster/ui';
import { baseChartOptions, chartAccentColor } from '../utils/chartSetup';
import { downloadBlob } from '../utils/helpers';
import toast from 'react-hot-toast';
import type { AuditLog } from '../types';

const ACTION_COLORS: Record<string, string> = {
    LOGIN: '#4dd7ff',
    LOGOUT: '#7c8a97',
    CREATE: '#22c55e',
    UPDATE: '#f59e0b',
    DELETE: '#ef4444',
    CHECKOUT: '#38bdf8',
    BACKUP: '#4dd7ff',
    EXPORT: '#a78bfa',
};

export const StatisticsPage = () => {
    const { currentTenant } = useTenant();
    const tenantSlug = currentTenant?.slug ?? null;

    const statsQuery = useAuditStatsQuery(tenantSlug);
    const logsQuery = useAuditLogsQuery(tenantSlug, { page: 1, limit: 500 });

    const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

    const stats = statsQuery.data;
    const logs = logsQuery.data?.logs ?? [];

    // Action distribution
    const actionDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        logs.forEach((log: AuditLog) => {
            counts[log.action] = (counts[log.action] ?? 0) + 1;
        });
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return {
            labels: entries.map((e) => e[0]),
            datasets: [
                {
                    label: 'Count',
                    data: entries.map((e) => e[1]),
                    backgroundColor: entries.map((e) => ACTION_COLORS[e[0]] ?? chartAccentColor),
                    borderColor: entries.map((e) => ACTION_COLORS[e[0]] ?? chartAccentColor),
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        };
    }, [logs]);

    // User activity distribution
    const userActivity = useMemo(() => {
        const counts: Record<string, number> = {};
        logs.forEach((log: AuditLog) => {
            counts[log.username] = (counts[log.username] ?? 0) + 1;
        });
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return {
            labels: entries.map((e) => e[0]),
            datasets: [
                {
                    label: 'Actions',
                    data: entries.map((e) => e[1]),
                    backgroundColor: 'rgba(77, 215, 255, 0.6)',
                    borderColor: chartAccentColor,
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        };
    }, [logs]);

    // Daily activity trend
    const dailyTrend = useMemo(() => {
        const items: { date: string; count: number }[] = stats?.lastWeek?.dailyActivity ?? [];
        return {
            labels: items.map((d: { date: string; count: number }) =>
                new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
            ),
            datasets: [
                {
                    label: 'Daily Actions',
                    data: items.map((d: { date: string; count: number }) => d.count),
                    backgroundColor: 'rgba(77, 215, 255, 0.2)',
                    borderColor: chartAccentColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: chartAccentColor,
                    pointRadius: 4,
                },
            ],
        };
    }, [stats]);

    // IP distribution
    const ipDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        logs.forEach((log: AuditLog) => {
            const ip = log.ipAddress || 'Unknown';
            counts[ip] = (counts[ip] ?? 0) + 1;
        });
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return {
            labels: entries.map((e) => e[0]),
            datasets: [
                {
                    data: entries.map((e) => e[1]),
                    backgroundColor: entries.map((_, i) => {
                        const palette = ['#4dd7ff', '#22c55e', '#f59e0b', '#a78bfa', '#38bdf8', '#ef4444', '#7c8a97', '#f472b6'];
                        return palette[i % palette.length];
                    }),
                    borderWidth: 1,
                },
            ],
        };
    }, [logs]);

    const handleExport = () => {
        const data = {
            generatedAt: new Date().toISOString(),
            stats,
            actionDistribution: actionDistribution.labels.reduce(
                (acc, label, i) => ({ ...acc, [label]: actionDistribution.datasets[0].data[i] }),
                {} as Record<string, number>,
            ),
            topUsers: userActivity.labels.reduce(
                (acc, label, i) => ({ ...acc, [label]: userActivity.datasets[0].data[i] }),
                {} as Record<string, number>,
            ),
        };
        downloadBlob(
            new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
            `audit_statistics_${new Date().toISOString().split('T')[0]}.json`,
        );
        toast.success('Statistics exported');
    };

    if (statsQuery.isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="Statistics" subtitle="Detailed audit statistics and trends" icon={BarChart3} />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
                </div>
            </div>
        );
    }

    if (statsQuery.isError) {
        return (
            <div className="space-y-6">
                <PageHeader title="Statistics" subtitle="Detailed audit statistics and trends" icon={BarChart3} />
                <ErrorState message="Failed to load statistics" onRetry={() => statsQuery.refetch()} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Statistics"
                subtitle="Detailed audit statistics, trends, and comparisons"
                icon={BarChart3}
                actions={
                    <button onClick={handleExport} className="btn-ghost px-3 py-2 text-sm gap-2">
                        <Download size={16} /> Export
                    </button>
                }
            />

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Logins Today" value={stats?.today.logins ?? 0} icon={Users} />
                <StatCard label="Actions Today" value={stats?.today.actions ?? 0} icon={Activity} iconColor="text-[color:var(--accent-1)]" />
                <StatCard label="Unique Users" value={stats?.today.uniqueUsers ?? 0} icon={Users} iconColor="text-[color:var(--accent-1)]" />
                <StatCard label="Unique IPs" value={stats?.today.uniqueIPs ?? 0} icon={Globe} />
            </div>

            {/* Daily trend with chart type toggle */}
            <div className="panel-tech p-6 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2">
                        <TrendingUp className="text-[color:var(--accent-0)]" size={20} />
                        Daily Activity Trend
                    </h3>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setChartType('bar')}
                            className={`px-3 py-1 rounded text-xs font-medium ${chartType === 'bar' ? 'bg-[color:var(--accent-0)] text-[#081116]' : 'bg-[color:var(--surface-2)] text-[color:var(--text-3)]'}`}
                        >
                            Bar
                        </button>
                        <button
                            onClick={() => setChartType('line')}
                            className={`px-3 py-1 rounded text-xs font-medium ${chartType === 'line' ? 'bg-[color:var(--accent-0)] text-[#081116]' : 'bg-[color:var(--surface-2)] text-[color:var(--text-3)]'}`}
                        >
                            Line
                        </button>
                    </div>
                </div>
                <div className="h-64">
                    {chartType === 'bar' ? (
                        <Bar data={dailyTrend} options={baseChartOptions} />
                    ) : (
                        <Line data={dailyTrend} options={baseChartOptions} />
                    )}
                </div>
            </div>

            {/* Two-column charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Action distribution */}
                <div className="panel-tech p-6 rounded-xl">
                    <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                        <Activity className="text-[color:var(--accent-0)]" size={20} />
                        Action Distribution
                    </h3>
                    <div className="h-64">
                        {actionDistribution.labels.length > 0 ? (
                            <Bar data={actionDistribution} options={baseChartOptions} />
                        ) : (
                            <p className="text-[color:var(--text-3)] text-sm h-full flex items-center justify-center">
                                No data available
                            </p>
                        )}
                    </div>
                </div>

                {/* IP distribution */}
                <div className="panel-tech p-6 rounded-xl">
                    <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                        <Globe className="text-[color:var(--accent-0)]" size={20} />
                        Top IP Addresses
                    </h3>
                    <div className="h-64 flex items-center justify-center">
                        {ipDistribution.labels.length > 0 ? (
                            <Doughnut
                                data={ipDistribution}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: {
                                            position: 'right',
                                            labels: { color: '#b1bcc6', font: { size: 11 } },
                                        },
                                    },
                                }}
                            />
                        ) : (
                            <p className="text-[color:var(--text-3)] text-sm">No data available</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Top users */}
            <div className="panel-tech p-6 rounded-xl">
                <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                    <Users className="text-[color:var(--accent-1)]" size={20} />
                    Top 10 Active Users
                </h3>
                <div className="h-72">
                    {userActivity.labels.length > 0 ? (
                        <Bar
                            data={userActivity}
                            options={{
                                ...baseChartOptions,
                                indexAxis: 'y' as const,
                                plugins: { ...baseChartOptions.plugins, legend: { display: false } },
                            }}
                        />
                    ) : (
                        <p className="text-[color:var(--text-3)] text-sm h-full flex items-center justify-center">
                            No data available
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
