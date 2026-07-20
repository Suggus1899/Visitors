import { useState, useMemo } from 'react';
import {
    FileText,
    Plus,
    Download,
    Search,
    X,
    Clock,
    Eye,
    Edit3,
    Trash2,
    Ban,
    CheckCircle,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import {
    useArcoListQuery,
    useCreateArcoMutation,
    useUpdateArcoStatusMutation,
} from '../hooks/useArcoQueries';
import { PageHeader } from './common/PageHeader';
import { ErrorState } from './common/ErrorState';
import { EmptyState } from './common/EmptyState';
import { SkeletonTable } from '@logmaster/ui';
import { ConfirmDialog } from '@logmaster/ui';
import { downloadBlob, formatDateTime, formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';
import type {
    ArcoRequest,
    ArcoRequestType,
    ArcoRequestStatus,
    ArcoRequestFilters,
    ArcoCreatePayload,
} from '../types';

const REQUEST_TYPE_META: Record<
    ArcoRequestType,
    { label: string; icon: typeof Eye; color: string }
> = {
    access: { label: 'Access', icon: Eye, color: 'text-sky-300 border-sky-400/30' },
    rectification: { label: 'Rectification', icon: Edit3, color: 'text-amber-300 border-amber-400/30' },
    cancellation: { label: 'Cancellation', icon: Trash2, color: 'text-red-300 border-red-400/30' },
    opposition: { label: 'Opposition', icon: Ban, color: 'text-violet-300 border-violet-400/30' },
};

const STATUS_META: Record<
    ArcoRequestStatus,
    { label: string; color: string; icon: typeof Clock }
> = {
    pending: { label: 'Pending', color: 'text-amber-300 border-amber-400/30 bg-amber-500/5', icon: Clock },
    in_review: { label: 'In Review', color: 'text-sky-300 border-sky-400/30 bg-sky-500/5', icon: Loader2 },
    completed: { label: 'Completed', color: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/5', icon: CheckCircle },
    rejected: { label: 'Rejected', color: 'text-red-300 border-red-400/30 bg-red-500/5', icon: AlertCircle },
};

const REQUEST_TYPES: ArcoRequestType[] = ['access', 'rectification', 'cancellation', 'opposition'];
const STATUSES: ArcoRequestStatus[] = ['pending', 'in_review', 'completed', 'rejected'];

export const ArcoRequestsPage = () => {
    const { currentTenant } = useTenant();
    const tenantSlug = currentTenant?.slug ?? null;

    const [status, setStatus] = useState<ArcoRequestStatus | ''>('');
    const [requestType, setRequestType] = useState<ArcoRequestType | ''>('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<ArcoRequest | null>(null);
    const [statusUpdateTarget, setStatusUpdateTarget] = useState<ArcoRequest | null>(null);
    const [pendingStatus, setPendingStatus] = useState<ArcoRequestStatus | null>(null);

    const filters: ArcoRequestFilters = useMemo(
        () => ({
            status: status || undefined,
            requestType: requestType || undefined,
            search: search || undefined,
            page,
            limit: 25,
        }),
        [status, requestType, search, page],
    );

    const listQuery = useArcoListQuery(tenantSlug, filters);
    const createMutation = useCreateArcoMutation();
    const updateMutation = useUpdateArcoStatusMutation();

    const requests = listQuery.data?.requests ?? [];
    const pagination = listQuery.data?.pagination;

    const handleExport = () => {
        if (!requests.length) {
            toast.error('No requests to export');
            return;
        }
        const csvHeaders = ['ID', 'Type', 'Status', 'Subject Cedula', 'Subject Name', 'Requested By', 'Created At', 'Resolved At'];
        const csvRows = requests.map((r: ArcoRequest) =>
            [r.id, r.requestType, r.status, r.subjectCedula, r.subjectName ?? '', r.requestedBy, r.createdAt, r.resolvedAt ?? '']
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(','),
        );
        const csv = [csvHeaders.join(','), ...csvRows].join('\n');
        downloadBlob(new Blob([csv], { type: 'text/csv' }), `arco_requests_${new Date().toISOString().split('T')[0]}.csv`);
        toast.success('Export completed');
    };

    const handleStatusUpdate = async (notes?: string) => {
        if (!tenantSlug || !statusUpdateTarget || !pendingStatus) return;
        try {
            await updateMutation.mutateAsync({
                tenantSlug,
                id: statusUpdateTarget.id,
                payload: { status: pendingStatus, notes },
            });
            toast.success(`Status updated to ${STATUS_META[pendingStatus].label}`);
            setStatusUpdateTarget(null);
            setPendingStatus(null);
        } catch {
            toast.error('Failed to update status');
        }
    };

    const hasActiveFilters = status || requestType || search;

    return (
        <div className="space-y-6">
            <PageHeader
                title="ARCO Requests"
                subtitle="Privacy rights requests (Access, Rectification, Cancellation, Opposition)"
                icon={FileText}
                readOnly={false}
                actions={
                    <div className="flex gap-2">
                        <button onClick={handleExport} className="btn-ghost px-3 py-2 text-sm gap-2">
                            <Download size={16} /> Export
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn-ghost px-3 py-2 text-sm gap-2 border-[color:var(--accent-0)]/30 text-[color:var(--accent-0)]"
                        >
                            <Plus size={16} /> New Request
                        </button>
                    </div>
                }
            />

            {/* Filters */}
            <div className="panel-tech rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[color:var(--border-1)] flex flex-wrap gap-3 items-center bg-[color:var(--surface-2)]">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-[color:var(--text-3)]" size={18} />
                        <input
                            type="text"
                            placeholder="Search by cedula or name..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="input-tech pl-10 w-64"
                        />
                    </div>
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value as ArcoRequestStatus | ''); setPage(1); }}
                        className="input-tech px-3 py-2 w-auto"
                    >
                        <option value="">All statuses</option>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                    </select>
                    <select
                        value={requestType}
                        onChange={(e) => { setRequestType(e.target.value as ArcoRequestType | ''); setPage(1); }}
                        className="input-tech px-3 py-2 w-auto"
                    >
                        <option value="">All types</option>
                        {REQUEST_TYPES.map((t) => (
                            <option key={t} value={t}>{REQUEST_TYPE_META[t].label}</option>
                        ))}
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={() => { setStatus(''); setRequestType(''); setSearch(''); setPage(1); }}
                            className="flex items-center gap-1 text-xs text-[color:var(--text-3)] hover:text-[color:var(--text-1)]"
                        >
                            <X size={14} /> Clear
                        </button>
                    )}
                </div>

                {/* Table */}
                {listQuery.isLoading ? (
                    <div className="p-4"><SkeletonTable rows={6} /></div>
                ) : listQuery.isError ? (
                    <div className="p-4">
                        <ErrorState message="Failed to load ARCO requests" onRetry={() => listQuery.refetch()} />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            title="No ARCO requests found"
                            message="Try adjusting your filters or create a new request."
                            action={
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="btn-ghost px-4 py-2 gap-2"
                                >
                                    <Plus size={16} /> New Request
                                </button>
                            }
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-[color:var(--text-2)]">
                            <thead className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] font-semibold uppercase text-xs border-b border-[color:var(--border-1)]">
                                <tr>
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Subject</th>
                                    <th className="px-4 py-3">Requested By</th>
                                    <th className="px-4 py-3">Created</th>
                                    <th className="px-4 py-3">Due Date</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[color:var(--border-1)]">
                                {requests.map((req: ArcoRequest) => {
                                    const typeMeta = REQUEST_TYPE_META[req.requestType];
                                    const statusMeta = STATUS_META[req.status];
                                    const TypeIcon = typeMeta.icon;
                                    const StatusIcon = statusMeta.icon;
                                    return (
                                        <tr key={req.id} className="hover:bg-[color:var(--surface-2)] transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs">#{req.id}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border bg-[color:var(--surface-2)] ${typeMeta.color}`}>
                                                    <TypeIcon size={12} /> {typeMeta.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border ${statusMeta.color}`}>
                                                    <StatusIcon size={12} className={req.status === 'in_review' ? 'animate-spin' : ''} />
                                                    {statusMeta.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-[color:var(--text-1)]">{req.subjectName || '—'}</span>
                                                    <span className="text-xs text-[color:var(--text-3)] font-mono">{req.subjectCedula}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs">{req.requestedBy}</td>
                                            <td className="px-4 py-3 text-xs text-[color:var(--text-3)]">{formatDate(req.createdAt)}</td>
                                            <td className="px-4 py-3 text-xs text-[color:var(--text-3)]">
                                                {req.dueDate ? formatDate(req.dueDate) : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => setSelectedRequest(req)}
                                                        className="p-1.5 rounded-lg text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] hover:bg-[color:var(--surface-3)]"
                                                        title="View details"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                    {req.status !== 'completed' && req.status !== 'rejected' && (
                                                        <button
                                                            onClick={() => {
                                                                setStatusUpdateTarget(req);
                                                                setPendingStatus('in_review');
                                                            }}
                                                            className="p-1.5 rounded-lg text-[color:var(--text-3)] hover:text-amber-300 hover:bg-[color:var(--surface-3)]"
                                                            title="Update status"
                                                        >
                                                            <Clock size={16} />
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
                {pagination && pagination.total > 0 && (
                    <div className="px-4 py-3 border-t border-[color:var(--border-1)] flex justify-between items-center bg-[color:var(--surface-2)]">
                        <div className="text-sm text-[color:var(--text-3)]">
                            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50"
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                                disabled={page === pagination.pages}
                                className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail modal */}
            {selectedRequest && (
                <ArcoDetailModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />
            )}

            {/* Create modal */}
            {showCreateModal && tenantSlug && (
                <ArcoCreateModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={async (payload: ArcoCreatePayload) => {
                        try {
                            await createMutation.mutateAsync({ tenantSlug, payload });
                            toast.success('ARCO request created');
                            setShowCreateModal(false);
                        } catch {
                            toast.error('Failed to create request');
                        }
                    }}
                    loading={createMutation.isPending}
                />
            )}

            {/* Status update confirmation */}
            <ConfirmDialog
                isOpen={!!statusUpdateTarget && !!pendingStatus}
                title="Update ARCO Status"
                message={`Change request #${statusUpdateTarget?.id} status to ${pendingStatus ? STATUS_META[pendingStatus].label : ''}?`}
                confirmText="Update"
                variant="info"
                notesLabel="Add a note (optional)"
                notesPlaceholder="Provide context for this status change..."
                onConfirm={handleStatusUpdate}
                onCancel={() => { setStatusUpdateTarget(null); setPendingStatus(null); }}
            />
        </div>
    );
};

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

const ArcoDetailModal = ({ request, onClose }: { request: ArcoRequest; onClose: () => void }) => {
    const typeMeta = REQUEST_TYPE_META[request.requestType];
    const statusMeta = STATUS_META[request.status];
    const TypeIcon = typeMeta.icon;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="panel-tech rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)]" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-1)]">
                    <div className="flex items-center gap-3">
                        <TypeIcon className="text-[color:var(--accent-0)]" size={22} />
                        <div>
                            <h2 className="text-base font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">
                                ARCO Request #{request.id}
                            </h2>
                            <p className="text-xs text-[color:var(--text-3)]">{typeMeta.label} Request</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-[color:var(--text-3)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)]"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    {/* Status badge */}
                    <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${statusMeta.color}`}>
                            {statusMeta.label}
                        </span>
                        <span className="text-xs text-[color:var(--text-3)]">
                            Created {formatDateTime(request.createdAt)}
                        </span>
                    </div>

                    {/* Subject info */}
                    <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-1)] grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Subject Name</p>
                            <p className="text-sm font-medium text-[color:var(--text-1)]">{request.subjectName || '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Cedula</p>
                            <p className="text-sm font-mono text-[color:var(--text-1)]">{request.subjectCedula}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Requested By</p>
                            <p className="text-sm text-[color:var(--text-2)]">{request.requestedBy}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Due Date</p>
                            <p className="text-sm text-[color:var(--text-2)]">{request.dueDate ? formatDate(request.dueDate) : '—'}</p>
                        </div>
                    </div>

                    {/* Reason */}
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Reason</p>
                        <p className="text-sm text-[color:var(--text-2)] bg-[color:var(--surface-2)] rounded-lg p-3 border border-[color:var(--border-1)]">
                            {request.reason}
                        </p>
                    </div>

                    {request.details && (
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Additional Details</p>
                            <p className="text-sm text-[color:var(--text-2)] bg-[color:var(--surface-2)] rounded-lg p-3 border border-[color:var(--border-1)]">
                                {request.details}
                            </p>
                        </div>
                    )}

                    {/* Timeline */}
                    {request.timeline && request.timeline.length > 0 && (
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-3">Status Timeline</p>
                            <div className="space-y-3">
                                {request.timeline.map((event, idx) => {
                                    const eventMeta = STATUS_META[event.status];
                                    return (
                                        <div key={idx} className="flex items-start gap-3">
                                            <div className="mt-1 w-2 h-2 rounded-full bg-[color:var(--accent-0)]" />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-[color:var(--text-1)]">
                                                        {eventMeta.label}
                                                    </span>
                                                    <span className="text-xs text-[color:var(--text-3)]">
                                                        {formatDateTime(event.changedAt)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-[color:var(--text-3)]">
                                                    by {event.changedBy}
                                                </p>
                                                {event.notes && (
                                                    <p className="text-xs text-[color:var(--text-2)] mt-1">
                                                        {event.notes}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

const ArcoCreateModal = ({
    onClose,
    onSubmit,
    loading,
}: {
    onClose: () => void;
    onSubmit: (payload: ArcoCreatePayload) => void;
    loading: boolean;
}) => {
    const [requestType, setRequestType] = useState<ArcoRequestType>('access');
    const [subjectCedula, setSubjectCedula] = useState('');
    const [subjectName, setSubjectName] = useState('');
    const [reason, setReason] = useState('');
    const [details, setDetails] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!subjectCedula.trim()) {
            toast.error('Subject cedula is required');
            return;
        }
        if (!reason.trim()) {
            toast.error('Reason is required');
            return;
        }
        onSubmit({
            requestType,
            subjectCedula: subjectCedula.trim(),
            subjectName: subjectName.trim() || undefined,
            reason: reason.trim(),
            details: details.trim() || undefined,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="panel-tech rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col relative">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)]" />

                <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-1)]">
                    <div className="flex items-center gap-3">
                        <Plus className="text-[color:var(--accent-0)]" size={22} />
                        <h2 className="text-base font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">
                            New ARCO Request
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-[color:var(--text-3)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)]"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
                    {/* Request type */}
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Request Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {REQUEST_TYPES.map((type) => {
                                const meta = REQUEST_TYPE_META[type];
                                const Icon = meta.icon;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setRequestType(type)}
                                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                                            requestType === type
                                                ? 'border-[color:var(--accent-0)] bg-[color:var(--accent-0)]/10 text-[color:var(--accent-0)]'
                                                : 'border-[color:var(--border-1)] text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)]'
                                        }`}
                                    >
                                        <Icon size={16} /> {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Subject cedula */}
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Subject Cedula *
                        </label>
                        <input
                            type="text"
                            value={subjectCedula}
                            onChange={(e) => setSubjectCedula(e.target.value)}
                            className="input-tech"
                            placeholder="e.g. V-12345678"
                            required
                        />
                    </div>

                    {/* Subject name */}
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Subject Name (optional)
                        </label>
                        <input
                            type="text"
                            value={subjectName}
                            onChange={(e) => setSubjectName(e.target.value)}
                            className="input-tech"
                            placeholder="Full name"
                        />
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Reason *
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="input-tech resize-none"
                            rows={3}
                            placeholder="Describe the reason for this request..."
                            required
                        />
                    </div>

                    {/* Details */}
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Additional Details (optional)
                        </label>
                        <textarea
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            className="input-tech resize-none"
                            rows={2}
                            placeholder="Any additional context..."
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 btn-ghost py-2.5 text-sm font-semibold">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2.5 px-4 rounded-lg bg-[color:var(--accent-0)] hover:bg-[color:var(--accent-1)] text-[#081116] font-semibold text-sm transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Request'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
