import Clock from 'lucide-react/dist/esm/icons/clock';
import User from 'lucide-react/dist/esm/icons/user';
import { ActivityItem } from './types';

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

interface AuditTableProps {
    loading: boolean;
    activities: ActivityItem[];
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    totalPages: number;
}

const AuditTable = ({ loading, activities, page, setPage, totalPages }: AuditTableProps) => {
    return (
        <>
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
                        disabled={page === totalPages || totalPages === 0}
                        className="btn-ghost px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Siguiente
                    </button>
                </div>
            </div>
        </>
    );
};

export default AuditTable;
