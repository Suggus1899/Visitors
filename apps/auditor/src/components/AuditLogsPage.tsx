import { useState, useMemo, useCallback, Fragment } from 'react';
import { Activity, Download, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, Calendar, Filter, X } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useAuditLogsQuery, useAuditStatsQuery, useExportAuditLogsMutation } from '../hooks/useAuditQueries';
import { useAuditEvents } from '../hooks/useAuditEvents';
import { PageHeader } from './common/PageHeader';
import { StatCard } from './common/StatCard';
import { ErrorState } from './common/ErrorState';
import { EmptyState } from './common/EmptyState';
import { SkeletonTable } from '@logmaster/ui';
import { downloadBlob, formatDateTime } from '../utils/helpers';
import toast from 'react-hot-toast';
import type { AuditLog, AuditLogFilters, AuditSortableColumn, SortDirection } from '../types';

const ACTION_OPTIONS = [
    'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'CHECKOUT', 'BACKUP', 'EXPORT',
] as const;

const ACTION_COLORS: Record<string, string> = {
    LOGIN: 'text-[color:var(--accent-0)] border-[color:var(--accent-0)]/30',
    LOGOUT: 'text-[color:var(--text-3)] border-[color:var(--border-1)]',
    CREATE: 'text-emerald-300 border-emerald-400/30',
    UPDATE: 'text-amber-300 border-amber-400/30',
    DELETE: 'text-red-300 border-red-400/30',
    CHECKOUT: 'text-sky-300 border-sky-400/30',
    BACKUP: 'text-[color:var(--accent-0)] border-[color:var(--border-1)]',
    EXPORT: 'text-violet-300 border-violet-400/30',
};

const formatAgent = (agent?: string): string => {
    if (!agent) return 'Unknown';
    if (agent.includes('Chrome')) return 'Chrome';
    if (agent.includes('Firefox')) return 'Firefox';
    if (agent.includes('Safari')) return 'Safari';
    if (agent.includes('Edge')) return 'Edge';
    return 'Other';
};

export const AuditLogsPage = () => {
    const { currentTenant } = useTenant();
    const tenantSlug = currentTenant?.slug ?? null;

    // Filter state
    const [action, setAction] = useState('');
    const [username, setUsername] = useState('');
    const [entity, setEntity] = useState('');
    const [ipAddress, setIpAddress] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit] = useState(25);
    const [sortBy, setSortBy] = useState<AuditSortableColumn>('createdAt');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [showFilters, setShowFilters] = useState(true);

    useAuditEvents({ enabled: !!tenantSlug });

    const filters: AuditLogFilters = useMemo(
        () => ({
            action: action || undefined,
            username: username || undefined,
            entity: entity || undefined,
            ipAddress: ipAddress || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            search: search || undefined,
            page,
            limit,
            sortBy,
            sortDir,
        }),
        [action, username, entity, ipAddress, startDate, endDate, search, page, limit, sortBy, sortDir],
    );

    const logsQuery = useAuditLogsQuery(tenantSlug, filters);
    const statsQuery = useAuditStatsQuery(tenantSlug);
    const exportMutation = useExportAuditLogsMutation();

    const handleSort = useCallback(
        (column: AuditSortableColumn) => {
            if (sortBy === column) {
                setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            } else {
                setSortBy(column);
                setSortDir('desc');
            }
        },
        [sortBy],
    );

    const handleResetFilters = () => {
        setAction('');
        setUsername('');
        setEntity('');
        setIpAddress('');
        setStartDate('');
        setEndDate('');
        setSearch('');
        setPage(1);
    };

    const hasActiveFilters = action || username || entity || ipAddress || startDate || endDate || search;

    const handleExport = async (format: 'csv' | 'pdf') => {
        if (!tenantSlug) return;
        try {
            const blob = await exportMutation.mutateAsync({
                tenantSlug,
                format,
                filters: {
                    action: action || undefined,
                    username: username || undefined,
                    entity: entity || undefined,
                    ipAddress: ipAddress || undefined,
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                    search: search || undefined,
                },
            });
            downloadBlob(blob, `audit_logs_${new Date().toISOString().split('T')[0]}.${format}`);
            toast.success(`Export completed (${format.toUpperCase()})`);
        } catch {
            toast.error(`Failed to export ${format.toUpperCase()}`);
        }
    };

    const SortIcon = ({ column }: { column: AuditSortableColumn }) => {
        if (sortBy !== column) return <ChevronDown size={14} className="text-[color:var(--text-3)] opacity-40" />;
        return sortDir === 'asc'
            ? <ChevronUp size={14} className="text-[color:var(--accent-0)]" />
            : <ChevronDown size={14} className="text-[color:var(--accent-0)]" />;
    };

    const logs = logsQuery.data?.logs ?? [];
    const pagination = logsQuery.data?.pagination;
    const stats = statsQuery.data;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Audit Logs"
                subtitle="Full audit trail with advanced filtering and export"
                icon={Activity}
                actions={
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleExport('csv')}
                            disabled={exportMutation.isPending}
                            className="btn-ghost px-3 py-2 text-sm gap-2"
                        >
                            <Download size={16} /> CSV
                        </button>
                        <button
                            onClick={() => handleExport('pdf')}
                            disabled={exportMutation.isPending}
                            className="btn-ghost px-3 py-2 text-sm gap-2"
                        >
                            <Download size={16} /> PDF
                        </button>
                    </div>
                }
            />

            {/* Stats summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Logins Today" value={stats?.today.logins ?? 0} icon={Activity} />
                <StatCard label="Actions Today" value={stats?.today.actions ?? 0} icon={Activity} iconColor="text-[color:var(--accent-1)]" />
                <StatCard label="Unique Users" value={stats?.today.uniqueUsers ?? 0} icon={Activity} />
                <StatCard label="Unique IPs" value={stats?.today.uniqueIPs ?? 0} icon={Activity} iconColor="text-[color:var(--accent-1)]" />
            </div>

            {/* Filters */}
            <div className="panel-tech rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-2)] hover:text-[color:var(--text-1)]"
                    >
                        <Filter size={16} /> Filters
                        {hasActiveFilters && (
                            <span className="bg-[color:var(--accent-0)] text-[#081116] text-xs px-1.5 rounded-full">
                                Active
                            </span>
                        )}
                    </button>
                    {hasActiveFilters && (
                        <button
                            onClick={handleResetFilters}
                            className="flex items-center gap-1 text-xs text-[color:var(--text-3)] hover:text-[color:var(--text-1)]"
                        >
                            <X size={14} /> Clear all
                        </button>
                    )}
                </div>

                {showFilters && (
                    <div className="p-4 border-b border-[color:var(--border-1)] flex flex-wrap gap-3 items-center bg-[color:var(--surface-2)]">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-[color:var(--text-3)]" size={18} />
                            <input
                                type="text"
                                placeholder="Search details..."
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                className="input-tech pl-10 w-64"
                            />
                        </div>

                        <select
                            value={action}
                            onChange={(e) => { setAction(e.target.value); setPage(1); }}
                            className="input-tech px-3 py-2 w-auto"
                        >
                            <option value="">All actions</option>
                            {ACTION_OPTIONS.map((a) => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>

                        <input
                            type="text"
                            placeholder="Username..."
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setPage(1); }}
                            className="input-tech w-40"
                        />

                        <input
                            type="text"
                            placeholder="Entity..."
                            value={entity}
                            onChange={(e) => { setEntity(e.target.value); setPage(1); }}
                            className="input-tech w-40"
                        />

                        <input
                            type="text"
                            placeholder="IP address..."
                            value={ipAddress}
                            onChange={(e) => { setIpAddress(e.target.value); setPage(1); }}
                            className="input-tech w-40"
                        />

                        <div className="flex items-center gap-2 bg-[color:var(--surface-0)] border border-[color:var(--border-1)] rounded-lg px-2">
                            <Calendar size={18} className="text-[color:var(--text-3)]" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                                className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                            />
                            <span className="text-[color:var(--text-3)]">-</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                                className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                            />
                        </div>
                    </div>
                )}

                {/* Table */}
                {logsQuery.isLoading ? (
                    <div className="p-4">
                        <SkeletonTable rows={8} />
                    </div>
                ) : logsQuery.isError ? (
                    <div className="p-4">
                        <ErrorState
                            message="Failed to load audit logs"
                            onRetry={() => logsQuery.refetch()}
                        />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            title="No audit logs found"
                            message="Try adjusting your filters or date range."
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-[color:var(--text-2)]">
                            <thead className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] font-semibold uppercase text-xs border-b border-[color:var(--border-1)]">
                                <tr>
                                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('createdAt')}>
                                        <div className="flex items-center gap-1">Date <SortIcon column="createdAt" /></div>
                                    </th>
                                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('username')}>
                                        <div className="flex items-center gap-1">User <SortIcon column="username" /></div>
                                    </th>
                                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('action')}>
                                        <div className="flex items-center gap-1">Action <SortIcon column="action" /></div>
                                    </th>
                                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('entity')}>
                                        <div className="flex items-center gap-1">Entity <SortIcon column="entity" /></div>
                                    </th>
                                    <th className="px-4 py-3">Details</th>
                                    <th className="px-4 py-3">IP / Agent</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[color:var(--border-1)]">
                                {logs.map((log: AuditLog) => (
                                    <Fragment key={log.id}>
                                        <tr
                                            className="hover:bg-[color:var(--surface-2)] transition-colors cursor-pointer"
                                            onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                        >
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-[color:var(--text-3)]">
                                                {formatDateTime(log.createdAt)}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-[color:var(--text-1)]">
                                                {log.username}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-md text-xs font-semibold border bg-[color:var(--surface-2)] ${ACTION_COLORS[log.action] ?? 'text-[color:var(--text-3)] border-[color:var(--border-1)]'}`}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{log.entity}</span>
                                                    {log.entityId && (
                                                        <span className="text-xs text-[color:var(--text-3)]">ID: {log.entityId}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 max-w-xs truncate" title={log.details}>
                                                {log.details || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-[color:var(--text-3)]">
                                                <div className="flex flex-col">
                                                    <span className="font-mono">{log.ipAddress || 'Unknown'}</span>
                                                    <span>{formatAgent(log.userAgent)}</span>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedRow === log.id && (
                                            <tr className="bg-[color:var(--surface-0)]">
                                                <td colSpan={6} className="px-4 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Full Details</p>
                                                            <p className="text-[color:var(--text-2)]">{log.details || 'No details recorded'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">User Agent</p>
                                                            <p className="text-[color:var(--text-2)] text-xs font-mono break-all">{log.userAgent || 'Unknown'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Metadata</p>
                                                            <div className="space-y-1 text-xs text-[color:var(--text-2)]">
                                                                <p>Log ID: <span className="font-mono">{log.id}</span></p>
                                                                <p>User ID: <span className="font-mono">{log.userId}</span></p>
                                                                <p>IP: <span className="font-mono">{log.ipAddress || 'N/A'}</span></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pagination && pagination.total > 0 && (
                    <div className="px-4 py-3 border-t border-[color:var(--border-1)] flex justify-between items-center bg-[color:var(--surface-2)]">
                        <div className="text-sm text-[color:var(--text-3)]">
                            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed gap-1"
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                                disabled={page === pagination.pages}
                                className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed gap-1"
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
