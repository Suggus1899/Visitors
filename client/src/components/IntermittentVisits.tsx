import React, { useState } from 'react';
import LogIn from 'lucide-react/dist/esm/icons/log-in';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Briefcase from 'lucide-react/dist/esm/icons/briefcase';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up';
import User from 'lucide-react/dist/esm/icons/user';
import { IntermittentVisit } from '../types';
import { SkeletonVisitCard } from './ui/Skeleton';
import { useReactivateVisitMutation, useLiveDuration } from '../hooks/useVisitQueries';
import { VisitService } from '../services/api.v1';
import { sanitizeInput } from '../utils/sanitizer';
import toast from 'react-hot-toast';
import IntermittentAccessLog from './IntermittentAccessLog';
import { IntermittentLog } from '../types';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface IntermittentVisitsProps {
    visits: IntermittentVisit[];
    onReactivated: () => void;
    loading?: boolean;
}

const formatMinutes = (mins: number): string => {
    if (mins < 60) return `${mins}m fuera`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m fuera`;
};

// Component for live duration counter
const LiveDurationBadge: React.FC<{ startTime: string | Date }> = ({ startTime }) => {
    const { formatted } = useLiveDuration(startTime);
    
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-400/50 whitespace-nowrap flex-shrink-0 animate-pulse">
            <Clock size={10} />
            {formatted} fuera
        </span>
    );
};

const IntermittentVisits: React.FC<IntermittentVisitsProps> = ({ visits, onReactivated, loading = false }) => {
    const [reactivating, setReactivating] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const reactivateMutation = useReactivateVisitMutation();

    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        variant: 'danger' | 'warning' | 'info';
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, variant: 'info' });

    const handleReactivate = (e: React.MouseEvent, id: number, visitorName: string) => {
        e.stopPropagation();
        setConfirmDialog({
            isOpen: true,
            title: 'Confirmar Reingreso',
            message: `¿Confirmar reingreso de ${visitorName}?`,
            variant: 'info',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                setReactivating(id);
                try {
                    await reactivateMutation.mutateAsync(id);
                    toast.success(`¡Bienvenido de vuelta, ${visitorName}!`);
                    if (onReactivated) onReactivated();
                } catch {
                    toast.error('Error al registrar reingreso');
                } finally {
                    setReactivating(null);
                }
            }
        });
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => <SkeletonVisitCard key={i} />)}
            </div>
        );
    }

    if (!visits || visits.length === 0) {
        return (
            <div className="text-center p-12 panel-tech rounded-2xl border border-dashed border-[color:var(--border-1)]">
                <User className="mx-auto h-12 w-12 text-[color:var(--text-3)]" />
                <p className="mt-2 text-sm font-semibold text-[color:var(--text-1)]">Sin visitas en intermitencia</p>
                <p className="mt-1 text-sm text-[color:var(--text-3)]">Los visitantes con salida temporal aparecen aquí.</p>
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {visits.map((visit) => {
                    const visitorName = sanitizeInput(visit.visitorName || 'Visitante');
                    const company = sanitizeInput(visit.company || 'Sin empresa');
                    const purpose = sanitizeInput(visit.purpose || 'Visita');
                    const isReactivating = reactivating === visit.id;
                    const isExpanded = expandedId === visit.id;
                    const photoUrl = visit.visitorCedula
                        ? VisitService.getVisitorPhotoUrl(visit.visitorCedula)
                        : undefined;

                    const adaptedLogs: IntermittentLog[] = visit.intervals.map((interval, idx) => ({
                        id: interval.id ?? idx,
                        visit_id: visit.id,
                        check_out: interval.exitTime,
                        re_entry: interval.reentryTime ?? null,
                        notes: interval.notes ?? null
                    }));

                    return (
                        <div
                            key={visit.id}
                            className="group panel-tech rounded-2xl transition-all duration-300 overflow-visible border border-amber-500/30 flex flex-col relative transform hover:-translate-y-1 hover:shadow-md"
                        >
                            <div className="p-5 flex items-start space-x-4 flex-grow">
                                {/* Photo */}
                                <div className="relative flex-shrink-0">
                                    {photoUrl ? (
                                        <img
                                            src={photoUrl}
                                            alt={visitorName}
                                            className="w-14 h-14 rounded-2xl object-cover shadow-sm bg-[color:var(--surface-0)] border border-amber-400/30 group-hover:scale-105 transition-transform duration-500"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src =
                                                    'https://ui-avatars.com/api/?background=1b232a&color=e5edf5&name=' + encodeURIComponent(visitorName);
                                            }}
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-2xl bg-[color:var(--surface-2)] flex items-center justify-center text-[color:var(--text-2)] font-bold text-xl shadow-inner border border-amber-400/30">
                                            {visitorName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    {/* Amber pulse indicator */}
                                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 animate-pulse border-2 border-[color:var(--bg-0)]" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    {/* Nombre y badge en una línea */}
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="text-base font-semibold text-[color:var(--text-1)] group-hover:text-amber-300 transition-colors leading-tight">
                                            {visitorName}
                                        </h3>
                                        {/* Live counter for current intermittent period */}
                                        {visit.lastExitTime ? (
                                            <LiveDurationBadge startTime={visit.lastExitTime} />
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-400/50 whitespace-nowrap flex-shrink-0">
                                                <Clock size={10} />
                                                {formatMinutes(visit.minutesOutside)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Info secundaria: empresa y cédula */}
                                    <div className="mt-1 space-y-0.5">
                                        <div className="flex items-center text-xs text-[color:var(--text-2)]">
                                            <Briefcase size={12} className="mr-1.5 opacity-70 flex-shrink-0" />
                                            <span className="font-medium truncate">{company}</span>
                                        </div>
                                        <div className="flex items-center text-xs text-[color:var(--text-3)] font-mono">
                                            C.I. {visit.visitorCedula}
                                        </div>
                                    </div>

                                    {/* Propósito */}
                                    <div className="mt-2">
                                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-[color:var(--surface-2)] text-[color:var(--text-2)] border border-[color:var(--border-1)]">
                                            {purpose}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-3 border-t border-amber-500/20 bg-amber-500/5 mt-auto">
                                <div className="flex items-center justify-between">
                                    {/* Exit time + intervals toggle */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center text-[color:var(--text-3)] text-xs font-medium">
                                            <Clock size={13} className="mr-1.5 flex-shrink-0" />
                                            <span className="whitespace-nowrap">Salió: {new Date(visit.lastExitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <button
                                            onClick={() => setExpandedId(isExpanded ? null : visit.id)}
                                            className="flex items-center gap-0.5 text-[10px] text-[color:var(--text-3)] hover:text-amber-300 transition-colors px-1 py-0.5 rounded hover:bg-amber-500/10"
                                        >
                                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            <span className="font-medium">{visit.intervals.length}</span>
                                        </button>
                                    </div>

                                    {/* Reingreso button */}
                                    <button
                                        onClick={(e) => handleReactivate(e, visit.id, visitorName)}
                                        disabled={isReactivating}
                                        className="group/rbtn relative px-3 py-1.5 rounded-lg border border-emerald-500/50 text-emerald-300 text-[11px] font-semibold hover:border-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
                                    >
                                        {isReactivating ? (
                                            <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <LogIn size={12} />
                                        )}
                                        <span>REGRESÓ</span>
                                    </button>
                                </div>

                                {/* Expanded interval history */}
                                {isExpanded && (
                                    <div className="mt-3 pt-3 border-t border-amber-500/20">
                                        <IntermittentAccessLog logs={adaptedLogs} />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <ConfirmDialog
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                variant={confirmDialog.variant}
                confirmText="Confirmar"
                cancelText="Cancelar"
                onConfirm={confirmDialog.onConfirm}
                onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            />
        </>
    );
};

export default IntermittentVisits;
