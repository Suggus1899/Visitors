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
import { Visit, CalendarEvent } from '../types';
import StatisticsPanel from './StatisticsPanel';
import BackupPanel from './BackupPanel';
import ActivityLogPanel from './ActivityLogPanel';
import { Header } from './Header';
import CalendarView from './admin/CalendarView';

// Sub-components
import AdminStatsCards from './admin/AdminStatsCards';
import VisitsTable, { ITEMS_PER_PAGE } from './admin/VisitsTable';
import type { SortField, SortDirection, Filters } from './admin/VisitsTable';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface DashboardStats { totalVisits: number; activeVisits: number; visitsPerDay: { date: string; count: number }[]; }
interface VisitStatsResponse { summary?: { totalVisits: number; activeVisits: number }; recentActivity?: { date: string; count: number }[]; }
interface AlertsResponse { total: number; }
interface AlertSummary { total: number; warnings: number; critical: number; }

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

    const { logout, user } = useAuth();
    const navigate = useNavigate();

    const fetchStats = useCallback(async () => {
        try {
            const data = await VisitService.getStats() as VisitStatsResponse;
            setStats({ totalVisits: data.summary?.totalVisits || 0, activeVisits: data.summary?.activeVisits || 0, visitsPerDay: data.recentActivity || [] });
        } catch { /* stats default to null/0 */ }
    }, []);

    const fetchAlerts = useCallback(async () => {
        try {
            const data = await VisitService.getAlerts() as AlertsResponse;
            const total = data?.total || 0;
            setAlertsSummary({ total, warnings: total, critical: 0 });
        } catch { /* alerts default to 0 */ }
    }, []);

    const fetchVisits = useCallback(async () => {
        try {
            const params: { page: number; limit: number; status?: string; search?: string; startDate?: string; endDate?: string } = { page: currentPage, limit: ITEMS_PER_PAGE };
            if (filters.status) params.status = filters.status;
            if (filters.search) params.search = filters.search;
            if (filters.startDate) params.startDate = filters.startDate;
            if (filters.endDate) params.endDate = filters.endDate;
            const data = await VisitService.getVisits(params);
            setVisits(data.visits);
            setTotalVisitsCount(data.total);
        } catch { /* visits default to empty */ }
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
                    <CalendarView calendarEvents={calendarEvents} fetchVisits={fetchVisits} />
                )}

                {activeTab === 'backups' && <BackupPanel />}
                {activeTab === 'activity' && <ActivityLogPanel />}
            </main>
        </div>
    );
};

export default AdminDashboard;
