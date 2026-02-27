import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Clock from 'lucide-react/dist/esm/icons/clock';
import User from 'lucide-react/dist/esm/icons/user';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Search from 'lucide-react/dist/esm/icons/search';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Download from 'lucide-react/dist/esm/icons/download';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import { ThemeToggle } from './ThemeToggle';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

interface ActivityItem {
    id: number;
    userId: number;
    username: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
}

interface Stats {
    today: {
        logins: number;
        actions: number;
        uniqueUsers: number;
        uniqueIPs: number;
    };
    lastWeek: {
        dailyActivity: { date: string; count: number }[];
    }
}

const ACTION_COLORS: { [key: string]: string } = {
    LOGIN: 'bg-[color:var(--surface-2)] text-[color:var(--accent-0)] border border-[color:var(--border-1)]',
    LOGOUT: 'bg-[color:var(--surface-2)] text-[color:var(--text-3)] border border-[color:var(--border-1)]',
    CREATE: 'bg-[color:var(--surface-2)] text-emerald-300 border border-emerald-400/30',
    UPDATE: 'bg-[color:var(--surface-2)] text-amber-300 border border-amber-400/30',
    DELETE: 'bg-[color:var(--surface-2)] text-red-300 border border-red-400/30',
    CHECKOUT: 'bg-[color:var(--surface-2)] text-sky-300 border border-sky-400/30',
    BACKUP: 'bg-[color:var(--surface-2)] text-[color:var(--accent-0)] border border-[color:var(--border-1)]',
    EXPORT: 'bg-[color:var(--surface-2)] text-violet-300 border border-violet-400/30'
};

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
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            // Fetch Stats
            const statsRes = await axios.get('http://localhost:3000/api/v1/audit/stats', { headers });
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

            const logsRes = await axios.get(`http://localhost:3000/api/v1/audit/logs?${params}`, { headers });
            
            setActivities(logsRes.data.data.logs);
            setTotalPages(logsRes.data.data.pagination.pages);
        } catch (err) {
            console.error('Failed to fetch audit data:', err);
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
            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            if (filterAction) params.append('action', filterAction);
            if (filterUsername) params.append('username', filterUsername);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);

            const response = await axios.get(`http://localhost:3000/api/v1/audit/export?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
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
            console.error('Export failed:', err);
            toast.error('Error al exportar logs');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const formatAgent = (agent?: string) => {
        if (!agent) return 'Desconocido';
        if (agent.includes('Chrome')) return 'Chrome';
        if (agent.includes('Firefox')) return 'Firefox';
        if (agent.includes('Safari')) return 'Safari';
        if (agent.includes('Edge')) return 'Edge';
        return 'Otro';
    };

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-30" />
            <div className="absolute inset-0 bg-noise opacity-20 mix-blend-soft-light" />
            <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[color:var(--accent-2)] opacity-15 blur-3xl" />
            <div className="absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[color:var(--accent-0)] opacity-12 blur-3xl" />

            <div className="max-w-7xl mx-auto space-y-6 relative z-10">
                
                {/* Header */}
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center panel-tech p-6 rounded-xl gap-4">
                    <div>
                        <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2">
                            <Shield className="text-[color:var(--accent-0)]" />
                            Dashboard de Auditoría
                        </h1>
                        <p className="text-[color:var(--text-3)]">Monitorización y rastro de actividades del sistema</p>
                    </div>
                    <div className="flex gap-3 items-center">
                        <ThemeToggle />
                        <div className="flex items-center gap-2 mr-4 bg-[color:var(--surface-2)] rounded-lg px-3 py-2 border border-[color:var(--border-1)]">
                            <span className="text-xs text-[color:var(--text-3)] font-medium">Auto-refresh</span>
                            <div 
                                className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${autoRefresh ? 'bg-[color:var(--accent-0)]' : 'bg-[color:var(--border-1)]'}`}
                                onClick={() => setAutoRefresh(!autoRefresh)}
                            >
                                <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                        </div>

                        <button 
                            onClick={handleExport}
                            className="btn-ghost px-4 py-2"
                        >
                            <Download size={18} />
                            <span className="hidden sm:inline">Exportar</span>
                        </button>
                        <button 
                            onClick={fetchData}
                            className={`btn-ghost px-4 py-2 ${loading ? 'opacity-70' : ''}`}
                            disabled={loading}
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                            <span className="hidden sm:inline">Actualizar</span>
                        </button>
                        <button 
                            onClick={handleLogout}
                            className="border border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors font-medium ml-2"
                        >
                            <LogOut size={18} />
                            <span className="hidden sm:inline">Salir</span>
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="flex items-center justify-between panel-tech p-5 rounded-xl relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-[color:var(--surface-2)] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div>
                                <div className="text-[color:var(--text-3)] text-sm font-medium mb-1">Logins Hoy</div>
                                <div className="text-3xl font-bold text-[color:var(--text-1)] relative z-10">{stats.today.logins}</div>
                            </div>
                            <User className="text-[color:var(--accent-0)] relative z-10" size={28} />
                        </div>
                        <div className="flex items-center justify-between panel-tech p-5 rounded-xl relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-[color:var(--surface-2)] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div>
                                <div className="text-[color:var(--text-3)] text-sm font-medium mb-1">Acciones Hoy</div>
                                <div className="text-3xl font-bold text-[color:var(--text-1)] relative z-10">{stats.today.actions}</div>
                            </div>
                            <RefreshCw className="text-[color:var(--accent-0)] relative z-10" size={28} />
                        </div>
                        <div className="flex items-center justify-between panel-tech p-5 rounded-xl relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-[color:var(--surface-2)] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div>
                                <div className="text-[color:var(--text-3)] text-sm font-medium mb-1">Usuarios Activos</div>
                                <div className="text-3xl font-bold text-[color:var(--text-1)] relative z-10">{stats.today.uniqueUsers}</div>
                            </div>
                            <User className="text-[color:var(--accent-1)] relative z-10" size={28} />
                        </div>
                        <div className="flex items-center justify-between panel-tech p-5 rounded-xl relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-[color:var(--surface-2)] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div>
                                <div className="text-[color:var(--text-3)] text-sm font-medium mb-1">IPs Únicas (24h)</div>
                                <div className="text-3xl font-bold text-[color:var(--text-1)] relative z-10">{stats.today.uniqueIPs}</div>
                            </div>
                            <Shield className="text-[color:var(--accent-0)] relative z-10" size={28} />
                        </div>
                    </div>
                )}

                {/* Chart Section */}
                {stats && stats.lastWeek?.dailyActivity && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                         <div className="lg:col-span-2 panel-tech p-6 rounded-xl">
                            <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                                <TrendingUp className="text-[color:var(--accent-0)]" size={20} />
                                Actividad últimos 7 días
                            </h3>
                            <div className="h-64">
                                <Bar 
                                    data={{
                                        labels: stats.lastWeek.dailyActivity.map(d => new Date(d.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })),
                                        datasets: [{
                                            label: 'Acciones',
                                            data: stats.lastWeek.dailyActivity.map(d => d.count),
                                            backgroundColor: 'rgba(77, 215, 255, 0.6)',
                                            borderColor: '#4dd7ff',
                                            borderWidth: 1,
                                            borderRadius: 4,
                                        }]
                                    }}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: {
                                                backgroundColor: '#0f1418',
                                                padding: 12,
                                                cornerRadius: 8,
                                                titleColor: '#e5edf5',
                                                bodyColor: '#b1bcc6',
                                                borderColor: '#2e3842',
                                                borderWidth: 1
                                            }
                                        },
                                        scales: {
                                            y: {
                                                beginAtZero: true,
                                                grid: { color: '#1f2a33' },
                                                ticks: { color: '#b1bcc6' },
                                                border: { color: '#2e3842' }
                                            },
                                            x: {
                                                grid: { display: false },
                                                ticks: { color: '#7c8a97' },
                                                border: { color: '#2e3842' }
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div className="panel-tech p-6 rounded-xl">
                             <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                                <AlertTriangle className="text-amber-300" size={20} />
                                Resumen de Seguridad
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                    <span className="text-sm text-[color:var(--text-2)]">Intentos fallidos (24h)</span>
                                    <span className="font-bold text-[color:var(--text-1)]">0</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-[color:var(--surface-2)] rounded-lg border border-red-400/40">
                                    <span className="text-sm text-red-300 font-medium">Acciones críticas</span>
                                    <span className="font-bold text-red-300">
                                        {activities.filter(a => ['DELETE', 'BACKUP'].includes(a.action)).length}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                    <span className="text-sm text-[color:var(--text-2)]">Usuarios nuevos (7d)</span>
                                    <span className="font-bold text-[color:var(--text-1)]">
                                        {activities.filter(a => a.action === 'CREATE' && a.entity === 'User').length}
                                    </span>
                                </div>
                                <div className="mt-4 pt-4 border-t border-[color:var(--border-1)]">
                                    <div className="text-xs text-[color:var(--text-3)] text-center">
                                        Política de Retención: 365 días
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <div className="panel-tech rounded-xl overflow-hidden">
                    
                    {/* Filters Toolbar */}
                    <div className="p-4 border-b border-[color:var(--border-1)] bg-[color:var(--surface-2)] flex flex-wrap gap-3 items-center">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-[color:var(--text-3)]" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar detalles..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="input-tech pl-10 w-64"
                            />
                        </div>
                        
                        <select
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="input-tech px-3 py-2"
                        >
                            <option value="">Todas las acciones</option>
                            <option value="LOGIN">LOGIN</option>
                            <option value="LOGOUT">LOGOUT</option>
                            <option value="CREATE">CREATE</option>
                            <option value="UPDATE">UPDATE</option>
                            <option value="DELETE">DELETE</option>
                            <option value="CHECKOUT">CHECKOUT</option>
                            <option value="BACKUP">BACKUP</option>
                        </select>

                        <div className="flex items-center gap-2 bg-[color:var(--surface-0)] border border-[color:var(--border-1)] rounded-lg px-2">
                            <Calendar size={18} className="text-[color:var(--text-3)]" />
                            <input 
                                type="date" 
                                value={filterStartDate}
                                onChange={(e) => setFilterStartDate(e.target.value)}
                                className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                            />
                            <span className="text-[color:var(--text-3)]">-</span>
                            <input 
                                type="date" 
                                value={filterEndDate}
                                onChange={(e) => setFilterEndDate(e.target.value)}
                                className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                            />
                        </div>

                        <input
                            type="text"
                            placeholder="Usuario..."
                            value={filterUsername}
                            onChange={(e) => setFilterUsername(e.target.value)}
                            className="input-tech w-40"
                        />
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-[color:var(--text-2)]">
                            <thead className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] font-semibold uppercase text-xs border-b border-[color:var(--border-1)]">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Usuario</th>
                                    <th className="px-6 py-4">Acción</th>
                                    <th className="px-6 py-4">Entidad</th>
                                    <th className="px-6 py-4">Detalles</th>
                                    <th className="px-6 py-4">IP / Agente</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[color:var(--border-1)]">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-[color:var(--text-3)]">
                                            Cargando datos...
                                        </td>
                                    </tr>
                                ) : activities.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-[color:var(--text-3)]">
                                            No se encontraron actividades registradas
                                        </td>
                                    </tr>
                                ) : (
                                    activities.map((activity) => (
                                        <tr key={activity.id} className="hover:bg-[color:var(--surface-2)] transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <Clock size={16} className="text-[color:var(--text-3)]" />
                                                    {formatDate(activity.createdAt)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-[color:var(--text-1)]">
                                                <div className="flex items-center gap-2">
                                                    <User size={16} className="text-[color:var(--text-3)]" />
                                                    {activity.username}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-md text-xs font-semibold ${ACTION_COLORS[activity.action] || 'bg-[color:var(--surface-2)] text-[color:var(--text-3)] border border-[color:var(--border-1)]'}`}>
                                                    {activity.action}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{activity.entity}</span>
                                                    <span className="text-xs text-[color:var(--text-3)]">ID: {activity.entityId}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 max-w-xs truncate" title={activity.details}>
                                                {activity.details || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-[color:var(--text-3)]">
                                                <div className="flex flex-col">
                                                    <span className="font-mono">{activity.ipAddress || 'Unknown'}</span>
                                                    <span className="text-[color:var(--text-3)]">{formatAgent(activity.userAgent)}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="px-6 py-4 border-t border-[color:var(--border-1)] flex justify-between items-center bg-[color:var(--surface-2)]">
                        <div className="text-sm text-[color:var(--text-3)]">
                            Página {page} de {totalPages}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="btn-ghost px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Anterior
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="btn-ghost px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuditDashboard;
