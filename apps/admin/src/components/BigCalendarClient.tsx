'use client';

import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { CalendarEvent } from '@logmaster/types';
import CustomCalendarToolbar from './CustomCalendarToolbar';

const locales = { es };
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

interface BigCalendarClientProps {
    events: CalendarEvent[];
    onSelectEvent: (event: CalendarEvent) => void;
}

/**
 * Client-only wrapper around react-big-calendar.
 *
 * react-big-calendar relies on `window`/DOM APIs, so it must never be
 * server-rendered. This component is loaded via `next/dynamic` with
 * `ssr: false` from CalendarPage.
 */
const BigCalendarClient = ({ events, onSelectEvent }: BigCalendarClientProps) => {
    return (
        <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            defaultView={Views.MONTH}
            components={{ toolbar: CustomCalendarToolbar }}
            onSelectEvent={(event) => onSelectEvent(event as unknown as CalendarEvent)}
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
                const resource = (event as unknown as CalendarEvent).resource;
                const reason = resource?.reason?.toLowerCase() || '';
                const isActive = resource?.status === 'active';
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
            tooltipAccessor={(event) => {
                const e = event as unknown as CalendarEvent;
                return `${e.title}\n${e.resource?.Visitor?.company || ''}\nCheck in: ${format(e.start, 'HH:mm', { locale: es })}`;
            }}
        />
    );
};

export default BigCalendarClient;
