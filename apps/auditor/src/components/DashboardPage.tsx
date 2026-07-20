'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    LayoutDashboard,
    Users,
    Activity,
    Globe,
    TrendingUp,
    AlertTriangle,
    FileText,
    Clock,
} from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import {
    useAuditStatsQuery,
    useRecentAuditLogsQuery,
} from '../hooks/useAuditQueries';
import { useArcoListQuery } from '../hooks/useArcoQueries';
import { useAuditEvents } from '../hooks/useAuditEvents';
import { PageHeader } from './common/PageHeader';
import { StatCard } from './common/StatCard';
import { ErrorState } from './common/ErrorState';
import { SkeletonCard } from '@logmaster/ui';
import { baseChartOptions, chartAccentColor } from '../utils/chartSetup';
import { formatDateTime } from '../utils/helpers';
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

const formatLogDate = (dateStr: string) => formatDateTime(dateStr);

export const DashboardPage = () => {
    const { currentTenant } = useTenant();
    const tenantSlug = currentTenant?.slug ?? null;

    const statsQuery = useAuditStatsQuery(tenantSlug);
    const recentLogsQuery = useRecentAuditLogsQuery(tenantSlug, 8);
    const arcoQuery = useArcoListQuery(tenantSlug, {
        status: 'pending',
        page: 1,
        limit: 1,
    });
    useAuditEvents({ enabled: !!tenantSlug });

    const stats = statsQuery.data;
    const recentLogs = recentLogsQuery.data ?? [];
    const pendingArcoCount = arcoQuery.data?.pagination.total ?? 0;

    const actionsByTypeChart = useMemo(() => {
        const items: { action: string; count: number }[] = stats?.actionsByType ?? [];
        return {
            labels: items.map((i: { action: string; count: number }) => i.action),
            datasets: [
                {
                    label: 'Actions',
                    data: items.map((i: { action: string; count: number }) => i.count),
                    backgroundColor: items.map((i: { action: string; count: number }) => ACTION_COLORS[i.action] ?? chartAccentColor),
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        };
    }, [stats]);

    const topUsersChart = useMemo(() => {
        const items: { username: string; count: number }[] = stats?.topUsers ?? [];
        return {
            labels: items.map((i: { username: string; count: number }) => i.username),
            datasets: [
                {
                    label: 'Actions',
                    data: items.map((i: { username: string; count: number }) => i.count),
                    backgroundColor: 'rgba(77, 215, 255, 0.6)',
                    borderColor: chartAccentColor,
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        };
    }, [stats]);

    const dailyActivityChart = useMemo(() => {
        const items: { date: string; count: number }[] = stats?.lastWeek?.dailyActivity ?? [];
        return {
            labels: items.map((d: { date: string; count: number }) =>
                new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
            ),
            datasets: [
                {
                    label: 'Daily Actions',
                    data: items.map((d: { date: string; count: number }) => d.count),
                    backgroundColor: 'rgba(77, 215, 255, 0.6)',
                    borderColor: chartAccentColor,
                    borderWidth: 1,
                    borderRadius: 4,
                },
            ],
        };
    }, [stats]);

    if (statsQuery.isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="Dashboard" subtitle="Audit KPIs and recent activity" icon={LayoutDashboard} />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            </div>
        );
    }

    if (statsQuery.isError) {
        return (
            <div className="space-y-6">
                <PageHeader title="Dashboard" subtitle="Audit KPIs and recent activity" icon={LayoutDashboard} />
                <ErrorState
                    message="Failed to load audit statistics"
                    onRetry={() => statsQuery.refetch()}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Dashboard"
                subtitle="Audit KPIs and recent activity"
                icon={LayoutDashboard}
            />

            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Logins Today"
                    value={stats?.today.logins ?? 0}
                    icon={Users}
                    iconColor="text-[color:var(--accent-0)]"
                />
                <StatCard
                    label="Actions Today"
                    value={stats?.today.actions ?? 0}
                    icon={Activity}
                    iconColor="text-[color:var(--accent-0)]"
                />
                <StatCard
                    label="Unique Users"
                    value={stats?.today.uniqueUsers ?? 0}
                    icon={Users}
                    iconColor="text-[color:var(--accent-1)]"
                />
                <StatCard
                    label="Unique IPs (24h)"
                    value={stats?.today.uniqueIPs ?? 0}
                    icon={Globe}
                    iconColor="text-[color:var(--accent-0)]"
                />
            </div>

            {/* Pending ARCO alert */}
            {pendingArcoCount > 0 && (
                <Link
                    href="/arco"
                    className="block panel-tech rounded-xl p-4 border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="text-amber-400" size={20} />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-[color:var(--text-1)]">
                                {pendingArcoCount} pending ARCO request{pendingArcoCount !== 1 ? 's' : ''}
                            </p>
                            <p className="text-xs text-[color:var(--text-3)]">
                                Click to review and process pending privacy requests
                            </p>
                        </div>
                        <FileText className="text-[color:var(--text-3)]" size={18} />
                    </div>
                </Link>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Daily activity — spans 2 cols */}
                <div className="lg:col-span-2 panel-tech p-6 rounded-xl">
                    <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                        <TrendingUp className="text-[color:var(--accent-0)]" size={20} />
                        Daily Activity (Last 7 Days)
                    </h3>
                    <div className="h-64">
                        <Bar data={dailyActivityChart} options={baseChartOptions} />
                    </div>
                </div>

                {/* Actions by type doughnut */}
                <div className="panel-tech p-6 rounded-xl">
                    <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                        <Activity className="text-[color:var(--accent-0)]" size={20} />
                        Actions by Type
                    </h3>
                    <div className="h-64 flex items-center justify-center">
                        {actionsByTypeChart.labels.length > 0 ? (
                            <Doughnut
                                data={actionsByTypeChart}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: {
                                            position: 'bottom',
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

            {/* Top users + Recent logs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top users */}
                <div className="panel-tech p-6 rounded-xl">
                    <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                        <Users className="text-[color:var(--accent-1)]" size={20} />
                        Top Active Users
                    </h3>
                    <div className="h-56">
                        {topUsersChart.labels.length > 0 ? (
                            <Bar
                                data={topUsersChart}
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

                {/* Recent logs */}
                <div className="lg:col-span-2 panel-tech p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2">
                            <Clock className="text-[color:var(--accent-0)]" size={20} />
                            Recent Audit Logs
                        </h3>
                        <Link
                            href="/logs"
                            className="text-xs text-[color:var(--accent-0)] hover:underline"
                        >
                            View all →
                        </Link>
                    </div>
                    {recentLogsQuery.isLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className="h-12 animate-pulse bg-[color:var(--surface-2)] rounded-lg"
                                />
                            ))}
                        </div>
                    ) : recentLogs.length === 0 ? (
                        <p className="text-[color:var(--text-3)] text-sm py-8 text-center">
                            No recent audit logs
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {recentLogs.map((log: AuditLog) => (
                                <li
                                    key={log.id}
                                    className="flex items-center gap-3 p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)] text-sm"
                                >
                                    <span
                                        className="px-2 py-0.5 rounded text-xs font-semibold border"
                                        style={{
                                            color: ACTION_COLORS[log.action] ?? '#7c8a97',
                                            borderColor: (ACTION_COLORS[log.action] ?? '#7c8a97') + '40',
                                        }}
                                    >
                                        {log.action}
                                    </span>
                                    <span className="font-medium text-[color:var(--text-1)]">
                                        {log.username}
                                    </span>
                                    <span className="text-[color:var(--text-3)] truncate flex-1">
                                        {log.entity}
                                        {log.details ? ` — ${log.details}` : ''}
                                    </span>
                                    <span className="text-xs text-[color:var(--text-3)] whitespace-nowrap">
                                        {formatLogDate(log.createdAt)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};
