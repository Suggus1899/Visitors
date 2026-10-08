import React, { useEffect, useState, useCallback } from 'react';
import { VisitService } from '../services/api.v1';
import X from 'lucide-react/dist/esm/icons/x';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Clock from 'lucide-react/dist/esm/icons/clock';
import User from 'lucide-react/dist/esm/icons/user';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import ArrowRightLeft from 'lucide-react/dist/esm/icons/arrow-right-left';
import Timer from 'lucide-react/dist/esm/icons/timer';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import { Visit } from '../types';

interface VisitorHistoryModalProps {
    cedula: string;
    visitorName: string;
    isOpen: boolean;
    onClose: () => void;
    photoUrl?: string;
    company?: string;
}

const PAGE_SIZE = 10;

const statusConfig = {
    active:       { label: 'Activa',       color: 'text-[color:var(--accent-0)]',  bg: 'bg-[color:var(--accent-0)]/10',  border: 'border-[color:var(--accent-0)]/40',  dot: 'bg-[color:var(--accent-0)]' },
    waiting:      { label: 'En Espera',    color: 'text-yellow-400',               bg: 'bg-yellow-400/10',               border: 'border-yellow-400/40',               dot: 'bg-yellow-400' },
    intermittent: { label: 'Intermitente', color: 'text-amber-400',                bg: 'bg-amber-400/10',                border: 'border-amber-400/40',                dot: 'bg-amber-400' },
    completed:    { label: 'Completada',   color: 'text-[color:var(--text-3)]',    bg: 'bg-[color:var(--surface-2)]',    border: 'border-[color:var(--border-1)]',     dot: 'bg-[color:var(--text-3)]' },
};

const VisitorHistoryModal: React.FC<VisitorHistoryModalProps> = ({
    cedula,
    visitorName,
    isOpen,
    onClose,
    photoUrl,
    company,
}) => {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const fullCedula = cedula.startsWith('V') ? cedula : `V-${cedula}`;
            const res = await VisitService.getVisits({ visitorCedula: fullCedula, page: 1, limit: 200 });
            setVisits(res.visits);
        } catch {
            // empty on error
        } finally {
            setLoading(false);
        }
    }, [cedula]);

    useEffect(() => {
        if (isOpen && cedula) {
            setPage(1);
            fetchHistory();
        }
    }, [isOpen, cedula, fetchHistory]);

    if (!isOpen) return null;

    const fmt = (d: string) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    const getDuration = (visit: Visit): string | null => {
        const entry = visit.entry_time || visit.check_in_time || visit.check_in;
        const exit  = visit.exit_time  || visit.check_out_time || visit.check_out;
        if (!entry || !exit) return null;
        const mins = Math.round((new Date(exit).getTime() - new Date(entry).getTime()) / 60000);
        if (mins < 60) return `${mins} min`;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    const completed  = visits.filter(v => v.status === 'completed').length;
    const totalPages = Math.ceil(visits.length / PAGE_SIZE);
    const paginated  = visits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="panel-tech rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-slideUp"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] p-4 flex items-center gap-4 relative flex-shrink-0">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)]" />

                    {/* Photo / Avatar */}
                    {photoUrl ? (
                        <img src={photoUrl} alt={visitorName}
                            className="w-12 h-12 rounded-xl object-cover border border-[color:var(--border-1)] flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-xl bg-[color:var(--surface-1)] border border-[color:var(--border-1)] flex items-center justify-center flex-shrink-0">
                            <User size={24} className="text-[color:var(--text-3)]" />
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-display uppercase tracking-[0.15em] text-[color:var(--text-1)] leading-tight truncate">
                            {visitorName || 'Visitante'}
                        </h2>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs text-[color:var(--text-3)] font-mono">C.I. V-{cedula.replace(/^V-?/, '')}</span>
                            {company && (
                                <span className="text-xs text-[color:var(--text-2)] flex items-center gap-1">
                                    <Building2 size={11} /> {company}
                                </span>
                            )}
                        </div>
                    </div>

                    <button onClick={onClose}
                        className="p-2 text-[color:var(--text-2)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-1)] rounded-full transition flex-shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ── Stats bar ── */}
                {!loading && visits.length > 0 && (
                    <div className="grid grid-cols-3 divide-x divide-[color:var(--border-1)] border-b border-[color:var(--border-1)] bg-[color:var(--surface-1)]/50 flex-shrink-0">
                        <div className="py-2.5 px-4 text-center">
                            <p className="text-lg font-bold text-[color:var(--text-1)]">{visits.length}</p>
                            <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-3)]">Total</p>
                        </div>
                        <div className="py-2.5 px-4 text-center">
                            <p className="text-lg font-bold text-[color:var(--accent-0)]">{completed}</p>
                            <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-3)]">Completadas</p>
                        </div>
                        <div className="py-2.5 px-4 text-center">
                            <p className="text-lg font-bold text-amber-400">
                                {visits.reduce((s, v) => s + (v.intermittent_logs?.length ?? 0), 0)}
                            </p>
                            <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-3)]">Intermitencias</p>
                        </div>
                    </div>
                )}

                {/* ── Body ── */}
                <div className="p-4 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin w-8 h-8 border-4 border-[color:var(--accent-0)] border-t-transparent rounded-full" />
                        </div>
                    ) : visits.length === 0 ? (
                        <div className="text-center py-12 text-[color:var(--text-3)]">
                            <Calendar size={48} className="mx-auto mb-3 opacity-25" />
                            <p className="font-medium">Sin visitas registradas</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {paginated.map((visit) => {
                                const st      = statusConfig[visit.status] ?? statusConfig.completed;
                                const arrival = visit.arrival_time;
                                const entry   = visit.entry_time || visit.check_in_time || visit.check_in;
                                const exit    = visit.exit_time  || visit.check_out_time || visit.check_out;
                                const dur     = getDuration(visit);
                                const person  = visit.personToVisit || visit.person_to_visit || visit.host_person;
                                const reason  = visit.reason || visit.purpose;
                                const iLogs   = visit.intermittent_logs ?? [];

                                return (
                                    <div key={visit.id}
                                        className={`rounded-xl border ${st.border} bg-[color:var(--surface-2)] overflow-hidden`}
                                    >
                                        {/* Card top bar colored by status */}
                                        <div className={`h-0.5 w-full ${st.dot}`} />

                                        <div className="p-3 space-y-2.5">
                                            {/* Row 1: date + status badge + duration */}
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-1.5 text-xs text-[color:var(--text-2)]">
                                                    <Calendar size={13} />
                                                    <span className="font-medium">{fmtDate(entry || arrival || '')}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {dur && (
                                                        <span className="flex items-center gap-1 text-[10px] text-[color:var(--text-3)] bg-[color:var(--surface-1)] px-2 py-0.5 rounded-full border border-[color:var(--border-1)]">
                                                            <Timer size={10} /> {dur}
                                                        </span>
                                                    )}
                                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${st.color} ${st.bg} ${st.border}`}>
                                                        {st.label}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Row 2: times */}
                                            <div className="flex flex-wrap gap-2">
                                                {arrival && (
                                                    <span className="flex items-center gap-1 text-[11px] text-blue-400 bg-blue-500/10 border border-blue-400/20 px-2 py-0.5 rounded-md" title="Llegada">
                                                        <Clock size={10} /> Llegada: <strong>{fmt(arrival)}</strong>
                                                    </span>
                                                )}
                                                {entry && (
                                                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-400/20 px-2 py-0.5 rounded-md" title="Entrada">
                                                        <CheckCircle2 size={10} /> Entrada: <strong>{fmt(entry)}</strong>
                                                    </span>
                                                )}
                                                {exit && (
                                                    <span className="flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded-md" title="Salida">
                                                        <X size={10} /> Salida: <strong>{fmt(exit)}</strong>
                                                    </span>
                                                )}
                                            </div>

                                            {/* Row 3: reason + person */}
                                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                                                {reason && (
                                                    <span className="flex items-center gap-1 text-xs text-[color:var(--text-2)]">
                                                        <FileText size={11} className="text-[color:var(--text-3)]" />
                                                        {reason}
                                                    </span>
                                                )}
                                                {person && (
                                                    <span className="flex items-center gap-1 text-xs text-[color:var(--text-2)]">
                                                        <User size={11} className="text-[color:var(--text-3)]" />
                                                        {person}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Row 4: intermitencias badge */}
                                            {iLogs.length > 0 && (
                                                <div className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-400/20 px-2 py-1 rounded-md w-fit">
                                                    <ArrowRightLeft size={11} />
                                                    {iLogs.length} {iLogs.length === 1 ? 'intermitencia' : 'intermitencias'}
                                                    {iLogs.filter(l => !l.re_entry).length > 0 && (
                                                        <span className="ml-1 text-[10px] text-amber-300/70 animate-pulse">· fuera</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* ── Pagination ── */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="text-xs px-3 py-1 rounded-lg border border-[color:var(--border-1)] text-[color:var(--text-2)] disabled:opacity-30 hover:bg-[color:var(--surface-1)] transition"
                                    >
                                        ← Anterior
                                    </button>
                                    <span className="text-xs text-[color:var(--text-3)]">
                                        Página {page} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="text-xs px-3 py-1 rounded-lg border border-[color:var(--border-1)] text-[color:var(--text-2)] disabled:opacity-30 hover:bg-[color:var(--surface-1)] transition"
                                    >
                                        Siguiente →
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisitorHistoryModal;
