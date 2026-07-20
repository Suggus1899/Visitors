import { useState, useMemo, useCallback } from 'react';
import { useActivityLogsQuery, useAuditStatsQuery } from '../services/useAdminQueries';
import { SkeletonTable } from '@logmaster/ui';
import type { ActivityItem } from '@logmaster/types';
import toast from 'react-hot-toast';

import Activity from 'lucide-react/dist/esm/icons/activity';
import Clock from 'lucide-react/dist/esm/icons/clock';
import User from 'lucide-react/dist/esm/icons/user';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Download from 'lucide-react/dist/esm/icons/download';
import Search from 'lucide-react/dist/esm/icons/search';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Users from 'lucide-react/dist/esm/icons/users';
import Globe from 'lucide-react/dist/esm/icons/globe';
import LogIn from 'lucide-react/dist/esm/icons/log-in';

const ITEMS_PER_PAGE = 20;

const ACTION_COLORS: Record<string, string> = {
    LOGIN: 'text-[color:var(--accent-0)] border-[color:var(--border-1)]',
    LOGOUT: 'text-[color:var(--text-3)] border-[color:var(--border-1)]',
    CREATE: 'text-emerald-300 border-emerald-400/30',
    UPDATE: 'text-amber-300 border-amber-400/30',
    DELETE: 'text-red-300 border-red-400/30',
    CHECKOUT: 'text-sky-300 border-sky-400/30',
    BACKUP: 'text-[color:var(--accent-0)] border-[color:var(--border-1)]',
    EXPORT: 'text-violet-300 border-violet-400/30',
};

const ACTION_LABELS: Record<string, string> = {
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    CREATE: 'Create',
    UPDATE: 'Update',
    DELETE: 'Delete',
    CHECKOUT: 'Check-out',
    BACKUP: 'Backup',
    EXPORT: 'Export',
};

interface Filters {
    action: string;
    entity: string;
    search: string;
    startDate: string;
    endDate: string;
}

const ActivityLogsPage = () => {
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState<Filters>({
        action: '',
        entity: '',
        search: '',
        startDate: '',
        endDate: '',
    });

    const queryFilters = useMemo(
        () => ({
            page,
            limit: ITEMS_PER_PAGE,
            action: filters.action || undefined,
            entity: filters.entity || undefined,
            search: filters.search || undefined,
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined,
        }),
        [page, filters]
    );

    const { data, isLoading, refetch } = useActivityLogsQuery(queryFilters);
    const { data: auditStats } = useAuditStatsQuery();

    const logs: ActivityItem[] = data?.logs || [];
    const totalPages = data?.pages || 1;
    const total = data?.total || 0;

    const handleFilterChange = (key: keyof Filters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const handleExportCSV = useCallback(() => {
        if (logs.length === 0) {
            toast.error('No logs to export');
            return;
        }

        const headers = ['ID', 'User', 'Action', 'Entity', 'Entity ID', 'Details', 'IP Address', 'Timestamp'];
        const rows = logs.map((log) => [
            log.id,
            log.username,
            log.action,
            log.entity,
            log.entityId || '',
            (log.details || '').replace(/"/g, '""'),
            log.ipAddress || '',
            log.createdAt,
        ]);

        const csv = [
            headers.join(','),
            ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exported successfully');
    }, [logs]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    const stats = auditStats as { today?: { logins: number; actions: number; uniqueUsers: number; uniqueIPs: number } } | undefined;

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Logs de Actividad</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">Audit trail of all user actions</p>
                </div>
                <button
                    onClick={handleExportCSV}
                    disabled={logs.length === 0}
                    className="btn-ghost px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                    <Download size={16} /> Export CSV
                </button>
            </div>

            {/* Stats summary */}
            {stats?.today && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="panel-tech p-4 rounded-xl">
                        <div className="flex items-center gap-2">
                            <LogIn size={18} className="text-[color:var(--accent-0)]" />
                            <span className="text-xs text-[color:var(--text-3)] uppercase tracking-wider">Logins Today</span>
                        </div>
                        <p className="text-2xl font-bold text-[color:var(--text-1)] mt-1">{stats.today.logins}</p>
                    </div>
                    <div className="panel-tech p-4 rounded-xl">
                        <div className="flex items-center gap-2">
                            <Activity size={18} className="text-amber-400" />
                            <span className="text-xs text-[color:var(--text-3)] uppercase tracking-wider">Actions Today</span>
                        </div>
                        <p className="text-2xl font-bold text-[color:var(--text-1)] mt-1">{stats.today.actions}</p>
                    </div>
                    <div className="panel-tech p-4 rounded-xl">
                        <div className="flex items-center gap-2">
                            <Users size={18} className="text-emerald-400" />
                            <span className="text-xs text-[color:var(--text-3)] uppercase tracking-wider">Unique Users</span>
                        </div>
                        <p className="text-2xl font-bold text-[color:var(--text-1)] mt-1">{stats.today.uniqueUsers}</p>
                    </div>
                    <div className="panel-tech p-4 rounded-xl">
                        <div className="flex items-center gap-2">
                            <Globe size={18} className="text-violet-400" />
                            <span className="text-xs text-[color:var(--text-3)] uppercase tracking-wider">Unique IPs</span>
                        </div>
                        <p className="text-2xl font-bold text-[color:var(--text-1)] mt-1">{stats.today.uniqueIPs}</p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="panel-tech rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]" />
                        <input
                            type="text"
                            placeholder="Search details..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="input-tech pl-10 text-sm"
                        />
                    </div>
                    <select
                        value={filters.action}
                        onChange={(e) => handleFilterChange('action', e.target.value)}
                        className="input-tech text-sm"
                    >
                        <option value="">All actions</option>
                        {Object.entries(ACTION_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="Entity type..."
                        value={filters.entity}
                        onChange={(e) => handleFilterChange('entity', e.target.value)}
                        className="input-tech text-sm"
                    />
                    <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => handleFilterChange('startDate', e.target.value)}
                        className="input-tech text-sm"
                    />
                    <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => handleFilterChange('endDate', e.target.value)}
                        className="input-tech text-sm"
                    />
                    <button onClick={() => refetch()} className="btn-ghost text-sm flex items-center justify-center gap-1">
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="panel-tech rounded-xl overflow-hidden">
                {isLoading ? (
                    <div className="p-5"><SkeletonTable rows={8} /></div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[color:var(--text-3)]">
                        <Activity size={40} className="mb-3 opacity-30" />
                        <p className="font-medium text-sm">No activity logs found</p>
                        <p className="text-xs mt-1 opacity-60">Try adjusting your filters</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] uppercase text-xs">
                                    <th className="text-left p-4 font-semibold">User</th>
                                    <th className="text-left p-4 font-semibold">Action</th>
                                    <th className="text-left p-4 font-semibold">Entity</th>
                                    <th className="text-left p-4 font-semibold">Details</th>
                                    <th className="text-left p-4 font-semibold">IP</th>
                                    <th className="text-left p-4 font-semibold">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr
                                        key={log.id}
                                        className="hover:bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] last:border-0 transition-colors"
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="text-[color:var(--text-3)]" />
                                                <span className="font-medium text-[color:var(--text-1)]">{log.username}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border bg-[color:var(--surface-2)] ${ACTION_COLORS[log.action] || 'text-[color:var(--text-3)] border-[color:var(--border-1)]'}`}>
                                                {ACTION_LABELS[log.action] || log.action}
                                            </span>
                                        </td>
                                        <td className="p-4 text-[color:var(--text-2)]">{log.entity}</td>
                                        <td className="p-4 text-[color:var(--text-2)] max-w-xs truncate">{log.details || '—'}</td>
                                        <td className="p-4 text-[color:var(--text-3)] font-mono text-xs">{log.ipAddress || '—'}</td>
                                        <td className="p-4 text-[color:var(--text-3)] text-xs flex items-center gap-1">
                                            <Clock size={12} />
                                            {formatDate(log.createdAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="border-t border-[color:var(--border-1)] px-4 py-3 flex items-center justify-between bg-[color:var(--surface-2)]">
                        <span className="text-sm text-[color:var(--text-3)]">
                            Page {page} of {totalPages} · {total} total
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50 flex items-center gap-1"
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50 flex items-center gap-1"
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityLogsPage;
