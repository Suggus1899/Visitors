import { useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Download from 'lucide-react/dist/esm/icons/download';

import CalendarEventModal from '../CalendarEventModal';
import CustomCalendarToolbar from '../CustomCalendarToolbar';
import CalendarLegend from '../CalendarLegend';
import { VisitService } from '../../services/api.v1';
import { CalendarEvent, Visit } from '../../types';

const locales = { 'es': es };
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

interface CalendarViewProps {
    calendarEvents: CalendarEvent[];
    fetchVisits: () => void;
}

const CalendarView = ({ calendarEvents, fetchVisits }: CalendarViewProps) => {
    const [calendarFilter, setCalendarFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [selectedEvent, setSelectedEvent] = useState<Visit | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);

    const handleExport = () => {
        const doc = new jsPDF();
        doc.setFontSize(16); doc.text('Calendario de Visitas', 14, 20);
        doc.setFontSize(10); doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, 14, 28);
        const filteredEvents = calendarEvents.filter(e => calendarFilter === 'all' || e.resource?.status === calendarFilter);
        const tableData = filteredEvents.slice(0, 50).map(e => [
            e.title, 
            format(e.start, 'dd/MM/yyyy HH:mm', { locale: es }), 
            e.end ? format(e.end, 'dd/MM/yyyy HH:mm', { locale: es }) : '-', 
            e.resource?.status === 'active' ? 'Activa' : 'Finalizada'
        ]);
        autoTable(doc, { head: [['Visitante', 'Entrada', 'Salida', 'Estado']], body: tableData, startY: 35, styles: { fontSize: 8 } });
        doc.save(`calendario_visitas_${format(new Date(), 'yyyyMMdd')}.pdf`);
    };

    return (
        <div className="panel-tech rounded-lg p-6">
            <CalendarEventModal 
                visit={selectedEvent} 
                isOpen={showEventModal}
                onClose={() => { setShowEventModal(false); setSelectedEvent(null); }}
                onCheckout={async (id) => { 
                    try { 
                        await VisitService.checkOut(id); 
                        fetchVisits(); 
                    } catch { /* ignored */ } 
                }}
            />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 bg-[color:var(--surface-2)] p-4 rounded-xl border border-[color:var(--border-1)]">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-[color:var(--text-3)]">Filtrar visitas:</span>
                    <div className="flex bg-[color:var(--surface-1)] rounded-lg p-1 border border-[color:var(--border-1)]">
                        {[{ value: 'all', label: 'Todas' }, { value: 'active', label: 'Activas' }, { value: 'completed', label: 'Finalizadas' }].map(opt => (
                            <button key={opt.value} onClick={() => setCalendarFilter(opt.value as typeof calendarFilter)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${calendarFilter === opt.value ? 'bg-[color:var(--surface-2)] text-[color:var(--accent-0)] shadow-sm border border-[color:var(--border-1)]' : 'text-[color:var(--text-3)] hover:text-[color:var(--text-1)]'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <button 
                    onClick={handleExport} 
                    className="btn-tech px-4 py-2 text-sm w-auto flex items-center justify-center gap-2"
                >
                    <Download size={16} /> Exportar Calendario
                </button>
            </div>

            <div className="bg-[color:var(--surface-1)] rounded-xl border border-[color:var(--border-1)] p-2" style={{ height: '650px' }}>
                <Calendar 
                    localizer={localizer}
                    events={calendarEvents.filter(e => calendarFilter === 'all' || e.resource?.status === calendarFilter)}
                    startAccessor="start" endAccessor="end" style={{ height: '100%' }}
                    views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]} defaultView={Views.MONTH}
                    components={{ toolbar: CustomCalendarToolbar }}
                    onSelectEvent={(event) => { setSelectedEvent(event.resource || null); setShowEventModal(true); }}
                    messages={{ today: 'Hoy', previous: 'Anterior', next: 'Siguiente', month: 'Mes', week: 'Semana', day: 'Día', agenda: 'Agenda', noEventsInRange: 'No hay visitas en este rango', date: 'Fecha', time: 'Hora', event: 'Visita' }}
                    eventPropGetter={(event) => {
                        const reason = event.resource?.reason?.toLowerCase() || '';
                        const isActive = event.resource?.status === 'active';
                        let bgColor = '#1b232a', borderColor = '#4dd7ff', textColor = '#e5edf5';
                        if (!isActive) { bgColor = '#151b20'; borderColor = '#2e3842'; textColor = '#7c8a97'; }
                        else if (reason.includes('reunión') || reason.includes('meeting')) borderColor = '#60a5fa';
                        else if (reason.includes('entrega') || reason.includes('delivery')) borderColor = '#34d399';
                        else if (reason.includes('mantenimiento') || reason.includes('técnico')) borderColor = '#fbbf24';
                        else if (reason.includes('emergencia') || reason.includes('urgente')) borderColor = '#f87171';
                        return { style: { backgroundColor: bgColor, borderLeft: `3px solid ${borderColor}`, color: textColor, borderRadius: '4px', fontSize: '11px', fontWeight: '600', padding: '2px 5px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' } };
                    }}
                    tooltipAccessor={(event) => `${event.title}\n${event.resource?.Visitor?.company || ''}\nEntrada: ${format(event.start, 'HH:mm', { locale: es })}`}
                    dayPropGetter={(date) => {
                        const dayEvents = calendarEvents.filter(e => new Date(e.start).toDateString() === date.toDateString());
                        return dayEvents.length >= 5 ? { style: { backgroundColor: '#1b232a' } } : {};
                    }}
                />
            </div>
            <div className="mt-6"><CalendarLegend /></div>
        </div>
    );
};

export default CalendarView;
