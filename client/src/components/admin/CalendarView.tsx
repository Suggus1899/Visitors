import { Button } from '../ui/button';
import { useEffect, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import { createReportPDF, finishReportPDF, formatReportDate, reportFileDate, REPORT_MARGINS, REPORT_COLOR } from '../../utils/reportExport';
import { visitReportRow } from '../../utils/visitExport';
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
    fetchVisits: () => void;
}

const CalendarView = ({ fetchVisits }: CalendarViewProps) => {
    const [calendarFilter, setCalendarFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [selectedEvent, setSelectedEvent] = useState<Visit | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [reload, setReload] = useState(0);
    const [range, setRange] = useState(() => ({ start: startOfWeek(startOfMonth(new Date()), { locale: es }), end: endOfWeek(endOfMonth(new Date()), { locale: es }) }));

    useEffect(() => {
        let current = true;
        setLoading(true); setCalendarEvents([]);
        VisitService.getAllVisits({ startDate: format(range.start, 'yyyy-MM-dd'), endDate: format(range.end, 'yyyy-MM-dd'),
            status: calendarFilter === 'all' ? undefined : calendarFilter }).then(visits => {
            if (current) setCalendarEvents(visits.map(visit => ({ id: visit.id, title: `${visitReportRow(visit).name} - ${visitReportRow(visit).reason}`,
                start: new Date(visit.arrival_time || visit.check_in || visit.check_in_time || ''),
                end: new Date(visit.exit_time || visit.check_out || visit.check_out_time || visit.arrival_time || visit.check_in || visit.check_in_time || ''), resource: visit })));
        }).catch(() => { if (current) toast.error('No se pudo cargar el calendario. Inténtalo nuevamente.'); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [calendarFilter, range, reload]);

    const handleExport = () => {
        if (loading || !calendarEvents.length) return;
        try {
            const title = 'Calendario de visitas';
            const generatedAt = new Date();
            const doc = createReportPDF(title, [['Período', `${format(range.start, 'dd/MM/yyyy')} al ${format(range.end, 'dd/MM/yyyy')}`],
                ['Estado', calendarFilter === 'all' ? 'Todos' : calendarFilter === 'active' ? 'Activas' : 'Completadas'], ['Registros', String(calendarEvents.length)]]);
            const rows = [...calendarEvents].sort((a, b) => a.start.getTime() - b.start.getTime()).map(event => {
                const row = visitReportRow(event.resource!);
                return [row.name, row.cedula || '—', row.reason, formatReportDate(row.arrival), formatReportDate(row.entry), formatReportDate(row.exit), row.status];
            });
            autoTable(doc, { head: [['Visitante', 'Cédula', 'Motivo', 'Llegada', 'Entrada', 'Salida', 'Estado']], body: rows,
                startY: (doc.lastAutoTable?.finalY || 40) + 8, margin: REPORT_MARGINS, styles: { fontSize: 9, overflow: 'linebreak', cellPadding: 3 },
                headStyles: { fillColor: REPORT_COLOR }, alternateRowStyles: { fillColor: [243, 247, 249] }, rowPageBreak: 'avoid' });
            finishReportPDF(doc, title, generatedAt);
            doc.save(`calendario-visitas-${reportFileDate(generatedAt)}.pdf`);
        } catch { toast.error('No se pudo exportar el calendario. Inténtalo nuevamente.'); }
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
                        setReload(value => value + 1);
                    } catch { toast.error('No se pudo cerrar la visita.'); }
                }}
            />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 bg-[color:var(--surface-2)] p-4 rounded-xl border border-[color:var(--border-1)]">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-[color:var(--text-3)]">Filtrar visitas:</span>
                    <div className="flex bg-[color:var(--surface-1)] rounded-lg p-1 border border-[color:var(--border-1)]">
                        {[{ value: 'all', label: 'Todas' }, { value: 'active', label: 'Activas' }, { value: 'completed', label: 'Finalizadas' }].map(opt => (
                            <Button key={opt.value} onClick={() => setCalendarFilter(opt.value as typeof calendarFilter)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${calendarFilter === opt.value ? 'bg-[color:var(--surface-2)] text-[color:var(--accent-0)] shadow-sm border border-[color:var(--border-1)]' : 'text-[color:var(--text-3)] hover:text-[color:var(--text-1)]'}`}>
                                {opt.label}
                            </Button>
                        ))}
                    </div>
                </div>
                <Button
                    onClick={handleExport} 
                    disabled={loading || !calendarEvents.length}
                    className="btn-tech px-4 py-2 text-sm w-auto flex items-center justify-center gap-2"
                >
                    <Download size={16} /> {loading ? 'Cargando…' : 'Exportar Calendario'}
                </Button>
            </div>

            <div className="bg-[color:var(--surface-1)] rounded-xl border border-[color:var(--border-1)] p-2" style={{ height: '650px' }}>
                <Calendar 
                    localizer={localizer} culture="es"
                    events={calendarEvents.filter(e => calendarFilter === 'all' || e.resource?.status === calendarFilter)}
                    startAccessor="start" endAccessor="end" style={{ height: '100%' }}
                    views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]} defaultView={Views.MONTH}
                    onRangeChange={next => setRange(Array.isArray(next) ? { start: next[0], end: next[next.length - 1] } : next)}
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
