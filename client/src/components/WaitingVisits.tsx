import React, { useEffect, useState } from 'react';
import { Visit } from '../types';
import toast from 'react-hot-toast';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import { VisitorDetailsModal } from './visit/VisitorDetailsModal';
import { sanitizeInput } from '../utils/sanitizer';
import { useAdmitVisitorMutation, useWaitingVisitsQuery } from '../hooks/useVisitQueries';
import { VisitService } from '../services/api.v1';

interface WaitingVisitsProps {
    onVisitAdmitted: () => void;
    fallbackPollingMs?: number | false;
}

const WaitingVisits: React.FC<WaitingVisitsProps> = ({ onVisitAdmitted, fallbackPollingMs = false }) => {
    const [admittingId, setAdmittingId] = useState<number | null>(null);
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
    const admitMutation = useAdmitVisitorMutation();
    const {
        data: visits = [],
        isLoading: loading,
        isError,
    } = useWaitingVisitsQuery({
        refetchInterval: fallbackPollingMs,
    });

    useEffect(() => {
        if (isError) {
            toast.error('Error al cargar visitas en espera');
        }
    }, [isError]);

    const handleAdmit = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation(); // prevent modal
        try {
            setAdmittingId(id);
            await admitMutation.mutateAsync(id);
            toast.success('Visitante admitido con éxito');
            onVisitAdmitted(); // Inform parent to refresh and maybe switch tabs
        } catch {
            toast.error('Error al admitir al visitante');
        } finally {
            setAdmittingId(null);
        }
    };

    if (loading && visits.length === 0) {
        return (
            <div className="panel-tech p-8 rounded-2xl flex flex-col items-center justify-center min-h-[300px]">
                <div className="animate-spin w-10 h-10 border-4 border-[color:var(--accent-0)] border-t-transparent rounded-full mb-4" />
                <p className="text-[color:var(--text-2)] animate-pulse">Cargando visitas en espera...</p>
            </div>
        );
    }

    if (visits.length === 0) {
        return (
            <div className="panel-tech p-8 rounded-2xl flex flex-col items-center justify-center min-h-[300px] text-center border-dashed border-2 border-[color:var(--border-1)]">
                <div className="w-16 h-16 bg-[color:var(--surface-1)] rounded-full flex items-center justify-center mb-4">
                    <Clock size={32} className="text-[color:var(--text-3)]" />
                </div>
                <h3 className="text-lg font-bold text-[color:var(--text-1)] mb-1">Sin Visitas en Espera</h3>
                <p className="text-[color:var(--text-2)] text-sm">No hay visitantes aguardando ingreso en este momento.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-display uppercase tracking-[0.2em] mb-4 flex items-center text-[color:var(--text-1)]">
                <Clock className="mr-2 text-[color:var(--status-warning)]" /> Visitas en Espera
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visits.map((visit) => {
                    // Sanitize user-generated content for XSS protection
                    const visitorName = `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''}`.trim();
                    const sanitizedName = sanitizeInput(visitorName);
                    const sanitizedCompany = sanitizeInput(visit.Visitor?.company || 'Independiente');
                    const sanitizedReason = sanitizeInput(visit.reason || visit.purpose || visit.personToVisit || visit.person_to_visit || 'Visita General');
                    const cedula = visit.Visitor?.cedula || visit.visitor_cedula || '';
                    const photoUrl = cedula ? VisitService.getVisitorPhotoUrl(cedula) : null;

                    return (
                        <div
                            key={visit.id}
                            onClick={() => setSelectedVisit(visit)}
                            className="panel-tech p-5 rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-1)] flex flex-col relative overflow-hidden group hover:border-[color:var(--status-warning)] transition-colors cursor-pointer hover:shadow-md"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-[color:var(--status-warning)]/20 to-transparent -z-10" />

                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-3">
                                    {photoUrl ? (
                                        <img src={photoUrl} alt="Foto" className="w-12 h-12 rounded-lg object-cover border border-[color:var(--border-1)]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                        <div className="w-12 h-12 rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--border-1)] flex items-center justify-center">
                                            <Clock className="text-[color:var(--text-3)]" size={20} />
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="font-bold text-[color:var(--text-1)] line-clamp-1">
                                            {sanitizedName}
                                        </h3>
                                        <p className="text-xs text-[color:var(--text-2)] font-mono">{visit.visitor_cedula}</p>
                                        <p className="text-xs text-[color:var(--text-2)] flex items-center mt-1">
                                            <Building2 size={12} className="mr-1" />
                                            {sanitizedCompany}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto space-y-3">
                                <div className="text-sm bg-[color:var(--surface-0)] p-2 rounded border border-[color:var(--border-1)]">
                                    <span className="text-[color:var(--text-3)] text-xs uppercase tracking-wider block mb-1">Motivo / Visita a:</span>
                                    <span className="text-[color:var(--text-1)] font-medium block truncate">
                                        {sanitizedReason}
                                    </span>
                                </div>

                                <button
                                    onClick={(e) => handleAdmit(e, visit.id)}
                                    disabled={admittingId === visit.id}
                                    className="w-full btn-tech !bg-[color:var(--status-success)]/10 !text-[color:var(--status-success)] !border-[color:var(--status-success)]/50 hover:!bg-[color:var(--status-success)]/20 flex justify-center items-center gap-2 z-10 relative"
                                >
                                    {admittingId === visit.id ? (
                                        <div className="animate-spin w-4 h-4 border-2 border-[color:var(--status-success)] border-t-transparent rounded-full" />
                                    ) : (
                                        <>
                                            <CheckCircle size={18} />
                                            ADMITIR ENTRADA
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <VisitorDetailsModal
                visit={selectedVisit}
                isOpen={!!selectedVisit}
                onClose={() => setSelectedVisit(null)}
            />
        </div>
    );
};

export default WaitingVisits;
