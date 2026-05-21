import React, { useEffect, useState, useCallback } from 'react';
import { VisitService } from '../services/api.v1';
import X from 'lucide-react/dist/esm/icons/x';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import { Visit } from '../types';

interface VisitorHistoryModalProps {
    cedula: string;
    visitorName: string;
    isOpen: boolean;
    onClose: () => void;
}

const VisitorHistoryModal: React.FC<VisitorHistoryModalProps> = ({
    cedula,
    visitorName,
    isOpen,
    onClose
}) => {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            // Asegurar que la cédula tenga el prefijo V-
            const fullCedula = cedula.startsWith('V') ? cedula : `V-${cedula}`;
            const res = await VisitService.getVisits({
                visitorCedula: fullCedula,
                page: 1,
                limit: 100
            });
            setVisits(res.visits);
        } catch {
            // user sees empty history on error
        } finally {
            setLoading(false);
        }
    }, [cedula]);

    useEffect(() => {
        if (isOpen && cedula) {
            fetchHistory();
        }
    }, [isOpen, cedula, fetchHistory]);

    if (!isOpen) return null;

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTime = (date: string) => {
        return new Date(date).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="panel-tech rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden animate-slideUp"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] p-4 flex items-center justify-between relative">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)]" />
                    <div>
                        <h2 className="text-lg font-display uppercase tracking-[0.2em] text-[color:var(--text-1)]">Historial de Visitas</h2>
                        <p className="text-xs text-[color:var(--text-3)]">{visitorName} · C.I. V-{cedula.replace(/^V-?/, '')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-[color:var(--text-2)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-1)] rounded-full transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[60vh]">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin w-8 h-8 border-4 border-[color:var(--accent-0)] border-t-transparent rounded-full" />
                        </div>
                    ) : visits.length === 0 ? (
                        <div className="text-center py-8 text-[color:var(--text-3)]">
                            <Calendar size={48} className="mx-auto mb-2 opacity-30" />
                            <p>No hay visitas anteriores registradas</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-[color:var(--text-3)]">
                                Total: <strong className="text-[color:var(--text-1)]">{visits.length}</strong> visitas
                            </p>

                            <div className="relative">
                                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[color:var(--border-1)]" />

                                {visits.slice(0, 20).map((visit) => (
                                    <div key={visit.id} className="relative pl-10 pb-4">
                                        <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${visit.status === 'active'
                                            ? 'bg-[color:var(--accent-0)] border-[color:var(--accent-1)]'
                                            : visit.status === 'intermittent'
                                                ? 'bg-amber-400 border-amber-300'
                                                : 'bg-[color:var(--surface-2)] border-[color:var(--border-1)]'
                                            }`} />

                                        <div className={`bg-[color:var(--surface-2)] rounded-lg p-3 border-l-4 ${visit.status === 'active' ? 'border-[color:var(--accent-0)]' : visit.status === 'intermittent' ? 'border-amber-400' : 'border-[color:var(--border-1)]'
                                            }`}>
                                            <div className="flex items-center gap-2 text-sm text-[color:var(--text-3)] mb-1">
                                                <Calendar size={14} />
                                                {formatDate(visit.check_in || visit.check_in_time || '')}
                                            </div>

                                            {/* Compact Schedule: Arrival → Entry → Exit */}
                                            <div className="flex flex-wrap items-center gap-2 text-xs mt-1.5">
                                                {visit.arrival_time && (
                                                    <span className="flex items-center gap-1 text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded" title="Llegada">
                                                        <span className="font-bold">L:</span> {formatTime(visit.arrival_time)}
                                                    </span>
                                                )}
                                                {(visit.entry_time || visit.check_in_time || visit.check_in) && (
                                                    <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded" title="Ingreso">
                                                        <span className="font-bold">I:</span> {formatTime(visit.entry_time || visit.check_in_time || visit.check_in || '')}
                                                    </span>
                                                )}
                                                {(visit.exit_time || visit.check_out_time || visit.check_out) && (
                                                    <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded" title="Salida">
                                                        <span className="font-bold">S:</span> {formatTime(visit.exit_time || visit.check_out_time || visit.check_out || '')}
                                                    </span>
                                                )}
                                                {!visit.arrival_time && !visit.entry_time && !(visit.check_out || visit.check_out_time) && (
                                                    <span className="text-[color:var(--text-3)] italic">
                                                        {formatTime(visit.check_in || visit.check_in_time || '')}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between mt-2">
                                                {visit.status === 'active' && (
                                                    <span className="px-2 py-0.5 border border-[color:var(--accent-0)] text-[color:var(--accent-0)] text-xs rounded-full font-semibold">
                                                        ACTIVO
                                                    </span>
                                                )}
                                                {visit.status === 'intermittent' && (
                                                    <span className="px-2 py-0.5 border border-amber-400 text-amber-400 text-xs rounded-full font-semibold">
                                                        INTERMITENTE
                                                    </span>
                                                )}
                                            </div>

                                            {visit.reason && (
                                                <div className="mt-2 flex items-center gap-1 text-xs text-[color:var(--text-2)]">
                                                    <FileText size={12} />
                                                    {visit.reason}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {visits.length > 20 && (
                                <p className="text-center text-sm text-[color:var(--text-3)]">
                                    +{visits.length - 20} visitas anteriores
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisitorHistoryModal;
