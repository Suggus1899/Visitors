import { useState, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { useVisitListQuery } from '../services/useAdminQueries';
import { Skeleton } from '@logmaster/ui';
import CalendarEventModal from './CalendarEventModal';
import CustomCalendarToolbar from './CustomCalendarToolbar';
import CalendarLegend from './CalendarLegend';
import type { CalendarEvent, Visit } from '@logmaster/types';

import Download from 'lucide-react/dist/esm/icons/download';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const locales = { es: es };
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

const CalendarPage = () => {
    const [calendarFilter, setCalendarFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [selectedEvent, setSelectedEvent] = useState<Visit | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);

    const { data, isLoading } = useVisitListQuery({ page: 1, limit: 1000 });
    const visits = data?.visits || [];

    const calendarEvents: CalendarEvent[] = useMemo(
        () =>
            visits.map((visit: Visit) => ({
                id: visit.id,
                title: `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''} - ${visit.reason || 'Visita'}`,
                start: new Date(visit.check_in || visit.check_in_time || ''),
                end: visit.check_out || visit.check_out_time
                    ? new Date(visit.check_out || visit.check_out_time!)
                    : new Date(visit.check_in || visit.check_in_time || ''),
                resource: visit,
            })),
        [visits]
    );

    const filteredEvents = useMemo(
        () => calendarEvents.filter((e) => calendarFilter === 'all' || e.resource?.status === calendarFilter),
        [calendarEvents, calendarFilter]
    );

    const handleExport = () => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text('Calendar of Visits', 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, 14, 28);
        const tableData = filteredEvents.slice(0, 50).map((e) => [
            e.title,
            format(e.start, 'dd/MM/yyyy HH:mm', { locale: es }),
            e.end ? format(e.end, 'dd/MM/yyyy HH:mm', { locale: es }) : '-',
            e.resource?.status === 'active' ? 'Active' : 'Completed',
        ]);
        autoTable(doc, {
            head: [['Visitor', 'Check In', 'Check Out', 'Status']],
            body: tableData,
            startY: 35,
            styles: { fontSize: 8 },
        });
        doc.save(`calendar_visits_${format(new Date(), 'yyyyMMdd')}.pdf`);
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Calendario de Visitas</h1>
                <div className="panel-tech rounded-lg p-6">
                    <Skeleton height={650} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Calendario de Visitas</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">Month, week, and day views of all visits</p>
                </div>
                <button onClick={handleExport} className="btn-tech px-4 py-2 text-sm flex items-center gap-2">
                    <Download size={16} /> Export PDF
                </button>
            </div>

            <CalendarEventModal
                visit={selectedEvent}
                isOpen={showEventModal}
                onClose={() => {
                    setShowEventModal(false);
                    setSelectedEvent(null);
                }}
            />

            {/* Filter bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[color:var(--surface-2)] p-4 rounded-xl border border-[color:var(--border-1)]">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-[color:var(--text-3)]">Filter visits:</span>
                    <div className="flex bg-[color:var(--surface-1)] rounded-lg p-1 border border-[color:var(--border-1)]">
                        {[
                            { value: 'all', label: 'All' },
                            { value: 'active', label: 'Active' },
                            { value: 'completed', label: 'Completed' },
                        ].map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setCalendarFilter(opt.value as typeof calendarFilter)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                                    calendarFilter === opt.value
                                        ? 'bg-[color:var(--surface-2)] text-[color:var(--accent-0)] shadow-sm border border-[color:var(--border-1)]'
                                        : 'text-[color:var(--text-3)] hover:text-[color:var(--text-1)]'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <span className="text-sm text-[color:var(--text-3)]">{filteredEvents.length} events</span>
            </div>

            {/* Calendar */}
            <div className="panel-tech rounded-lg p-6">
                <div
                    className="bg-[color:var(--surface-1)] rounded-xl border border-[color:var(--border-1)] p-2"
                    style={{ height: '650px' }}
                >
                    <Calendar
                        localizer={localizer}
                        events={filteredEvents}
                        startAccessor="start"
                        endAccessor="end"
                        style={{ height: '100%' }}
                        views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                        defaultView={Views.MONTH}
                        components={{ toolbar: CustomCalendarToolbar }}
                        onSelectEvent={(event) => {
                            setSelectedEvent(event.resource || null);
                            setShowEventModal(true);
                        }}
                        messages={{
                            today: 'Hoy',
                            previous: 'Anterior',
                            next: 'Siguiente',
                            month: 'Mes',
                            week: 'Semana',
                            day: 'Día',
                            agenda: 'Agenda',
                            noEventsInRange: 'No visits in this range',
                            date: 'Fecha',
                            time: 'Hora',
                            event: 'Visita',
                        }}
                        eventPropGetter={(event) => {
                            const reason = event.resource?.reason?.toLowerCase() || '';
                            const isActive = event.resource?.status === 'active';
                            let bgColor = '#1b232a';
                            let borderColor = '#4dd7ff';
                            let textColor = '#e5edf5';
                            if (!isActive) {
                                bgColor = '#151b20';
                                borderColor = '#2e3842';
                                textColor = '#7c8a97';
                            } else if (reason.includes('reunión') || reason.includes('meeting')) {
                                borderColor = '#60a5fa';
                            } else if (reason.includes('entrega') || reason.includes('delivery')) {
                                borderColor = '#34d399';
                            } else if (reason.includes('mantenimiento') || reason.includes('técnico')) {
                                borderColor = '#fbbf24';
                            } else if (reason.includes('emergencia') || reason.includes('urgente')) {
                                borderColor = '#f87171';
                            }
                            return {
                                style: {
                                    backgroundColor: bgColor,
                                    borderLeft: `3px solid ${borderColor}`,
                                    color: textColor,
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    padding: '2px 5px',
                                },
                            };
                        }}
                        tooltipAccessor={(event) =>
                            `${event.title}\n${event.resource?.Visitor?.company || ''}\nCheck in: ${format(event.start, 'HH:mm', { locale: es })}`
                        }
                    />
                </div>
                <div className="mt-6">
                    <CalendarLegend />
                </div>
            </div>
        </div>
    );
};

export default CalendarPage;
