import React, { useState } from 'react';
import { useAllVisitorsQuery, useUpdateVisitorMutation, useRecentVisitsQuery } from '@logmaster/api';
import { Ban, CheckCircle, Search, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { VisitorDetailsModal, RecentVisits } from '@logmaster/ui';
import { API_URL } from '@logmaster/config';
import { Visit } from '@logmaster/types';


const RecentVisitsPanel: React.FC = () => {
    const [expanded, setExpanded] = useState(false);
    const { data: recentVisits = [], isFetching } = useRecentVisitsQuery();

    if (recentVisits.length === 0 && !isFetching) return null;

    const shown = expanded ? recentVisits : recentVisits.slice(0, 3);

    return (
        <div className="mb-6 bg-[color:var(--surface-1)] border border-[color:var(--border-1)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                <span className="text-xs font-semibold uppercase tracking-widest text-rose-400 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                    Últimas Salidas
                    {recentVisits.length > 0 && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-400/20 px-1.5 py-0.5 rounded-full">
                            {recentVisits.length}
                        </span>
                    )}
                </span>
                {recentVisits.length > 3 && (
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="text-[11px] text-[color:var(--text-3)] hover:text-[color:var(--text-1)] transition"
                    >
                        {expanded ? 'Ver menos ↑' : `Ver todos (${recentVisits.length}) ↓`}
                    </button>
                )}
            </div>
            <div className="p-3">
                <RecentVisits visits={shown} loading={isFetching && recentVisits.length === 0} />
            </div>
        </div>
    );
};

export const VisitorAdmin: React.FC = () => {
    const [page, setPage] = useState(1);
    const [companyFilter, setCompanyFilter] = useState('');
    const [cedulaFilter, setCedulaFilter] = useState('');
    const [editingVisitor, setEditingVisitor] = useState<{ cedula: string; observations: string } | null>(null);
    const [selectedVisitor, setSelectedVisitor] = useState<any>(null);
    const limit = 20;

    const { data, isLoading, refetch } = useAllVisitorsQuery(page, limit, companyFilter || undefined);
    const updateMutation = useUpdateVisitorMutation();

    const allVisitors = data?.visitors || [];
    // Local filter by cedula (strips V- prefix for comparison)
    const visitors = cedulaFilter
        ? allVisitors.filter(v => (v.cedula || '').replace(/^V-/, '').includes(cedulaFilter))
        : allVisitors;
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const handleToggleBlock = async (cedula: string, currentStatus: boolean) => {
        try {
            if (!currentStatus) {
                // Blocking - show edit modal first
                setEditingVisitor({ cedula, observations: '' });
                return;
            }

            // Unblocking - proceed directly
            await updateMutation.mutateAsync({
                cedula,
                data: { isBlocked: false, observations: '' }
            });
            toast.success('Visitante desbloqueado');
            refetch();
        } catch {
            toast.error('Error al actualizar estado');
        }
    };

    const handleBlockWithReason = async () => {
        if (!editingVisitor) return;

        try {
            await updateMutation.mutateAsync({
                cedula: editingVisitor.cedula,
                data: { isBlocked: true, observations: editingVisitor.observations }
            });
            toast.success('Visitante bloqueado');
            setEditingVisitor(null);
            refetch();
        } catch {
            toast.error('Error al bloquear visitante');
        }
    };

    if (isLoading) {
        return (
            <div className="panel-tech p-6 rounded-2xl">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-[color:var(--accent-0)] border-t-transparent rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="panel-tech p-6 rounded-2xl">
            <div className="absolute inset-x-0 top-0 h-1 bg-[color:var(--accent-0)]" />

            <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6 text-[color:var(--accent-0)]" />
                <h2 className="text-lg font-display uppercase tracking-[0.2em] text-[color:var(--text-1)]">
                    Administración de Visitantes
                </h2>
            </div>

            {/* Recent Departures */}
            <RecentVisitsPanel />

            {/* Filters */}
            <div className="mb-4 flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-3)]" />
                    <input
                        type="text"
                        placeholder="Filtrar por empresa..."
                        value={companyFilter}
                        onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
                        className="input-tech w-full pl-10"
                    />
                </div>
                <div className="relative min-w-[160px]" title="Búsqueda local por cédula exacta (sin prefijo V-)">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-3)]" />
                    <input
                        type="text"
                        placeholder="Buscar por cédula..."
                        value={cedulaFilter}
                        onChange={(e) => { setCedulaFilter(e.target.value.replace(/\D/g, '')); setPage(1); }}
                        className="input-tech w-full pl-10"
                    />
                </div>
                <button
                    onClick={() => refetch()}
                    className="btn-ghost px-4 py-2 text-sm"
                >
                    Actualizar
                </button>
            </div>

            {/* Stats */}
            <div className="flex gap-4 mb-4 text-sm">
                <span className="text-[color:var(--text-2)]">
                    Total: <strong className="text-[color:var(--text-1)]">{total}</strong>
                </span>
                <span className="text-[color:var(--text-2)]">
                    Bloqueados: <strong className="text-red-400">{visitors.filter(v => v.isBlocked).length}</strong>
                </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[color:var(--border-1)]">
                            <th className="text-left py-3 px-2 text-[color:var(--text-2)] font-semibold">Cédula</th>
                            <th className="text-left py-3 px-2 text-[color:var(--text-2)] font-semibold">Nombre</th>
                            <th className="text-left py-3 px-2 text-[color:var(--text-2)] font-semibold">Empresa</th>
                            <th className="text-left py-3 px-2 text-[color:var(--text-2)] font-semibold">Estado</th>
                            <th className="text-left py-3 px-2 text-[color:var(--text-2)] font-semibold">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visitors.map((visitor) => (
                            <tr
                                key={visitor.cedula}
                                onClick={() => setSelectedVisitor(visitor)}
                                className={`border-b border-[color:var(--border-1)] hover:bg-[color:var(--surface-2)] cursor-pointer transition-colors ${
                                    visitor.isBlocked ? 'bg-red-500/5' : ''
                                }`}
                            >
                                <td className="py-3 px-2 font-mono text-[color:var(--text-2)]">
                                    {visitor.cedula}
                                </td>
                                <td className="py-3 px-2 text-[color:var(--text-1)]">
                                    {visitor.first_name} {visitor.last_name}
                                </td>
                                <td className="py-3 px-2 text-[color:var(--text-2)]">
                                    {visitor.company}
                                </td>
                                <td className="py-3 px-2">
                                    {visitor.isBlocked ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                                            <Ban size={12} /> Bloqueado
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                            <CheckCircle size={12} /> Activo
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-2">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleBlock(visitor.cedula, !!visitor.isBlocked);
                                            }}
                                            disabled={updateMutation.isPending}
                                            className={`p-1.5 rounded transition-colors ${
                                                visitor.isBlocked
                                                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                                                    : 'text-red-400 hover:bg-red-500/10'
                                            }`}
                                            title={visitor.isBlocked ? 'Desbloquear' : 'Bloquear'}
                                        >
                                            {visitor.isBlocked ? <CheckCircle size={18} /> : <Ban size={18} />}
                                        </button>
                                        {visitor.isBlocked && visitor.observations && (
                                            <span className="text-xs text-[color:var(--text-3)] self-center max-w-[150px] truncate">
                                                {visitor.observations}
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-[color:var(--border-1)]">
                    <span className="text-sm text-[color:var(--text-3)]">
                        Página {page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="btn-ghost p-2 disabled:opacity-50"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="btn-ghost p-2 disabled:opacity-50"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Block Modal */}
            {editingVisitor && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setEditingVisitor(null)}
                >
                    <div
                        className="panel-tech rounded-2xl max-w-md w-full p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-display uppercase tracking-[0.2em] mb-4 text-[color:var(--text-1)]">
                            Bloquear Visitante
                        </h3>
                        <p className="text-sm text-[color:var(--text-2)] mb-4">
                            C.I. {editingVisitor.cedula}
                        </p>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                            Motivo del bloqueo
                        </label>
                        <textarea
                            value={editingVisitor.observations}
                            onChange={(e) => setEditingVisitor({ ...editingVisitor, observations: e.target.value })}
                            placeholder="Indique el motivo del bloqueo..."
                            className="input-tech w-full mb-4"
                            rows={3}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setEditingVisitor(null)}
                                className="flex-1 btn-ghost"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleBlockWithReason}
                                disabled={!editingVisitor.observations.trim() || updateMutation.isPending}
                                className="flex-1 btn-danger"
                            >
                                {updateMutation.isPending ? 'Bloqueando...' : 'Bloquear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Visitor Details Modal */}
            <VisitorDetailsModal
                visit={selectedVisitor ? {
                    id: 0,
                    visitor_cedula: selectedVisitor.cedula,
                    reason: 'Perfil de Visitante (Histórico)',
                    status: selectedVisitor.isBlocked ? 'completed' : 'active',
                    Visitor: {
                        ...selectedVisitor,
                        photo_url: `${API_URL}/visitors/${encodeURIComponent(selectedVisitor.cedula)}/photo?t=${new Date().getTime()}`,
                        id_photo_url: `${API_URL}/visitors/${encodeURIComponent(selectedVisitor.cedula)}/id-photo?t=${new Date().getTime()}`
                    }
                } as Visit : null}
                isOpen={!!selectedVisitor}
                onClose={() => setSelectedVisitor(null)}
                onVisitorUpdated={async () => {
                    const result = await refetch();
                    // Update selectedVisitor with fresh data from the refetched list
                    if (selectedVisitor && result.data?.visitors) {
                        const updated = result.data.visitors.find((v: any) => v.cedula === selectedVisitor.cedula);
                        if (updated) setSelectedVisitor(updated);
                    }
                }}
            />
        </div>
    );
};

export default VisitorAdmin;
