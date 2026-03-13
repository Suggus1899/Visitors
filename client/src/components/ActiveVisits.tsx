import React, { useState } from 'react';
import { VisitService } from '../services/api.v1';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Briefcase from 'lucide-react/dist/esm/icons/briefcase';
import User from 'lucide-react/dist/esm/icons/user';
import LogOutIcon from 'lucide-react/dist/esm/icons/log-out';
import { Visit } from '../types';
import { SkeletonVisitCard } from './ui/Skeleton';
import { useSoundFeedback } from '../hooks/useSoundFeedback';
import toast from 'react-hot-toast';
import { VisitorDetailsModal } from './visit/VisitorDetailsModal';
import { sanitizeInput } from '../utils/sanitizer';

interface ActiveVisitsProps {
    visits: Visit[];
    onCheckout: () => void;
    loading?: boolean;
}

const ActiveVisits: React.FC<ActiveVisitsProps> = ({ visits, onCheckout, loading = false }) => {
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
    const [checkingOut, setCheckingOut] = useState<number | null>(null);
    const { playCheckout, playError } = useSoundFeedback();

    const handleCheckout = async (e: React.MouseEvent, id: number, visitorName: string) => {
        e.stopPropagation(); // Prevent opening modal when clicking checkout
        if (!window.confirm(`¿Confirmar salida de ${visitorName}?`)) return;

        setCheckingOut(id);

        try {
            await VisitService.checkOut(id);
            playCheckout();
            toast.success(`¡Hasta luego, ${visitorName}!`);
            if (onCheckout) onCheckout();
        } catch (error) {
            console.error('Error checking out:', error);
            playError();
            toast.error('Error al registrar salida');
        } finally {
            setCheckingOut(null);
        }
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
                    const visitorPhoto = visit.Visitor ? visit.Visitor.photo_url : null;
                    const cedula = visit.Visitor ? visit.Visitor.cedula : '';
                    const isCheckingOut = checkingOut === visit.id;
                    const timeInSite = getTimeInSite(visit.check_in || visit.check_in_time || ''); // Handle both formats

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
                            <div className="px-5 py-3 border-t border-[color:var(--border-1)] bg-[color:var(--surface-2)]/60 flex justify-between items-center mt-auto">
                                <div className="flex items-center text-[color:var(--text-3)] text-xs font-medium">
                                    <Clock size={13} className="mr-1.5" />
                                    {new Date(visit.check_in || visit.check_in_time || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>

                                <button
                                    onClick={(e) => handleCheckout(e, visit.id, visitorName)}
                                    disabled={isCheckingOut}
                                    className="group/btn relative px-4 py-1.5 rounded-lg border border-[color:var(--border-1)] text-[color:var(--text-2)] text-xs font-semibold hover:border-red-400 hover:text-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 overflow-hidden z-10"
                                >
                                    <span className="absolute inset-0 bg-red-500/15 transform origin-left scale-x-0 group-hover/btn:scale-x-100 transition-transform duration-300 ease-out -z-10" />
                                    {isCheckingOut ? (
                                        <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <LogOutIcon size={13} className="group-hover/btn:-translate-x-0.5 transition-transform" />
                                    )}
                                    <span>SALIDA</span>
                                </button>
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
        </>
    );
};

export default ActiveVisits;
