import type { Visit } from '../types';
import type { SortField, SortDirection } from '../components/admin/VisitsTable';
export const VISIT_STATUS_LABELS: Record<Visit['status'], string> = {
    waiting: 'En espera', active: 'Activa', intermittent: 'Salida temporal', completed: 'Completada',
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
        entry: visit.entry_time || (visit.status === 'waiting' ? undefined : visit.check_in || visit.check_in_time),
        exit: visit.exit_time || visit.check_out || visit.check_out_time,
        status: VISIT_STATUS_LABELS[visit.status],
    };
}

export function sortReportVisits(visits: Visit[], field: SortField, direction: SortDirection) {
    const value = (visit: Visit) => {
        const row = visitReportRow(visit);
        if (field === 'visitor') return row.name;
        if (field === 'reason') return row.reason;
        if (field === 'status') return row.status;
        const date = field === 'arrival_time' ? row.arrival : field === 'exit_time' || field === 'check_out' ? row.exit : row.entry;
        return date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).getTime() : 0;
    };
    return [...visits].sort((a, b) => {
        const left = value(a), right = value(b);
        const comparison = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right, 'es', { sensitivity: 'base' }) : Number(left) - Number(right);
        return (comparison || a.id - b.id) * (direction === 'asc' ? 1 : -1);
    });
}

