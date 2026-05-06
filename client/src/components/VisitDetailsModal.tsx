
import React from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import User from 'lucide-react/dist/esm/icons/user';
import Briefcase from 'lucide-react/dist/esm/icons/briefcase';
import Clock from 'lucide-react/dist/esm/icons/clock';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Phone from 'lucide-react/dist/esm/icons/phone';
import Mail from 'lucide-react/dist/esm/icons/mail';
import Car from 'lucide-react/dist/esm/icons/car';
import Users from 'lucide-react/dist/esm/icons/users';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import { Visit } from '../types';

interface VisitDetailsModalProps {
    visit: Visit | null;
    onClose: () => void;
}

const VisitDetailsModal: React.FC<VisitDetailsModalProps> = ({ visit, onClose }) => {
    if (!visit) return null;

    const visitor = visit.Visitor || {
        first_name: 'Desconocido',
        last_name: '',
        company: 'Sin empresa',
        cedula: visit.visitor_cedula,
        photo_url: null,
        email: 'N/A',
        phone: 'N/A',
        job_title: 'N/A'
    };

    const visitorName = `${visitor.first_name} ${visitor.last_name}`.trim();
    const photoUrl = visitor.photo_url;

    const getPhotoSrc = (url: string | null | undefined) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `http://localhost:3000${url}`;
    };

    const fmt = (dt: string | null | undefined) =>
        dt ? new Date(dt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';

    // Build timeline events
    type TimelineEvent = {
        id: string;
        time: string;
        label: string;
        icon: React.ReactNode;
        colorClass: string;
        notes?: string;
    };
    
    const timeline: TimelineEvent[] = [];
    
    if (visit.arrival_time) {
        timeline.push({
            id: 'arrival',
            time: visit.arrival_time,
            label: 'Registro',
            icon: <FileText size={14} />,
            colorClass: 'text-[color:var(--accent-2)]'
        });
    }
    
    const entryTime = visit.entry_time || visit.check_in_time || visit.check_in;
    if (entryTime) {
        timeline.push({
            id: 'entry',
            time: entryTime,
            label: 'Entrada',
            icon: <LogIn size={14} />,
            colorClass: 'text-emerald-400'
        });
    }
    
    if (visit.intermittent_logs) {
        visit.intermittent_logs.forEach(log => {
            timeline.push({
                id: `inter_out_${log.id}`,
                time: log.check_out,
                label: 'Salida temporal',
                icon: <LogOut size={14} />,
                colorClass: 'text-amber-400',
                notes: log.notes || undefined
            });
            if (log.re_entry) {
                timeline.push({
                    id: `inter_in_${log.id}`,
                    time: log.re_entry,
                    label: 'Reingreso',
                    icon: <LogIn size={14} />,
                    colorClass: 'text-emerald-400'
                });
            }
        });
    }
    
    const exitTime = visit.exit_time || visit.check_out_time || visit.check_out;
    if (exitTime) {
        timeline.push({
            id: 'exit',
            time: exitTime,
            label: 'Salida',
            icon: <LogOut size={14} />,
            colorClass: 'text-amber-400'
        });
    }
    
    // Sort chronological
    timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div
                className="panel-tech rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform transition-all scale-100 animate-slideUp max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Banner */}
                <div className="relative bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] h-32">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)]" />
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-[color:var(--text-2)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-1)] rounded-full p-1 transition-colors"
                    >
                        <X size={22} />
                    </button>
                    <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2">
                        {photoUrl ? (
                            <img
                                src={getPhotoSrc(photoUrl)!}
                                alt={visitorName}
                                className="w-32 h-32 rounded-full object-cover border-4 border-[color:var(--surface-1)] shadow-lg bg-[color:var(--surface-1)]"
                                onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?background=1b232a&color=e5edf5&name=${encodeURIComponent(visitorName)}` }}
                            />
                        ) : (
                            <div className="w-32 h-32 rounded-full bg-[color:var(--surface-1)] border-4 border-[color:var(--surface-1)] shadow-lg flex items-center justify-center text-[color:var(--accent-0)] font-bold text-4xl">
                                {visitorName.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-20 pb-8 px-6 text-center">
                    <h2 className="text-2xl font-display text-[color:var(--text-1)]">{visitorName}</h2>
                    <p className="text-[color:var(--text-2)] font-medium flex items-center justify-center gap-1 mt-1">
                        <Briefcase size={16} />
                        {visitor.company}
                    </p>
                    <p className="text-[color:var(--text-3)] text-sm mt-1 font-mono">C.I. {visitor.cedula}</p>

                    {/* Primary Info Grid */}
                    <div className="mt-6 grid grid-cols-2 gap-4 text-left">
                        <div className="bg-[color:var(--surface-2)] p-3 rounded-lg border border-[color:var(--border-1)]">
                            <label className="text-xs font-semibold text-[color:var(--text-3)] uppercase block mb-1">Área / Depto</label>
                            <div className="flex items-center text-[color:var(--text-1)] font-medium">
                                <MapPin size={16} className="mr-2 text-[color:var(--accent-0)]" />
                                <span className="text-sm">
                                    {visit.target_department || visit.area || visit.department || '—'}
                                </span>
                            </div>
                        </div>
                        <div className="bg-[color:var(--surface-2)] p-3 rounded-lg border border-[color:var(--border-1)]">
                            <label className="text-xs font-semibold text-[color:var(--text-3)] uppercase block mb-1">A quien visita</label>
                            <div className="flex items-center text-[color:var(--text-1)] font-medium text-sm">
                                <User size={16} className="mr-2 text-[color:var(--accent-0)]" />
                                {visit.host_person || visit.person_to_visit || visit.personToVisit || 'Recepcion'}
                            </div>
                        </div>
                        <div className="bg-[color:var(--surface-2)] p-3 rounded-lg border border-[color:var(--border-1)]">
                            <label className="text-xs font-semibold text-[color:var(--text-3)] uppercase block mb-1">Motivo</label>
                            <div className="flex items-center text-[color:var(--text-1)] font-medium">
                                <FileText size={16} className="mr-2 text-[color:var(--accent-0)]" />
                                <span className="text-sm">{visit.purpose || visit.reason || '—'}</span>
                            </div>
                        </div>
                        <div className="bg-[color:var(--surface-2)] p-3 rounded-lg border border-[color:var(--border-1)]">
                            <label className="text-xs font-semibold text-[color:var(--text-3)] uppercase block mb-1">Contacto</label>
                            <div className="flex flex-col text-sm text-[color:var(--text-2)]">
                                {visitor.email && (
                                    <span className="flex items-center mb-1"><Mail size={12} className="mr-1" /> {visitor.email}</span>
                                )}
                                {visitor.phone && (
                                    <span className="flex items-center"><Phone size={12} className="mr-1" /> {visitor.phone}</span>
                                )}
                                {!visitor.email && !visitor.phone && <span className="italic text-[color:var(--text-3)]">No registrado</span>}
                            </div>
                        </div>
                    </div>

                    {/* ── Timeline Group ─────────────────────────── */}
                    {timeline.length > 0 && (
                        <div className="mt-6 bg-[color:var(--surface-2)] p-4 rounded-xl border border-[color:var(--border-1)] text-left relative">
                            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[color:var(--text-3)] mb-4 flex items-center gap-2">
                                <Clock size={14} className="text-[color:var(--accent-0)]" />
                                Línea de Tiempo
                            </p>
                            <div className="relative pl-6 space-y-4">
                                {/* Vertical line */}
                                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[color:var(--border-1)]" />
                                
                                {timeline.map((ev, i) => (
                                    <div key={ev.id} className="relative">
                                        {/* Node dot */}
                                        <div className={`absolute -left-6 top-1 w-3 h-3 rounded-full bg-[color:var(--surface-1)] border-2 flex items-center justify-center
                                            ${ev.label === 'Salida temporal' ? 'border-amber-400' : 
                                              ev.label === 'Entrada' || ev.label === 'Reingreso' ? 'border-emerald-400' : 
                                              ev.label === 'Salida' ? 'border-rose-400' : 'border-[color:var(--accent-0)]'}`}
                                        />
                                        
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className={`flex items-center gap-1 text-sm font-semibold ${ev.colorClass}`}>
                                                    {ev.icon}
                                                    {ev.label}
                                                </span>
                                                <div className="flex-1 h-px bg-gradient-to-r from-[color:var(--border-1)] to-transparent opacity-50 mx-2" />
                                                <span className="font-mono text-xs text-[color:var(--text-2)] bg-[color:var(--surface-1)] px-2 py-0.5 rounded-md border border-[color:var(--border-1)]">
                                                    {fmt(ev.time)}
                                                </span>
                                            </div>
                                            {ev.notes && (
                                                <p className="mt-1 text-[11px] text-[color:var(--text-3)] italic bg-[color:var(--surface-1)] p-2 rounded-lg border border-[color:var(--border-1)]">
                                                    {ev.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                
                                {/* Status pending indicator */}
                                {visit.status === 'intermittent' && !timeline.find(e => e.label === 'Salida') && (
                                    <div className="relative pt-2">
                                        <div className="absolute -left-[23px] top-3 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping opacity-75" />
                                        <div className="absolute -left-[23px] top-3 w-2.5 h-2.5 rounded-full bg-amber-400" />
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-amber-400/70 italic">Aún fuera...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Companion & Vehicle */}
                    {(visit.companionName || visit.vehiclePlate) && (
                        <div className="mt-4 grid grid-cols-2 gap-4 text-left">
                            {visit.companionName && (
                                <div className="bg-[color:var(--surface-2)] p-3 rounded-lg border border-[color:var(--border-1)]">
                                    <label className="text-xs font-semibold text-[color:var(--text-3)] uppercase block mb-1">Acompañante</label>
                                    <div className="flex flex-col text-sm text-[color:var(--text-2)]">
                                        <span className="flex items-center font-medium text-[color:var(--text-1)] mb-1">
                                            <Users size={14} className="mr-2 text-[color:var(--accent-0)]" /> {visit.companionName}
                                        </span>
                                        {visit.companionCedula && <span className="font-mono text-xs opacity-75">C.I. {visit.companionCedula}</span>}
                                    </div>
                                </div>
                            )}
                            {visit.vehiclePlate && (
                                <div className="bg-[color:var(--surface-2)] p-3 rounded-lg border border-[color:var(--border-1)]">
                                    <label className="text-xs font-semibold text-[color:var(--text-3)] uppercase block mb-1">Vehículo</label>
                                    <div className="flex flex-col text-sm text-[color:var(--text-2)]">
                                        <span className="flex items-center font-medium text-[color:var(--text-1)] mb-1">
                                            <Car size={14} className="mr-2 text-[color:var(--accent-0)]" /> {visit.vehicleBrand} {visit.vehicleModel}
                                        </span>
                                        <span className="font-mono text-xs opacity-75 bg-[color:var(--surface-3)] px-1 rounded uppercase">{visit.vehiclePlate}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    {visit.notes && (
                        <div className="mt-4 bg-[color:var(--surface-2)] p-3 rounded-lg border border-[color:var(--border-1)] text-left">
                            <label className="text-xs font-semibold text-[color:var(--accent-0)] uppercase block mb-1">Notas</label>
                            <p className="text-sm text-[color:var(--text-2)]">{visit.notes}</p>
                        </div>
                    )}


                    {/* Status badge */}
                    <div className="mt-8 flex justify-center">
                        <div className={`px-4 py-1 rounded-full text-xs font-semibold border ${
                            visit.status === 'active' 
                                ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]' 
                                : visit.status === 'intermittent'
                                    ? 'border-amber-400 text-amber-400'
                                    : 'border-[color:var(--border-1)] text-[color:var(--text-3)]'
                        }`}>
                            Estado: {visit.status === 'active' ? 'Activo (En sitio)' : visit.status === 'intermittent' ? 'Intermitente (Fuera temporal)' : 'Completado'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VisitDetailsModal;
