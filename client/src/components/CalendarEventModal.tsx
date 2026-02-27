import React from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import { Visit } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CalendarEventModalProps {
    visit: Visit | null;
    isOpen: boolean;
    onClose: () => void;
    onCheckout?: (id: number) => void;
}

const CalendarEventModal: React.FC<CalendarEventModalProps> = ({ visit, isOpen, onClose, onCheckout }) => {
    if (!isOpen || !visit) return null;

    const visitorName = `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''}`.trim() || 'Visitante';
    const isActive = visit.status === 'active';

    // Calculate duration
    const getDuration = () => {
        const start = new Date(visit.check_in);
        const end = visit.check_out ? new Date(visit.check_out) : new Date();
        const diff = end.getTime() - start.getTime();
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes} minutos`;
    };

    // Get visit type color
    const getTypeColor = (reason: string) => {
        const r = reason?.toLowerCase() || '';
        if (r.includes('reunión') || r.includes('reunion') || r.includes('meeting')) return 'border-blue-400 text-blue-300';
        if (r.includes('entrega') || r.includes('delivery') || r.includes('paquete')) return 'border-emerald-400 text-emerald-300';
        if (r.includes('mantenimiento') || r.includes('reparación') || r.includes('técnico')) return 'border-amber-400 text-amber-300';
        if (r.includes('emergencia') || r.includes('urgente')) return 'border-red-400 text-red-300';
        return 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]';
    };

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="panel-tech rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-slideUp"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] p-4">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            {visit.Visitor?.photo_url ? (
                                <img
                                    src={visit.Visitor.photo_url}
                                    alt={visitorName}
                                    className="w-16 h-16 rounded-full object-cover border-2 border-[color:var(--border-1)] shadow-lg"
                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?background=1b232a&color=e5edf5&name=${encodeURIComponent(visitorName)}` }}
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-[color:var(--surface-1)] border border-[color:var(--border-1)] flex items-center justify-center text-2xl font-bold text-[color:var(--text-2)]">
                                    {visitorName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <h3 className="text-xl font-display text-[color:var(--text-1)]">{visitorName}</h3>
                                <p className="text-[color:var(--text-3)] text-sm font-mono">C.I. {visit.Visitor?.cedula}</p>
                                <span className={`inline-flex items-center px-2 py-0.5 mt-2 rounded-full text-[10px] font-semibold border ${getTypeColor(visit.reason || '')}`}>
                                    {visit.reason || 'Visita General'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 text-[color:var(--text-2)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-1)] rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    <div className="flex items-center gap-3 text-[color:var(--text-2)]">
                        <Building2 size={18} className="text-[color:var(--text-3)]" />
                        <span className="font-medium">{visit.Visitor?.company || 'Sin empresa'}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[color:var(--text-2)]">
                        <FileText size={18} className="text-[color:var(--text-3)]" />
                        <span>{visit.reason || 'Visita General'}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[color:var(--text-2)]">
                        <Clock size={18} className="text-[color:var(--accent-1)]" />
                        <div>
                            <span className="text-sm text-[color:var(--text-3)]">Entrada:</span>
                            <span className="ml-2 font-medium text-[color:var(--text-1)]">
                                {format(new Date(visit.check_in), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                            </span>
                        </div>
                    </div>

                    {visit.check_out ? (
                        <div className="flex items-center gap-3 text-[color:var(--text-2)]">
                            <Clock size={18} className="text-red-400" />
                            <div>
                                <span className="text-sm text-[color:var(--text-3)]">Salida:</span>
                                <span className="ml-2 font-medium text-[color:var(--text-1)]">
                                    {format(new Date(visit.check_out), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 text-[color:var(--accent-0)]">
                            <div className="w-2 h-2 bg-[color:var(--accent-0)] rounded-full animate-pulse" />
                            <span className="font-medium">Visita activa</span>
                        </div>
                    )}

                    <div className="bg-[color:var(--surface-2)] rounded-lg p-3 text-center border border-[color:var(--border-1)]">
                        <span className="text-sm text-[color:var(--text-3)]">Duración {isActive ? '(hasta ahora)' : 'total'}:</span>
                        <span className="ml-2 font-semibold text-[color:var(--text-1)]">{getDuration()}</span>
                    </div>
                </div>

                {isActive && onCheckout && (
                    <div className="border-t border-[color:var(--border-1)] p-4">
                        <button
                            onClick={() => {
                                if (window.confirm(`¿Confirmar salida de ${visitorName}?`)) {
                                    onCheckout(visit.id);
                                    onClose();
                                }
                            }}
                            className="w-full border border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all"
                        >
                            <LogOut size={18} />
                            Registrar Salida
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CalendarEventModal;
