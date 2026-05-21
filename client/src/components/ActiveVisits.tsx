import React, { useState } from 'react';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Briefcase from 'lucide-react/dist/esm/icons/briefcase';
import User from 'lucide-react/dist/esm/icons/user';
import LogOutIcon from 'lucide-react/dist/esm/icons/log-out';
import ArrowRightLeft from 'lucide-react/dist/esm/icons/arrow-right-left';
import { Visit } from '../types';
import { SkeletonVisitCard } from './ui/Skeleton';
import { useSoundFeedback } from '../hooks/useSoundFeedback';
import toast from 'react-hot-toast';
import { VisitorDetailsModal } from './visit/VisitorDetailsModal';
import { sanitizeInput } from '../utils/sanitizer';
import { useCheckOutMutation, useGoIntermittentMutation } from '../hooks/useVisitQueries';
import { VisitService } from '../services/api.v1';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface ActiveVisitsProps {
    visits: Visit[];
    onCheckout: () => void;
    loading?: boolean;
}

const ActiveVisits: React.FC<ActiveVisitsProps> = ({ visits, onCheckout, loading = false }) => {
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
    const [checkingOut, setCheckingOut] = useState<number | null>(null);
    const [markingIntermittent, setMarkingIntermittent] = useState<number | null>(null);
    const { playCheckout, playError } = useSoundFeedback();
    const checkOutMutation = useCheckOutMutation();
    const goIntermittentMutation = useGoIntermittentMutation();

    // Custom confirmation dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: (notes?: string) => void;
        variant: 'danger' | 'warning' | 'info';
        notesLabel?: string;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, variant: 'warning' });

    const handleGoIntermittent = async (e: React.MouseEvent, id: number, visitorName: string) => {
        e.stopPropagation();
        setConfirmDialog({
            isOpen: true,
            title: 'Salida Temporal',
            message: `¿Registrar salida temporal de ${visitorName}? La visita quedará en estado intermitente.`,
            variant: 'warning',
            notesLabel: 'Observación (opcional)',
            onConfirm: async (notes?: string) => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                setMarkingIntermittent(id);
                try {
                    await goIntermittentMutation.mutateAsync({ id, notes });
                    toast.success(`Salida temporal de ${visitorName} registrada`);
                    if (onCheckout) onCheckout();
                } catch {
                    playError();
                    toast.error('Error al registrar salida temporal');
                } finally {
                    setMarkingIntermittent(null);
                }
            }
        });
    };

    const handleCheckout = async (e: React.MouseEvent, id: number, visitorName: string) => {
        e.stopPropagation();
        setConfirmDialog({
            isOpen: true,
            title: 'Confirmar Salida',
            message: `¿Confirmar salida de ${visitorName}?`,
            variant: 'danger',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                setCheckingOut(id);
                try {
                    await checkOutMutation.mutateAsync({ id });
                    playCheckout();
                    toast.success(`¡Hasta luego, ${visitorName}!`);
                    if (onCheckout) onCheckout();
                } catch {
                    playError();
                    toast.error('Error al registrar salida');
                } finally {
                    setCheckingOut(null);
                }
            }
        });
    };

    // Calculate time in site
    const getTimeInSite = (checkIn: string) => {
        const diff = Date.now() - new Date(checkIn).getTime();
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    // Loading skeleton
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
                <p className="mt-2 text-sm font-semibold text-[color:var(--text-1)]">No hay visitas activas</p>
                <p className="mt-1 text-sm text-[color:var(--text-3)]">Registra una entrada nueva para comenzar.</p>
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {visits.map((visit) => {
                    const visitorName = visit.Visitor ? `${visit.Visitor.first_name || ''} ${visit.Visitor.last_name || ''}`.trim() : 'Unknown';
                    const visitorCompany = visit.Visitor ? visit.Visitor.company : 'Unknown';
                    const cedula = visit.Visitor ? visit.Visitor.cedula : '';
                    const visitorPhoto = cedula
                        ? VisitService.getVisitorPhotoUrl(cedula)
                        : (visit.Visitor?.photo_url || null);
                    const isMarkingIntermittent = markingIntermittent === visit.id;
                    const isCheckingOut = checkingOut === visit.id;
                    const timeInSite = getTimeInSite(visit.check_in || visit.check_in_time || '');

                    // Sanitize user-generated content for XSS protection
                    const sanitizedName = sanitizeInput(visitorName);
                    const sanitizedCompany = sanitizeInput(visitorCompany);
                    const sanitizedReason = sanitizeInput(visit.reason || visit.purpose || 'Visita General');

                    return (
                        <div
                            key={visit.id}
                            onClick={() => setSelectedVisit(visit)}
                            className="group panel-tech rounded-2xl transition-all duration-300 overflow-visible border border-[color:var(--border-1)] flex flex-col relative transform hover:-translate-y-1 cursor-pointer hover:shadow-md"
                        >
                            <div className="p-5 flex items-start space-x-4 flex-grow">
                                {/* Photo */}
                                <div className="relative flex-shrink-0">
                                    {visitorPhoto ? (
                                        <img
                                            src={visitorPhoto}
                                            alt={visitorName}
                                            className="w-14 h-14 rounded-2xl object-cover shadow-sm bg-[color:var(--surface-0)] border border-[color:var(--border-1)] group-hover:scale-105 transition-transform duration-500"
                                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?background=1b232a&color=e5edf5&name=' + encodeURIComponent(visitorName) }}
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-2xl bg-[color:var(--surface-2)] flex items-center justify-center text-[color:var(--text-2)] font-bold text-xl shadow-inner border border-[color:var(--border-1)]">
                                            {visitorName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex justify-between items-start">
                                        <h3 className="text-base font-semibold text-[color:var(--text-1)] pr-2 group-hover:text-[color:var(--accent-0)] transition-colors leading-snug">
                                            {sanitizedName}
                                        </h3>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--surface-2)] text-[color:var(--accent-0)] border border-[color:var(--border-1)] whitespace-nowrap ml-2">
                                            {timeInSite}
                                        </span>
                                    </div>

                                    <div className="flex items-start text-xs text-[color:var(--text-2)] mt-1 mb-0.5">
                                        <Briefcase size={12} className="mr-1.5 opacity-70 mt-0.5 flex-shrink-0" />
                                        <span className="font-medium leading-normal">{sanitizedCompany}</span>
                                    </div>
                                    <div className="flex items-center text-xs text-[color:var(--text-3)] font-mono">
                                        C.I. {cedula}
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-[color:var(--surface-2)] text-[color:var(--text-2)] border border-[color:var(--border-1)]">
                                            {sanitizedReason}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="px-4 py-3 border-t border-[color:var(--border-1)] bg-[color:var(--surface-2)]/60 mt-auto">
                                <div className="flex items-center justify-between gap-3">
                                    {/* Time */}
                                    <div className="flex items-center text-[color:var(--text-3)] text-xs font-medium whitespace-nowrap">
                                        <Clock size={13} className="mr-1.5" />
                                        {new Date(visit.check_in || visit.check_in_time || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>

                                    {/* Buttons */}
                                    <div className="flex items-center gap-2">
                                        {/* Salida Temporal */}
                                        <button
                                            onClick={(e) => handleGoIntermittent(e, visit.id, visitorName)}
                                            disabled={isMarkingIntermittent || isCheckingOut}
                                            title="Salida temporal"
                                            className="group/ibtn relative px-2.5 py-2 rounded-lg border border-amber-400/30 text-amber-400 text-[11px] font-semibold hover:bg-amber-500/10 hover:border-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                                        >
                                            {isMarkingIntermittent ? (
                                                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <ArrowRightLeft size={12} />
                                            )}
                                            <span>Temp.</span>
                                        </button>

                                        {/* Salida Final */}
                                        <button
                                            onClick={(e) => handleCheckout(e, visit.id, visitorName)}
                                            disabled={isCheckingOut || isMarkingIntermittent}
                                            className="group/btn relative px-3 py-2 rounded-lg bg-red-500/10 border border-red-400/40 text-red-400 text-[11px] font-semibold hover:bg-red-500/20 hover:border-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                                        >
                                            {isCheckingOut ? (
                                                <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <LogOutIcon size={12} />
                                            )}
                                            <span>Salir</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <VisitorDetailsModal
                visit={selectedVisit}
                isOpen={!!selectedVisit}
                onClose={() => setSelectedVisit(null)}
            />

            <ConfirmDialog
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                variant={confirmDialog.variant}
                confirmText="Confirmar"
                cancelText="Cancelar"
                onConfirm={confirmDialog.onConfirm}
                onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                notesLabel={confirmDialog.notesLabel}
            />
        </>
    );
};

export default ActiveVisits;
