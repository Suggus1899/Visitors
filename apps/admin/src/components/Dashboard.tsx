'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardKPIsQuery, useRecentVisitsQuery, useActiveVisitsQuery } from '../services/useAdminQueries';
import { Skeleton, SkeletonCard } from '@logmaster/ui';
import { RecentVisits } from '@logmaster/ui';
import type { Visit } from '@logmaster/types';

import Users from 'lucide-react/dist/esm/icons/users';
import Clock from 'lucide-react/dist/esm/icons/clock';
import UserCheck from 'lucide-react/dist/esm/icons/user-check';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Activity from 'lucide-react/dist/esm/icons/activity';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import FileSpreadsheet from 'lucide-react/dist/esm/icons/file-spreadsheet';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

interface KPICardProps {
    label: string;
    value: number;
    icon: React.ElementType;
    color: string;
    loading?: boolean;
}

const KPICard = ({ label, value, icon: Icon, color, loading }: KPICardProps) => {
    if (loading) {
        return (
            <div className="panel-tech p-5 rounded-xl">
                <Skeleton variant="text" width="40%" height={12} />
                <div className="mt-3"><Skeleton variant="text" width="60%" height={28} /></div>
            </div>
        );
    }

    return (
        <div className={`panel-tech p-5 rounded-xl border-l-2 ${color}`}>
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-[0.2em]">{label}</h3>
                    <p className="text-3xl font-bold text-[color:var(--text-1)] mt-1">{value}</p>
                </div>
                <div className={`p-3 rounded-xl bg-[color:var(--surface-2)]`}>
                    <Icon size={24} className={color.includes('accent') ? 'text-[color:var(--accent-0)]' : color.includes('emerald') ? 'text-emerald-400' : color.includes('amber') ? 'text-amber-400' : 'text-red-400'} />
                </div>
            </div>
        </div>
    );
};

const QUICK_ACTIONS = [
    { label: 'Visitantes', icon: Users, path: '/visitors', color: 'text-[color:var(--accent-0)]' },
    { label: 'Visitas', icon: Activity, path: '/visits', color: 'text-emerald-400' },
    { label: 'Calendario', icon: Calendar, path: '/calendar', color: 'text-blue-400' },
    { label: 'Reportes', icon: FileSpreadsheet, path: '/reports', color: 'text-amber-400' },
];

const Dashboard = () => {
    const router = useRouter();
    const { data: kpis, isLoading: kpisLoading } = useDashboardKPIsQuery(30000);
    const { data: recentVisits = [], isFetching: recentFetching } = useRecentVisitsQuery(10);
    const { data: activeVisits = [] } = useActiveVisitsQuery(30000);

    const activeList: Visit[] = useMemo(() => activeVisits, [activeVisits]);

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Dashboard</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">Overview of today&apos;s visitor activity</p>
                </div>
                <button
                    onClick={() => router.push('/visits')}
                    className="btn-ghost px-4 py-2 text-sm flex items-center gap-2"
                >
                    <RefreshCw size={16} /> View All Visits
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    label="Visits Today"
                    value={kpis?.visitsToday ?? 0}
                    icon={UserCheck}
                    color="border-[color:var(--accent-0)]"
                    loading={kpisLoading}
                />
                <KPICard
                    label="Active Visitors"
                    value={kpis?.activeVisitors ?? 0}
                    icon={Users}
                    color="border-emerald-400"
                    loading={kpisLoading}
                />
                <KPICard
                    label="Waiting"
                    value={kpis?.waiting ?? 0}
                    icon={Clock}
                    color="border-amber-400"
                    loading={kpisLoading}
                />
                <KPICard
                    label="Missed Checkouts"
                    value={kpis?.missedCheckouts ?? 0}
                    icon={AlertTriangle}
                    color="border-red-400"
                    loading={kpisLoading}
                />
            </div>

            {/* Quick Actions */}
            <div className="panel-tech rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[color:var(--text-2)] uppercase tracking-wider mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {QUICK_ACTIONS.map((action) => (
                        <button
                            key={action.path}
                            onClick={() => router.push(action.path)}
                            className="flex flex-col items-center gap-2 p-4 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-xl hover:border-[color:var(--accent-0)] transition-colors group"
                        >
                            <action.icon size={24} className={action.color} />
                            <span className="text-sm font-medium text-[color:var(--text-2)] group-hover:text-[color:var(--text-1)]">
                                {action.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Visits + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Visits */}
                <div className="panel-tech rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-[color:var(--text-2)] uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Active Visits
                        </h3>
                        <button
                            onClick={() => router.push('/visits')}
                            className="text-xs text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] flex items-center gap-1 transition-colors"
                        >
                            View all <ArrowRight size={12} />
                        </button>
                    </div>

                    {activeList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--text-3)]">
                            <Users size={32} className="mb-2 opacity-30" />
                            <p className="text-sm">No active visits right now</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {activeList.slice(0, 8).map((visit) => {
                                const name = `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''}`.trim() || visit.visitor_cedula;
                                const company = visit.Visitor?.company || '';
                                const checkIn = visit.check_in || visit.check_in_time || '';
                                return (
                                    <div
                                        key={visit.id}
                                        className="flex items-center gap-3 p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]"
                                    >
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-[color:var(--text-1)] truncate">{name}</p>
                                            <p className="text-xs text-[color:var(--text-3)] truncate">{company}</p>
                                        </div>
                                        {checkIn && (
                                            <span className="text-xs text-[color:var(--text-3)] flex-shrink-0">
                                                {new Date(checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Recent Activity */}
                <div className="panel-tech rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-[color:var(--text-2)] uppercase tracking-wider flex items-center gap-2">
                            <Activity size={16} className="text-[color:var(--accent-0)]" />
                            Recent Activity
                        </h3>
                        <button
                            onClick={() => router.push('/activity-logs')}
                            className="text-xs text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] flex items-center gap-1 transition-colors"
                        >
                            View all <ArrowRight size={12} />
                        </button>
                    </div>

                    {recentFetching && recentVisits.length === 0 ? (
                        <div className="space-y-3">
                            <SkeletonCard />
                            <SkeletonCard />
                        </div>
                    ) : recentVisits.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--text-3)]">
                            <Activity size={32} className="mb-2 opacity-30" />
                            <p className="text-sm">No recent activity</p>
                        </div>
                    ) : (
                        <RecentVisits visits={recentVisits.slice(0, 5)} loading={false} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
