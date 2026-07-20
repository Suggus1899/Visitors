import { useState, useMemo, useCallback } from 'react';
import {
    useVisitListQuery,
    useCheckOutMutation,
    useAdmitVisitorMutation,
    useReactivateVisitMutation,
    useGoIntermittentMutation,
    useIntermittentVisitsQuery,
} from '../services/useAdminQueries';
import { ConfirmDialog, VisitorDetailsModal, SkeletonTable } from '@logmaster/ui';
import type { Visit, IntermittentVisit } from '@logmaster/types';
import toast from 'react-hot-toast';

import Search from 'lucide-react/dist/esm/icons/search';
import Download from 'lucide-react/dist/esm/icons/download';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import UserCheck from 'lucide-react/dist/esm/icons/user-check';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import ArrowRightLeft from 'lucide-react/dist/esm/icons/arrow-right-left';
import ClipboardList from 'lucide-react/dist/esm/icons/clipboard-list';
import Clock from 'lucide-react/dist/esm/icons/clock';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

const ITEMS_PER_PAGE = 15;

type SortField = 'visitor' | 'check_in' | 'check_out' | 'reason' | 'status';
type SortDirection = 'asc' | 'desc';

interface Filters {
    status: string;
    startDate: string;
    endDate: string;
    search: string;
    personToVisit: string;
}

const VisitsPage = () => {
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState<Filters>({
        status: '',
        startDate: '',
        endDate: '',
        search: '',
        personToVisit: '',
    });
    const [sortField, setSortField] = useState<SortField>('check_in');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
    const [checkoutTarget, setCheckoutTarget] = useState<Visit | null>(null);
    const [intermittentView, setIntermittentView] = useState<IntermittentVisit | null>(null);

    const checkoutMutation = useCheckOutMutation();
    const admitMutation = useAdmitVisitorMutation();
    const reactivateMutation = useReactivateVisitMutation();
    const intermittentMutation = useGoIntermittentMutation();

    const queryFilters = useMemo(
        () => ({
            page,
            limit: ITEMS_PER_PAGE,
            status: filters.status || undefined,
            search: filters.search || undefined,
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined,
            personToVisit: filters.personToVisit || undefined,
        }),
        [page, filters]
    );

    const { data, isLoading, refetch } = useVisitListQuery(queryFilters);
    const { data: intermittentVisits = [] } = useIntermittentVisitsQuery(30000);

    const visits = data?.visits || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

    const handleFilterChange = (key: keyof Filters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const sortedVisits = useMemo(() => {
        return [...visits].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'visitor':
                    comparison = `${a.Visitor?.first_name || ''} ${a.Visitor?.last_name || ''}`
                        .toLowerCase()
                        .localeCompare(`${b.Visitor?.first_name || ''} ${b.Visitor?.last_name || ''}`.toLowerCase());
                    break;
                case 'check_in':
                    comparison = new Date(a.check_in || a.check_in_time || '').getTime() - new Date(b.check_in || b.check_in_time || '').getTime();
                    break;
                case 'check_out':
                    comparison = (a.check_out ? new Date(a.check_out).getTime() : 0) - (b.check_out ? new Date(b.check_out).getTime() : 0);
                    break;
                case 'reason':
                    comparison = (a.reason || '').localeCompare(b.reason || '');
                    break;
                case 'status':
                    comparison = a.status.localeCompare(b.status);
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [visits, sortField, sortDirection]);

    const handleExportCSV = useCallback(() => {
        const headers = ['Visitor', 'Cedula', 'Company', 'Reason', 'Check In', 'Check Out', 'Status', 'Person To Visit'];
        const rows = sortedVisits.map((v) => [
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
            ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `visits-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exported successfully');
    }, [sortedVisits]);

    const handleCheckout = () => {
        if (!checkoutTarget) return;
        checkoutMutation.mutate(
            { id: checkoutTarget.id },
            {
                onSuccess: () => {
                    toast.success('Visitor checked out');
                    setCheckoutTarget(null);
                    refetch();
                },
                onError: () => toast.error('Failed to check out visitor'),
            }
        );
    };

    const handleAdmit = (visit: Visit) => {
        admitMutation.mutate(visit.id, {
            onSuccess: () => toast.success('Visitor admitted'),
            onError: () => toast.error('Failed to admit visitor'),
        });
    };

    const handleReactivate = (visit: Visit) => {
        reactivateMutation.mutate(visit.id, {
            onSuccess: () => toast.success('Visit reactivated'),
            onError: () => toast.error('Failed to reactivate visit'),
        });
    };

    const handleIntermittent = (visit: Visit) => {
        intermittentMutation.mutate(
            { id: visit.id },
            {
                onSuccess: () => toast.success('Temporary exit registered'),
                onError: () => toast.error('Failed to register temporary exit'),
            }
        );
    };

    const formatDateTime = (dt?: string | null): string => {
        if (!dt) return '—';
        try {
            return new Date(dt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return '—';
        }
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            active: 'border-emerald-400 text-emerald-400 bg-emerald-500/10',
            waiting: 'border-amber-400 text-amber-400 bg-amber-500/10',
            intermittent: 'border-blue-400 text-blue-400 bg-blue-500/10',
            completed: 'border-[color:var(--border-1)] text-[color:var(--text-3)] bg-[color:var(--surface-2)]',
        };
        return styles[status] || styles.completed;
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="opacity-30">↕</span>;
        return sortDirection === 'asc' ? '↑' : '↓';
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Visitas</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">All visits with filters and actions</p>
                </div>
                <button
                    onClick={handleExportCSV}
                    disabled={sortedVisits.length === 0}
                    className="btn-ghost px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                    <Download size={16} /> Export CSV
                </button>
            </div>

            {/* Intermittent visits banner */}
            {intermittentVisits.length > 0 && (
                <div className="panel-tech rounded-xl p-4 border-l-2 border-blue-400">
                    <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2 mb-3">
                        <ArrowRightLeft size={16} /> Intermittent Visits ({intermittentVisits.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {intermittentVisits.map((iv: IntermittentVisit) => (
                            <button
                                key={iv.id}
                                onClick={() => setIntermittentView(iv)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-xs hover:border-blue-400 transition-colors"
                            >
                                <span className="font-medium text-[color:var(--text-1)]">{iv.visitorName}</span>
                                <span className="text-[color:var(--text-3)]">{iv.minutesOutside}m outside</span>
                            </button>
                        ))}
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
                            placeholder="Search by name or cedula..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="input-tech pl-10 text-sm"
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="Person to visit..."
                        value={filters.personToVisit}
                        onChange={(e) => handleFilterChange('personToVisit', e.target.value)}
                        className="input-tech text-sm"
                    />
                    <select
                        value={filters.status}
                        onChange={(e) => handleFilterChange('status', e.target.value)}
                        className="input-tech text-sm"
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="waiting">Waiting</option>
                        <option value="intermittent">Intermittent</option>
                        <option value="completed">Completed</option>
                    </select>
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
                ) : sortedVisits.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[color:var(--text-3)]">
                        <ClipboardList size={40} className="mb-3 opacity-30" />
                        <p className="font-medium text-sm">No visits found</p>
                        <p className="text-xs mt-1 opacity-60">Try adjusting your filters</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] uppercase text-xs">
                                    <th className="text-left p-4 cursor-pointer hover:bg-[color:var(--surface-1)]" onClick={() => handleSort('visitor')}>
                                        Visitor <SortIcon field="visitor" />
                                    </th>
                                    <th className="text-left p-4 cursor-pointer hover:bg-[color:var(--surface-1)]" onClick={() => handleSort('check_in')}>
                                        Check In <SortIcon field="check_in" />
                                    </th>
                                    <th className="text-left p-4 cursor-pointer hover:bg-[color:var(--surface-1)]" onClick={() => handleSort('check_out')}>
                                        Check Out <SortIcon field="check_out" />
                                    </th>
                                    <th className="text-left p-4 cursor-pointer hover:bg-[color:var(--surface-1)]" onClick={() => handleSort('reason')}>
                                        Reason <SortIcon field="reason" />
                                    </th>
                                    <th className="text-left p-4 cursor-pointer hover:bg-[color:var(--surface-1)]" onClick={() => handleSort('status')}>
                                        Status <SortIcon field="status" />
                                    </th>
                                    <th className="text-left p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedVisits.map((visit) => {
                                    const name = `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''}`.trim() || visit.visitor_cedula;
                                    return (
                                        <tr
                                            key={visit.id}
                                            onClick={() => setSelectedVisit(visit)}
                                            className="hover:bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] last:border-0 transition-colors cursor-pointer"
                                        >
                                            <td className="p-4">
                                                <div className="font-semibold text-[color:var(--text-1)]">{name}</div>
                                                <div className="text-xs text-[color:var(--text-3)]">
                                                    {visit.Visitor?.company || ''} · {visit.visitor_cedula}
                                                </div>
                                            </td>
                                            <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">
                                                {formatDateTime(visit.check_in || visit.check_in_time)}
                                            </td>
                                            <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">
                                                {formatDateTime(visit.check_out || visit.check_out_time)}
                                            </td>
                                            <td className="p-4 text-[color:var(--text-2)] max-w-[12rem] truncate">
                                                {visit.reason || visit.purpose}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold border capitalize ${getStatusBadge(visit.status)}`}>
                                                    {visit.status}
                                                </span>
                                            </td>
                                            <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex gap-1">
                                                    {visit.status === 'active' && (
                                                        <>
                                                            <button
                                                                onClick={() => setCheckoutTarget(visit)}
                                                                disabled={checkoutMutation.isPending}
                                                                className="p-1.5 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                                                                title="Check out"
                                                                aria-label="Check out visitor"
                                                            >
                                                                <LogOut size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleIntermittent(visit)}
                                                                disabled={intermittentMutation.isPending}
                                                                className="p-1.5 rounded text-blue-400 hover:bg-blue-500/10 transition-colors"
                                                                title="Temporary exit"
                                                                aria-label="Register temporary exit"
                                                            >
                                                                <ArrowRightLeft size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {visit.status === 'waiting' && (
                                                        <button
                                                            onClick={() => handleAdmit(visit)}
                                                            disabled={admitMutation.isPending}
                                                            className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                                            title="Admit"
                                                            aria-label="Admit visitor"
                                                        >
                                                            <UserCheck size={16} />
                                                        </button>
                                                    )}
                                                    {visit.status === 'intermittent' && (
                                                        <button
                                                            onClick={() => handleReactivate(visit)}
                                                            disabled={reactivateMutation.isPending}
                                                            className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                                            title="Reactivate"
                                                            aria-label="Reactivate visit"
                                                        >
                                                            <RotateCcw size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
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

            {/* Visit Detail Modal */}
            <VisitorDetailsModal
                visit={selectedVisit}
                isOpen={!!selectedVisit}
                onClose={() => setSelectedVisit(null)}
            />

            {/* Checkout confirmation */}
            <ConfirmDialog
                isOpen={!!checkoutTarget}
                title="Check Out Visitor"
                message={`Confirm check-out for ${checkoutTarget?.Visitor?.first_name || ''} ${checkoutTarget?.Visitor?.last_name || ''}?`}
                confirmText="Check Out"
                variant="warning"
                onConfirm={handleCheckout}
                onCancel={() => setCheckoutTarget(null)}
            />

            {/* Intermittent log view modal */}
            {intermittentView && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setIntermittentView(null)}
                >
                    <div
                        className="panel-tech rounded-2xl max-w-lg w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-display uppercase tracking-[0.15em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                            <ArrowRightLeft size={20} className="text-blue-400" />
                            Intermittent Log
                        </h3>
                        <p className="text-sm text-[color:var(--text-2)] mb-4">
                            {intermittentView.visitorName} — {intermittentView.company}
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {intermittentView.intervals.map((interval, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                    <Clock size={16} className="text-blue-400 flex-shrink-0" />
                                    <div className="flex-1 text-sm">
                                        <span className="text-[color:var(--text-1)]">Exit: {new Date(interval.exitTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                        {interval.reentryTime && (
                                            <span className="text-[color:var(--text-2)] ml-3">
                                                Re-entry: {new Date(interval.reentryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                        {!interval.reentryTime && (
                                            <span className="text-amber-400 ml-3">Still outside</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 text-sm text-[color:var(--text-3)]">
                            Total time outside: <strong className="text-[color:var(--text-1)]">{intermittentView.minutesOutside} minutes</strong>
                        </div>
                        <button onClick={() => setIntermittentView(null)} className="w-full mt-4 btn-ghost py-2.5 text-sm">
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VisitsPage;
