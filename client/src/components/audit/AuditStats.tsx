import { Bar } from 'react-chartjs-2';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up';
import User from 'lucide-react/dist/esm/icons/user';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Shield from 'lucide-react/dist/esm/icons/shield';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Stats, ActivityItem } from './types';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

interface AuditStatsProps {
    stats: Stats | null;
    activities: ActivityItem[];
}

const AuditStats = ({ stats, activities }: AuditStatsProps) => {
    if (!stats) return null;

    return (
        <>
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

            {stats.lastWeek?.dailyActivity && (
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
        </>
    );
};

export default AuditStats;
