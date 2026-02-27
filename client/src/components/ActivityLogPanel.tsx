import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Activity from 'lucide-react/dist/esm/icons/activity';
import Clock from 'lucide-react/dist/esm/icons/clock';
import User from 'lucide-react/dist/esm/icons/user';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

interface ActivityItem {
    id: number;
    userId: number;
    username: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: string;
    ip?: string;
    createdAt: string;
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

const ACTION_LABELS: { [key: string]: string } = {
    LOGIN: 'Inicio Sesión',
    LOGOUT: 'Cierre Sesión',
    CREATE: 'Creación',
    UPDATE: 'Actualización',
    DELETE: 'Eliminación',
    CHECKOUT: 'Check-out',
    BACKUP: 'Respaldo',
    EXPORT: 'Exportación'
};

const ActivityLogPanel = () => {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filterAction, setFilterAction] = useState('');

    const fetchActivities = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({ page: String(page), limit: '20' });
            if (filterAction) params.append('action', filterAction);

            const response = await axios.get(`http://localhost:3000/api/v1/audit/logs?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setActivities(response.data.data.logs);
            setTotalPages(response.data.data.pagination.pages);
        } catch (err) {
            console.error('Failed to fetch activities:', err);
        } finally {
            setLoading(false);
        }
    }, [page, filterAction]);

    useEffect(() => { fetchActivities(); }, [fetchActivities]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="panel-tech rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2">
                    <Activity size={20} className="text-[color:var(--accent-0)]" />
                    Log de Actividades
                </h3>
                <div className="flex items-center gap-3">
                    <select
                        value={filterAction}
                        onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
                        className="input-tech text-sm py-2 pl-3 pr-8"
                    >
                        <option value="">Todas las acciones</option>
                        <option value="LOGIN">Inicios de sesión</option>
                        <option value="CREATE">Creaciones</option>
                        <option value="CHECKOUT">Check-outs</option>
                        <option value="BACKUP">Respaldos</option>
                    </select>
                    <button
                        onClick={fetchActivities}
                        className="btn-ghost px-2.5 py-2"
                        title="Actualizar"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8 text-[color:var(--text-3)]">Cargando actividades...</div>
            ) : activities.length === 0 ? (
                <div className="text-center py-8 text-[color:var(--text-3)]">No hay actividades registradas</div>
            ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {activities.map(activity => (
                        <div key={activity.id} className="flex items-start gap-3 p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)] hover:border-[color:var(--accent-2)] transition-colors">
                            <div className="flex-shrink-0 mt-1">
                                <User size={16} className="text-[color:var(--text-3)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-[color:var(--text-1)]">{activity.username}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[activity.action] || 'bg-[color:var(--surface-2)] text-[color:var(--text-3)] border border-[color:var(--border-1)]'}`}>
                                        {ACTION_LABELS[activity.action] || activity.action}
                                    </span>
                                    <span className="text-xs text-[color:var(--text-3)]">{activity.entity}</span>
                                </div>
                                {activity.details && (
                                    <p className="text-sm text-[color:var(--text-2)] truncate">{activity.details}</p>
                                )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                                <div className="text-xs text-[color:var(--text-3)] flex items-center gap-1">
                                    <Clock size={12} />
                                    {formatDate(activity.createdAt)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="btn-ghost px-3 py-1.5 disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <span className="px-3 py-1 text-sm text-[color:var(--text-3)]">
                        Página {page} de {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="btn-ghost px-3 py-1.5 disabled:opacity-50"
                    >
                        Siguiente
                    </button>
                </div>
            )}
        </div>
    );
};

export default ActivityLogPanel;
