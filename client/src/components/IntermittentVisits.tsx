import React, { useState, useEffect, useCallback } from 'react';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Briefcase from 'lucide-react/dist/esm/icons/briefcase';
import User from 'lucide-react/dist/esm/icons/user';
import LogIn from 'lucide-react/dist/esm/icons/log-in';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import { VisitService } from '../services/api.v1';
import { SkeletonVisitCard } from './ui/Skeleton';
import { useSoundFeedback } from '../hooks/useSoundFeedback';
import toast from 'react-hot-toast';
import IntermittentModal from './IntermittentModal';
import { sanitizeInput } from '../utils/sanitizer';
import { API_BASE_URL } from '../config/env';

interface IntermittentVisit {
    id: number;
    visitorCedula: string;
    visitorName: string;
    firstName?: string;
    lastName?: string;
    company: string;
    checkInTime: string;
    purpose: string;
    personToVisit: string;
    status: string;
    photoUrl?: string;
    targetDepartment?: string;
    hostPerson?: string;
    area?: string;
    department?: string;
    intermittentSince?: string;
    intermittentNotes?: string;
    totalIntermittentEvents: number;
}

interface IntermittentVisitsProps {
    onVisitReEntered: () => void;
    fallbackPollingMs?: number | false;
}

/** Threshold in minutes to show intermittent timeout alert */
const INTERMITTENT_ALERT_THRESHOLD_MINUTES = 60;

const IntermittentVisits: React.FC<IntermittentVisitsProps> = ({ onVisitReEntered, fallbackPollingMs }) => {
    const [visits, setVisits] = useState<IntermittentVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const [reEntryTarget, setReEntryTarget] = useState<IntermittentVisit | null>(null);
    const [processing, setProcessing] = useState(false);
    const [, forceRender] = useState({});
    const { playSuccess, playError } = useSoundFeedback();

    const fetchVisits = useCallback(async () => {
        try {
            const data = await VisitService.getIntermittentVisits();
            setVisits(data as IntermittentVisit[]);
        } catch {
            // Silently fail
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchVisits();
    }, [fetchVisits]);

    // Live counter re-render every minute
    useEffect(() => {
        const interval = setInterval(() => forceRender({}), 60000);
        return () => clearInterval(interval);
    }, []);

    // Polling if SSE not available
    useEffect(() => {
        if (!fallbackPollingMs) return;
        const interval = setInterval(fetchVisits, fallbackPollingMs as number);
        return () => clearInterval(interval);
    }, [fallbackPollingMs, fetchVisits]);

    const handleReEntry = async (notes: string) => {
        if (!reEntryTarget) return;
        setProcessing(true);
        try {
            await VisitService.intermittentReEntry(reEntryTarget.id, notes);
            playSuccess();
            toast.success(`¡${reEntryTarget.visitorName} ha reingresado!`);
            setReEntryTarget(null);
            fetchVisits();
            onVisitReEntered();
        } catch {
            playError();
            toast.error('Error al registrar reingreso');
        } finally {
            setProcessing(false);
        }
    };

    const getTimeOutside = (since: string) => {
        const diff = Date.now() - new Date(since).getTime();
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const getMinutesOutside = (since: string) => {
        return Math.floor((Date.now() - new Date(since).getTime()) / 60000);
    };

    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}?t=${Date.now()}`;
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => <SkeletonVisitCard key={i} />)}
            </div>
        );
    }

    if (visits.length === 0) {
        return (
            <div className="text-center p-12 panel-tech rounded-2xl border border-dashed border-[color:var(--border-1)]">
                <User className="mx-auto h-12 w-12 text-[color:var(--text-3)]" />
                <p className="mt-2 text-sm font-semibold text-[color:var(--text-1)]">No hay visitas en intermitencia</p>
                <p className="mt-1 text-sm text-[color:var(--text-3)]">Los visitantes que salgan temporalmente aparecerán aquí.</p>
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] border-l-2 border-amber-400 pl-3">
                    Intermitencia
                    <span className="ml-2 text-xs font-semibold text-[color:var(--text-3)]">
                        ({visits.length})
                    </span>
                </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {visits.map((visit) => {
                    const sanitizedName = sanitizeInput(visit.visitorName || 'Desconocido');
                    const sanitizedCompany = sanitizeInput(visit.company || 'Sin empresa');
                    const timeOutside = visit.intermittentSince ? getTimeOutside(visit.intermittentSince) : '—';
                    const minutesOutside = visit.intermittentSince ? getMinutesOutside(visit.intermittentSince) : 0;
                    const isOverThreshold = minutesOutside >= INTERMITTENT_ALERT_THRESHOLD_MINUTES;
                    const photoSrc = getPhotoUrl(visit.photoUrl);

                    return (
                        <div
                            key={visit.id}
                            className={`group panel-tech rounded-2xl transition-all duration-300 overflow-visible border flex flex-col relative transform hover:-translate-y-1 cursor-pointer hover:shadow-md ${
                                isOverThreshold ? 'border-amber-400/50' : 'border-[color:var(--border-1)]'
                            }`}
                        >
                            {/* Alert badge for timeout */}
                            {isOverThreshold && (
                                <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 bg-amber-500/20 border border-amber-400 rounded-full px-2 py-0.5 animate-pulse">
                                    <AlertTriangle size={12} className="text-amber-400" />
                                    <span className="text-[10px] font-bold text-amber-300">ALERTA</span>
                                </div>
                            )}

                            <div className="p-5 flex items-start space-x-4 flex-grow">
                                <div className="relative flex-shrink-0">
                                    {photoSrc ? (
                                        <img
                                            src={photoSrc}
                                            alt={sanitizedName}
                                            className="w-14 h-14 rounded-2xl object-cover shadow-sm bg-[color:var(--surface-0)] border border-amber-400/30 group-hover:scale-105 transition-transform duration-500 opacity-70"
                                            onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?background=1b232a&color=e5edf5&name=${encodeURIComponent(sanitizedName)}` }}
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-2xl bg-[color:var(--surface-2)] flex items-center justify-center text-amber-400 font-bold text-xl shadow-inner border border-amber-400/30 opacity-70">
                                            {sanitizedName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    {/* Pulsing dot for "outside" */}
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-400 rounded-full border-2 border-[color:var(--surface-1)] animate-pulse" />
                                </div>

                                <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex justify-between items-start">
                                        <h3 className="text-base font-semibold text-[color:var(--text-1)] pr-2 leading-snug">
                                            {sanitizedName}
                                        </h3>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ml-2 ${
                                            isOverThreshold
                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                                                : 'bg-[color:var(--surface-2)] text-amber-400 border border-[color:var(--border-1)]'
                                        }`}>
                                            ⏱ {timeOutside} fuera
                                        </span>
                                    </div>

                                    <div className="flex items-start text-xs text-[color:var(--text-2)] mt-1 mb-0.5">
                                        <Briefcase size={12} className="mr-1.5 opacity-70 mt-0.5 flex-shrink-0" />
                                        <span className="font-medium leading-normal">{sanitizedCompany}</span>
                                    </div>

                                    {visit.intermittentNotes && (
                                        <div className="mt-1.5 text-[10px] text-amber-300/70 italic truncate">
                                            "{visit.intermittentNotes}"
                                        </div>
                                    )}

                                    {visit.totalIntermittentEvents > 1 && (
                                        <div className="mt-2">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[color:var(--surface-2)] text-[color:var(--text-3)] border border-[color:var(--border-1)]">
                                                {visit.totalIntermittentEvents} intermitencias
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer with Re-Entry Button */}
                            <div className="px-5 py-3 border-t border-[color:var(--border-1)] bg-[color:var(--surface-2)]/60 flex justify-between items-center mt-auto">
                                <div className="flex items-center text-[color:var(--text-3)] text-xs font-medium">
                                    <Clock size={13} className="mr-1.5" />
                                    Entrada: {new Date(visit.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>

                                <button
                                    onClick={() => setReEntryTarget(visit)}
                                    className="group/btn relative px-4 py-1.5 rounded-lg border border-emerald-400/50 text-emerald-300 text-xs font-semibold hover:border-emerald-400 hover:text-emerald-200 transition-all flex items-center gap-1.5 overflow-hidden z-10"
                                >
                                    <span className="absolute inset-0 bg-emerald-500/15 transform origin-left scale-x-0 group-hover/btn:scale-x-100 transition-transform duration-300 ease-out -z-10" />
                                    <LogIn size={13} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                    <span>REINGRESO</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <IntermittentModal
                isOpen={!!reEntryTarget}
                visitorName={reEntryTarget?.visitorName || ''}
                mode="reentry"
                onConfirm={handleReEntry}
                onClose={() => setReEntryTarget(null)}
                loading={processing}
            />
        </>
    );
};

export default IntermittentVisits;
