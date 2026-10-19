import type { Visit } from '../types';
export const VISIT_STATUS_LABELS: Record<Visit['status'], string> = {
    waiting: 'En espera', active: 'Activa', intermittent: 'Salida temporal', completed: 'Completada', cancelled: 'Cancelada',
};

export function visitReportRow(visit: Visit) {
    const anonymous = visit.visitor_cedula === null;
    return {
        id: visit.id,
        name: anonymous ? 'Anonimizado' : `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''}`.trim() || 'Sin nombre',
        cedula: anonymous ? '' : visit.visitor_cedula,
        company: anonymous ? 'Anonimizado' : visit.Visitor?.company || '',
        reason: anonymous ? 'Visita anonimizada' : visit.reason || visit.purpose || '',
        department: anonymous ? '' : visit.target_department || visit.department || '',
        host: anonymous ? '' : visit.host_person || visit.person_to_visit || visit.personToVisit || '',
        arrival: visit.arrival_time || visit.check_in || visit.check_in_time,
        entry: visit.entry_time || (visit.status === 'waiting' || visit.status === 'cancelled' ? undefined : visit.check_in || visit.check_in_time),
        exit: visit.exit_time || visit.check_out || visit.check_out_time,
        status: VISIT_STATUS_LABELS[visit.status],
    };
}

