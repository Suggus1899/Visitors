import { useState, useMemo, useCallback } from 'react';
import {
    useVisitorListQuery,
    useCompaniesQuery,
    useUpdateVisitorMutation,
    useDeleteVisitorMutation,
    useAdminApi,
} from '../services/useAdminQueries';
import { ConfirmDialog, VisitorDetailsModal, SkeletonTable } from '@logmaster/ui';
import type { Visit, Visitor } from '@logmaster/types';
import toast from 'react-hot-toast';

import Search from 'lucide-react/dist/esm/icons/search';
import Download from 'lucide-react/dist/esm/icons/download';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Ban from 'lucide-react/dist/esm/icons/ban';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Mail from 'lucide-react/dist/esm/icons/mail';
import Phone from 'lucide-react/dist/esm/icons/phone';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import UsersIcon from 'lucide-react/dist/esm/icons/users';

const ITEMS_PER_PAGE = 20;

const VisitorsPage = () => {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [companyFilter, setCompanyFilter] = useState('');
    const [hasEmail, setHasEmail] = useState(false);
    const [hasPhone, setHasPhone] = useState(false);
    const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Visitor | null>(null);
    const [blockTarget, setBlockTarget] = useState<Visitor | null>(null);
    const [blockReason, setBlockReason] = useState('');

    const api = useAdminApi();
    const updateMutation = useUpdateVisitorMutation();
    const deleteMutation = useDeleteVisitorMutation();

    const filters = useMemo(
        () => ({
            page,
            limit: ITEMS_PER_PAGE,
            company: companyFilter || undefined,
            search: search || undefined,
        }),
        [page, companyFilter, search]
    );

    const { data, isLoading, refetch } = useVisitorListQuery(filters);
    const { data: companies = [] } = useCompaniesQuery();

    const allVisitors = data?.visitors || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

    // Client-side filter for hasEmail / hasPhone (not supported by backend yet)
    const visitors = useMemo(() => {
        return allVisitors.filter((v: Visitor) => {
            if (hasEmail && !v.email) return false;
            if (hasPhone && !v.phone) return false;
            return true;
        });
    }, [allVisitors, hasEmail, hasPhone]);

    const handleExportCSV = useCallback(() => {
        const headers = ['Cedula', 'First Name', 'Last Name', 'Company', 'Job Title', 'Email', 'Phone', 'Blocked', 'Observations'];
        const rows = visitors.map((v: Visitor) => [
            v.cedula,
            v.first_name,
            v.last_name,
            v.company,
            v.job_title || '',
            v.email || '',
            v.phone || '',
            v.isBlocked ? 'Yes' : 'No',
            (v.observations || '').replace(/"/g, '""'),
        ]);

        const csv = [
            headers.join(','),
            ...rows.map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `visitors-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exported successfully');
    }, [visitors]);

    const handleToggleBlock = (visitor: Visitor) => {
        if (visitor.isBlocked) {
            // Unblocking — proceed directly
            updateMutation.mutate(
                { cedula: visitor.cedula, data: { isBlocked: false, observations: '' } },
                {
                    onSuccess: () => {
                        toast.success('Visitor unblocked');
                        refetch();
                    },
                    onError: () => toast.error('Failed to update visitor'),
                }
            );
        } else {
            // Blocking — show reason modal
            setBlockTarget(visitor);
            setBlockReason('');
        }
    };

    const handleConfirmBlock = () => {
        if (!blockTarget) return;
        updateMutation.mutate(
            {
                cedula: blockTarget.cedula,
                data: { isBlocked: true, observations: blockReason },
            },
            {
                onSuccess: () => {
                    toast.success('Visitor blocked');
                    setBlockTarget(null);
                    refetch();
                },
                onError: () => toast.error('Failed to block visitor'),
            }
        );
    };

    const handleConfirmDelete = () => {
        if (!deleteTarget) return;
        deleteMutation.mutate(deleteTarget.cedula, {
            onSuccess: () => {
                toast.success('Visitor deleted');
                setDeleteTarget(null);
                refetch();
            },
            onError: () => toast.error('Failed to delete visitor'),
        });
    };

    const photoUrl = (cedula: string) => api.getVisitorPhotoUrl(cedula);

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Visitantes</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">Manage visitor records</p>
                </div>
                <button
                    onClick={handleExportCSV}
                    disabled={visitors.length === 0}
                    className="btn-ghost px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                    <Download size={16} /> Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className="panel-tech rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {/* Search */}
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]" />
                        <input
                            type="text"
                            placeholder="Search by name or cedula..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="input-tech pl-10 text-sm"
                        />
                    </div>

                    {/* Company filter */}
                    <select
                        value={companyFilter}
                        onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
                        className="input-tech text-sm"
                    >
                        <option value="">All companies</option>
                        {companies.map((c: string) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>

                    {/* Has email */}
                    <label className="flex items-center gap-2 text-sm text-[color:var(--text-2)] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hasEmail}
                            onChange={(e) => setHasEmail(e.target.checked)}
                            className="rounded"
                        />
                        <Mail size={16} className="text-[color:var(--text-3)]" />
                        Has email
                    </label>

                    {/* Has phone */}
                    <label className="flex items-center gap-2 text-sm text-[color:var(--text-2)] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hasPhone}
                            onChange={(e) => setHasPhone(e.target.checked)}
                            className="rounded"
                        />
                        <Phone size={16} className="text-[color:var(--text-3)]" />
                        Has phone
                    </label>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-sm">
                        <span className="text-[color:var(--text-2)]">
                            Total: <strong className="text-[color:var(--text-1)]">{total}</strong>
                        </span>
                        <span className="text-[color:var(--text-2)]">
                            Blocked: <strong className="text-red-400">{visitors.filter((v: Visitor) => v.isBlocked).length}</strong>
                        </span>
                    </div>
                    <button onClick={() => refetch()} className="btn-ghost px-3 py-1.5 text-sm flex items-center gap-1">
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="panel-tech rounded-xl overflow-hidden">
                {isLoading ? (
                    <div className="p-5"><SkeletonTable rows={8} /></div>
                ) : visitors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[color:var(--text-3)]">
                        <UsersIcon size={40} className="mb-3 opacity-30" />
                        <p className="font-medium text-sm">No visitors found</p>
                        <p className="text-xs mt-1 opacity-60">Try adjusting your filters</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] uppercase text-xs">
                                    <th className="text-left p-4 font-semibold">Photo</th>
                                    <th className="text-left p-4 font-semibold">Cedula</th>
                                    <th className="text-left p-4 font-semibold">Name</th>
                                    <th className="text-left p-4 font-semibold">Company</th>
                                    <th className="text-left p-4 font-semibold">Contact</th>
                                    <th className="text-left p-4 font-semibold">Status</th>
                                    <th className="text-left p-4 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visitors.map((visitor: Visitor) => (
                                    <tr
                                        key={visitor.cedula}
                                        onClick={() => setSelectedVisitor(visitor)}
                                        className={`hover:bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] last:border-0 transition-colors cursor-pointer ${
                                            visitor.isBlocked ? 'bg-red-500/5' : ''
                                        }`}
                                    >
                                        <td className="p-4">
                                            <img
                                                src={photoUrl(visitor.cedula)}
                                                alt={visitor.first_name}
                                                className="w-10 h-10 rounded-lg object-cover border border-[color:var(--border-1)] bg-[color:var(--surface-2)]"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </td>
                                        <td className="p-4 font-mono text-[color:var(--text-2)]">{visitor.cedula}</td>
                                        <td className="p-4 text-[color:var(--text-1)] font-medium">
                                            {visitor.first_name} {visitor.last_name}
                                        </td>
                                        <td className="p-4 text-[color:var(--text-2)]">{visitor.company}</td>
                                        <td className="p-4 text-[color:var(--text-3)] text-xs">
                                            {visitor.email && <div className="flex items-center gap-1"><Mail size={12} /> {visitor.email}</div>}
                                            {visitor.phone && <div className="flex items-center gap-1"><Phone size={12} /> {visitor.phone}</div>}
                                            {!visitor.email && !visitor.phone && <span>—</span>}
                                        </td>
                                        <td className="p-4">
                                            {visitor.isBlocked ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                                                    <Ban size={12} /> Blocked
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                    <CheckCircle size={12} /> Active
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleToggleBlock(visitor); }}
                                                    disabled={updateMutation.isPending}
                                                    className={`p-1.5 rounded transition-colors ${
                                                        visitor.isBlocked
                                                            ? 'text-emerald-400 hover:bg-emerald-500/10'
                                                            : 'text-amber-400 hover:bg-amber-500/10'
                                                    }`}
                                                    title={visitor.isBlocked ? 'Unblock' : 'Block'}
                                                    aria-label={visitor.isBlocked ? 'Unblock visitor' : 'Block visitor'}
                                                >
                                                    {visitor.isBlocked ? <CheckCircle size={16} /> : <Ban size={16} />}
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(visitor); }}
                                                    disabled={deleteMutation.isPending}
                                                    className="p-1.5 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                                                    title="Delete"
                                                    aria-label="Delete visitor"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
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
                            Page {page} of {totalPages}
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

            {/* Visitor Details Modal (with edit + history) */}
            <VisitorDetailsModal
                visit={selectedVisitor ? {
                    id: 0,
                    visitor_cedula: selectedVisitor.cedula,
                    reason: 'Visitor Profile (Historical)',
                    status: selectedVisitor.isBlocked ? 'completed' : 'active',
                    Visitor: {
                        ...selectedVisitor,
                        photo_url: photoUrl(selectedVisitor.cedula),
                        id_photo_url: api.getVisitorIdPhotoUrl(selectedVisitor.cedula),
                    },
                } as Visit : null}
                isOpen={!!selectedVisitor}
                onClose={() => setSelectedVisitor(null)}
                onVisitorUpdated={async () => {
                    const result = await refetch();
                    if (selectedVisitor && result.data?.visitors) {
                        const updated = result.data.visitors.find((v: Visitor) => v.cedula === selectedVisitor.cedula);
                        if (updated) setSelectedVisitor(updated);
                    }
                }}
            />

            {/* Block confirmation modal */}
            {blockTarget && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setBlockTarget(null)}
                >
                    <div
                        className="panel-tech rounded-2xl max-w-md w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-full bg-amber-500/10">
                                <Shield size={20} className="text-amber-400" />
                            </div>
                            <h3 className="text-lg font-display uppercase tracking-[0.15em] text-[color:var(--text-1)]">
                                Block Visitor
                            </h3>
                        </div>
                        <p className="text-sm text-[color:var(--text-2)] mb-4">
                            C.I. <strong>{blockTarget.cedula}</strong> — {blockTarget.first_name} {blockTarget.last_name}
                        </p>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Reason for blocking
                        </label>
                        <textarea
                            value={blockReason}
                            onChange={(e) => setBlockReason(e.target.value)}
                            placeholder="Enter the reason for blocking..."
                            rows={3}
                            className="input-tech w-full mb-4 resize-none"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setBlockTarget(null)} className="flex-1 btn-ghost py-2.5 text-sm">
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmBlock}
                                disabled={!blockReason.trim() || updateMutation.isPending}
                                className="flex-1 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                            >
                                {updateMutation.isPending ? 'Blocking...' : 'Block'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            <ConfirmDialog
                isOpen={!!deleteTarget}
                title="Delete Visitor"
                message={`Are you sure you want to delete ${deleteTarget?.first_name} ${deleteTarget?.last_name} (C.I. ${deleteTarget?.cedula})? This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
                onConfirm={handleConfirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
};

export default VisitorsPage;
