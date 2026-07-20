import React from 'react';
import type { Visit } from '@logmaster/types';
import { SkeletonVisitCard } from './Skeleton';
import { VisitService } from '@logmaster/api';
import { sanitizeInput } from '@logmaster/utils';
import Clock from 'lucide-react/dist/esm/icons/clock';
import User from 'lucide-react/dist/esm/icons/user';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import Timer from 'lucide-react/dist/esm/icons/timer';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import ArrowRightLeft from 'lucide-react/dist/esm/icons/arrow-right-left';

interface RecentVisitsProps {
    visits: Visit[];
    loading?: boolean;
}

const fmt = (d: string) =>
    new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

const getDuration = (visit: Visit): string | null => {
    const entry = visit.entry_time || visit.check_in_time || visit.check_in;
    const exit  = visit.exit_time  || visit.check_out_time || visit.check_out;
    if (!entry || !exit) return null;
    const mins = Math.round((new Date(exit).getTime() - new Date(entry).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const RecentVisits: React.FC<RecentVisitsProps> = ({ visits, loading = false }) => {
    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => <SkeletonVisitCard key={i} />)}
            </div>
        );
    }

    if (visits.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-[color:var(--text-3)]">
                <LogOut size={40} className="mb-3 opacity-25" />
                <p className="font-medium text-sm">Sin salidas recientes</p>
                <p className="text-xs mt-1 opacity-60">Las visitas completadas aparecerán aquí</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {visits.map((visit) => {
                const name = sanitizeInput(
                    visit.Visitor
                        ? `${visit.Visitor.first_name} ${visit.Visitor.last_name}`.trim()
                        : visit.visitor_cedula
                );
                const company  = sanitizeInput(visit.Visitor?.company || '');
                const reason   = sanitizeInput(visit.reason || visit.purpose || '');
                const person   = sanitizeInput(visit.personToVisit || visit.person_to_visit || visit.host_person || '');
                const dur      = getDuration(visit);
                const entry    = visit.entry_time || visit.check_in_time || visit.check_in;
                const exit     = visit.exit_time  || visit.check_out_time || visit.check_out;
                const iCount   = visit.intermittent_logs?.length ?? 0;
                const photoUrl = visit.visitor_cedula
                    ? VisitService.getVisitorPhotoUrl(visit.visitor_cedula)
                    : undefined;

                return (
                    <div key={visit.id}
                        className="bg-[color:var(--surface-2)] rounded-xl border border-[color:var(--border-1)] overflow-hidden hover:border-[color:var(--border-0)] transition-colors"
                    >
                        <div className="h-0.5 w-full bg-rose-500/60" />
                        <div className="p-3 flex gap-3">
                            {/* Photo */}
                            <div className="flex-shrink-0">
                                {photoUrl ? (
                                    <img
                                        src={photoUrl}
                                        alt={name}
                                        className="w-10 h-10 rounded-lg object-cover border border-[color:var(--border-1)]"
                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--border-1)] flex items-center justify-center">
                                        <User size={18} className="text-[color:var(--text-3)]" />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                                {/* Name + duration */}
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-[color:var(--text-1)] truncate">{name}</p>
                                    {dur && (
                                        <span className="flex items-center gap-1 text-[10px] text-[color:var(--text-3)] bg-[color:var(--surface-1)] px-2 py-0.5 rounded-full border border-[color:var(--border-1)] flex-shrink-0">
                                            <Timer size={10} /> {dur}
                                        </span>
                                    )}
                                </div>

                                {/* Company */}
                                {company && (
                                    <p className="text-xs text-[color:var(--text-3)] truncate">{company}</p>
                                )}

                                {/* Times */}
                                <div className="flex flex-wrap gap-2">
                                    {entry && (
                                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-400/20 px-1.5 py-0.5 rounded">
                                            <Clock size={10} /> Entrada: <strong>{fmt(entry)}</strong>
                                        </span>
                                    )}
                                    {exit && (
                                        <span className="flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-400/20 px-1.5 py-0.5 rounded">
                                            <LogOut size={10} /> Salida: <strong>{fmt(exit)}</strong>
                                        </span>
                                    )}
                                </div>

                                {/* Reason + Person + Intermitencias */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    {reason && (
                                        <span className="flex items-center gap-1 text-[11px] text-[color:var(--text-2)]">
                                            <FileText size={10} className="text-[color:var(--text-3)]" /> {reason}
                                        </span>
                                    )}
                                    {person && (
                                        <span className="flex items-center gap-1 text-[11px] text-[color:var(--text-2)]">
                                            <User size={10} className="text-[color:var(--text-3)]" /> {person}
                                        </span>
                                    )}
                                    {iCount > 0 && (
                                        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                                            <ArrowRightLeft size={10} /> {iCount} interm.
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default RecentVisits;
