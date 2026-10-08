import { useState, useEffect, useCallback } from 'react';
import api from '../services/api.v1';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

import AuditHeader from './audit/AuditHeader';
import AuditStats from './audit/AuditStats';
import AuditFilters from './audit/AuditFilters';
import AuditTable from './audit/AuditTable';
import { ActivityItem, Stats } from './audit/types';

const AuditDashboard = () => {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    // Auto-refresh state
    const [autoRefresh, setAutoRefresh] = useState(false);

    const { logout } = useAuth();
    const navigate = useNavigate();
    
    // Filters
    const [filterAction, setFilterAction] = useState('');
    const [filterUsername, setFilterUsername] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            // Fetch Stats
            const statsRes = await api.get('/audit/stats');
            setStats(statsRes.data.data);

            // Fetch Logs
            const params = new URLSearchParams({ 
                page: String(page), 
                limit: '20'
            });
            
            if (filterAction) params.append('action', filterAction);
            if (filterUsername) params.append('username', filterUsername);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);
            if (searchQuery) params.append('search', searchQuery);

            const logsRes = await api.get(`/audit/logs?${params}`);
            
            setActivities(logsRes.data.data.logs);
            setTotalPages(logsRes.data.data.pagination.pages);
        } catch (err) {
            toast.error('Error al cargar datos de auditoría');
        } finally {
            setLoading(false);
        }
    }, [page, filterAction, filterUsername, filterStartDate, filterEndDate, searchQuery]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-refresh logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (autoRefresh) {
            interval = setInterval(fetchData, 30000); // 30s
        }
        return () => clearInterval(interval);
    }, [autoRefresh, fetchData]);

    const handleLogout = () => {
        logout();
        navigate('/login');
        toast.success('Sesión cerrada correctamente');
    };

    const handleExport = async () => {
        try {
            const params = new URLSearchParams();
            if (filterAction) params.append('action', filterAction);
            if (filterUsername) params.append('username', filterUsername);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);

            const response = await api.get(`/audit/export?${params}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Exportación completada');
        } catch (err) {
            toast.error('Error al exportar logs');
        }
    };

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-30" />
            <div className="absolute inset-0 bg-noise opacity-20 mix-blend-soft-light" />
            <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[color:var(--accent-2)] opacity-15 blur-3xl" />
            <div className="absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[color:var(--accent-0)] opacity-12 blur-3xl" />

            <div className="max-w-7xl mx-auto space-y-6 relative z-10">
                
                <AuditHeader 
                    autoRefresh={autoRefresh}
                    setAutoRefresh={setAutoRefresh}
                    handleExport={handleExport}
                    handleLogout={handleLogout}
                    fetchData={fetchData}
                    loading={loading}
                />

                <AuditStats 
                    stats={stats}
                    activities={activities}
                />

                <div className="panel-tech rounded-xl overflow-hidden">
                    <AuditFilters 
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        filterAction={filterAction}
                        setFilterAction={setFilterAction}
                        filterStartDate={filterStartDate}
                        setFilterStartDate={setFilterStartDate}
                        filterEndDate={filterEndDate}
                        setFilterEndDate={setFilterEndDate}
                        filterUsername={filterUsername}
                        setFilterUsername={setFilterUsername}
                    />

                    <AuditTable 
                        loading={loading}
                        activities={activities}
                        page={page}
                        setPage={setPage}
                        totalPages={totalPages}
                    />
                </div>
            </div>
        </div>
    );
};

export default AuditDashboard;
