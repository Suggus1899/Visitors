import { useEffect, useState, useMemo, useCallback } from 'react';
import { VisitService } from '../services/api.v1';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import Home from 'lucide-react/dist/esm/icons/home';
import Activity from 'lucide-react/dist/esm/icons/activity';
import Database from 'lucide-react/dist/esm/icons/database';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import CalendarIcon from 'lucide-react/dist/esm/icons/calendar';
import FileSpreadsheet from 'lucide-react/dist/esm/icons/file-spreadsheet';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Visit } from '../types';
import StatisticsPanel from './StatisticsPanel';
import BackupPanel from './BackupPanel';
import ActivityLogPanel from './ActivityLogPanel';
import { Header } from './Header';
import { useSessionTimeout } from '../hooks/useSessionTimeout';
import { SessionWarningModal } from './SessionWarningModal';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import CalendarEventModal from './CalendarEventModal';
import CalendarLegend from './CalendarLegend';
import CustomCalendarToolbar from './CustomCalendarToolbar';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Download from 'lucide-react/dist/esm/icons/download';

// Sub-components
import AdminStatsCards from './admin/AdminStatsCards';
import VisitsTable, { ITEMS_PER_PAGE } from './admin/VisitsTable';
import type { SortField, SortDirection, Filters } from './admin/VisitsTable';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const locales = { es };
const localizer = dateFnsLocalizer({
    format, parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    getDay, locales,
});

interface DashboardStats { totalVisits: number; activeVisits: number; visitsPerDay: { date: string; count: number }[]; }
interface VisitStatsResponse { summary?: { totalVisits: number; activeVisits: number }; recentActivity?: { date: string; count: number }[]; }
interface AlertsResponse { total: number; }
interface AlertSummary { total: number; warnings: number; critical: number; }
interface CalendarEvent { id: number; title: string; start: Date; end: Date; resource?: Visit; }

const AdminDashboard = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [totalVisitsCount, setTotalVisitsCount] = useState(0);
    const [activeTab, setActiveTab] = useState<'reports' | 'backups' | 'activity' | 'calendar'>('reports');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<SortField>('check_in');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [filters, setFilters] = useState<Filters>({ status: '', startDate: '', endDate: '', search: '', company: '' });
    const [alertsSummary, setAlertsSummary] = useState<AlertSummary>({ total: 0, warnings: 0, critical: 0 });
    const [selectedEvent, setSelectedEvent] = useState<Visit | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);
    const [calendarFilter, setCalendarFilter] = useState<'all' | 'active' | 'completed'>('all');

    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const { showWarning: showTimeoutWarning, timeLeft, extendSession, logout: autoLogout } = useSessionTimeout();

    const fetchStats = useCallback(async () => {
        try {
            const data = await VisitService.getStats() as VisitStatsResponse;
            setStats({ totalVisits: data.summary?.totalVisits || 0, activeVisits: data.summary?.activeVisits || 0, visitsPerDay: data.recentActivity || [] });
        } catch (err) { console.error(err); }
    }, []);

    const fetchAlerts = useCallback(async () => {
        try {
            const data = await VisitService.getAlerts() as AlertsResponse;
            const total = data?.total || 0;
            setAlertsSummary({ total, warnings: total, critical: 0 });
        } catch (err) { console.error('Error fetching alerts', err); }
    }, []);

    const fetchVisits = useCallback(async () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const params: any = { page: currentPage, limit: ITEMS_PER_PAGE };
            if (filters.status) params.status = filters.status;
            if (filters.search) params.search = filters.search;
            if (filters.startDate) params.startDate = filters.startDate;
            if (filters.endDate) params.endDate = filters.endDate;
            const data = await VisitService.getVisits(params);
            setVisits(data.visits);
            setTotalVisitsCount(data.total);
        } catch (err) { console.error(err); }
    }, [filters, currentPage]);

    useEffect(() => { fetchStats(); fetchVisits(); fetchAlerts(); }, [fetchStats, fetchVisits, fetchAlerts]);
    useEffect(() => { const interval = setInterval(fetchAlerts, 60000); return () => clearInterval(interval); }, [fetchAlerts]);
    useEffect(() => { setCurrentPage(1); }, [filters]);

    const handleFilterChange = (key: keyof Filters, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

    const handleSort = (field: SortField) => {
        if (sortField === field) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDirection('asc'); }
    };

    const sortedVisits = useMemo(() => {
        return [...visits].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'visitor': comparison = `${a.Visitor?.first_name || ''} ${a.Visitor?.last_name || ''}`.toLowerCase().localeCompare(`${b.Visitor?.first_name || ''} ${b.Visitor?.last_name || ''}`.toLowerCase()); break;
                case 'check_in': comparison = new Date(a.check_in || a.check_in_time || '').getTime() - new Date(b.check_in || b.check_in_time || '').getTime(); break;
                case 'check_out': comparison = (a.check_out ? new Date(a.check_out).getTime() : 0) - (b.check_out ? new Date(b.check_out).getTime() : 0); break;
                case 'reason': comparison = (a.reason || '').localeCompare(b.reason || ''); break;
                case 'status': comparison = a.status.localeCompare(b.status); break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [visits, sortField, sortDirection]);

    const totalPages = Math.ceil(totalVisitsCount / ITEMS_PER_PAGE);

    const calendarEvents: CalendarEvent[] = useMemo(() => visits.map(visit => ({
        id: visit.id,
        title: `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''} - ${visit.reason || 'Visita'}`,
        start: new Date(visit.check_in || visit.check_in_time || ''),
        end: (visit.check_out || visit.check_out_time) ? new Date(visit.check_out || visit.check_out_time!) : new Date(visit.check_in || visit.check_in_time || ''),
        resource: visit
    })), [visits]);

    const tabs = [
        { id: 'reports', label: 'Reportes', icon: FileSpreadsheet },
        { id: 'calendar', label: 'Calendario', icon: CalendarIcon },
        { id: 'backups', label: 'Respaldos', icon: Database },
        { id: 'activity', label: 'Log de Actividades', icon: Activity }
    ];

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] font-sans relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-30" />
            <div className="absolute inset-0 bg-noise opacity-20 mix-blend-soft-light" />
            <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[color:var(--accent-2)] opacity-15 blur-3xl" />
            <div className="absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[color:var(--accent-0)] opacity-12 blur-3xl" />

            <SessionWarningModal show={showTimeoutWarning} timeLeft={timeLeft} onExtend={extendSession} onLogout={autoLogout} />

            <Header user={user} logout={logout}>
                {alertsSummary.total > 0 && (
                    <div className="relative group cursor-pointer mr-2" title={`${alertsSummary.total} alertas activas`}>
                        <AlertCircle size={24} className={`text-[color:var(--accent-0)] ${alertsSummary.critical > 0 ? 'animate-pulse text-red-400' : ''}`} />
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{alertsSummary.total}</span>
                    </div>
                )}
                <button onClick={() => navigate('/')} className="bg-[color:var(--accent-1)] hover:bg-[color:var(--accent-0)] text-[#081116] px-3 py-1.5 rounded-md text-xs font-semibold tracking-[0.18em] uppercase flex items-center transition-colors">
                    <Home size={16} className="mr-1" /> Operaciones
                </button>
            </Header>

            <main className="container mx-auto px-4 py-8 relative z-10">
                <AdminStatsCards totalVisits={stats?.totalVisits || 0} activeVisits={stats?.activeVisits || 0} />

                {/* Tabs */}
                <div className="flex space-x-1 mb-6 border-b border-gray-300 overflow-x-auto">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
                            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === tab.id ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)] bg-[color:var(--surface-2)] rounded-t' : 'border-transparent text-[color:var(--text-3)] hover:text-[color:var(--text-1)]'}`}>
                            <tab.icon size={18} />{tab.label}
                        </button>
                    ))}
                </div>

                {/* Reports tab */}
                {activeTab === 'reports' && (
                    <div className="space-y-8">
                        <StatisticsPanel />
                        <VisitsTable
                            visits={visits}
                            sortedVisits={sortedVisits}
                            totalVisitsCount={totalVisitsCount}
                            currentPage={currentPage}
                            totalPages={totalPages}
                            filters={filters}
                            sortField={sortField}
                            sortDirection={sortDirection}
                            username={user?.username}
                            onFilterChange={handleFilterChange}
                            onSort={handleSort}
                            onPageChange={setCurrentPage}
                        />
                    </div>
                )}

                {/* Calendar tab */}
                {activeTab === 'calendar' && (
                    <div className="panel-tech rounded-lg p-6">
                        <CalendarEventModal visit={selectedEvent} isOpen={showEventModal}
                            onClose={() => { setShowEventModal(false); setSelectedEvent(null); }}
                            onCheckout={async (id) => { try { await VisitService.checkOut(id); fetchVisits(); } catch (err) { console.error('Error checkout:', err); } }}
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
                            <button onClick={() => {
                                const doc = new jsPDF();
                                doc.setFontSize(16); doc.text('Calendario de Visitas', 14, 20);
                                doc.setFontSize(10); doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, 14, 28);
                                const tableData = calendarEvents.filter(e => calendarFilter === 'all' || e.resource?.status === calendarFilter).slice(0, 50).map(e => [e.title, format(e.start, 'dd/MM/yyyy HH:mm', { locale: es }), e.end ? format(e.end, 'dd/MM/yyyy HH:mm', { locale: es }) : '-', e.resource?.status === 'active' ? 'Activa' : 'Finalizada']);
                                autoTable(doc, { head: [['Visitante', 'Entrada', 'Salida', 'Estado']], body: tableData, startY: 35, styles: { fontSize: 8 } });
                                doc.save(`calendario_visitas_${format(new Date(), 'yyyyMMdd')}.pdf`);
                            }} className="btn-tech px-4 py-2 text-sm w-auto flex items-center justify-center gap-2">
                                <Download size={16} /> Exportar Calendario
                            </button>
                        </div>

                        <div className="bg-[color:var(--surface-1)] rounded-xl border border-[color:var(--border-1)] p-2" style={{ height: '650px' }}>
                            <Calendar localizer={localizer}
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
                )}

                {activeTab === 'backups' && <BackupPanel />}
                {activeTab === 'activity' && <ActivityLogPanel />}
            </main>
        </div>
    );
};

export default AdminDashboard;
