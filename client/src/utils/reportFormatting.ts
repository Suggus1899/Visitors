export const REPORT_TIME_ZONE = 'America/Caracas';
export const REPORT_COLOR: [number, number, number] = [13, 115, 105];
export const REPORT_MARGINS = { top: 38, bottom: 20, left: 14, right: 14 };

export function formatReportDate(value?: string | Date | null) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-VE', {
        timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
}

export function excelReportDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    // Excel dates have no timezone; store the wall-clock time printed in the report.
    const parts = new Intl.DateTimeFormat('en', { timeZone: REPORT_TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === name)?.value);
    return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')));
}

export function reportFileDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

