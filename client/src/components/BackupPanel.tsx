import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Database from 'lucide-react/dist/esm/icons/database';
import Clock from 'lucide-react/dist/esm/icons/clock';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import Play from 'lucide-react/dist/esm/icons/play';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';

interface Backup {
    name: string;
    date: string;
}

interface SchedulerStatus {
    running: boolean;
    nextRun: string;
}

const BackupPanel = () => {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fetchBackups = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await axios.get('http://localhost:3000/api/v1/backups', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setBackups(response.data.data || []);
            setScheduler(null);
        } catch (err) {
            console.error('Failed to fetch backups:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchBackups(); }, [fetchBackups]);

    const runBackup = async () => {
        try {
            setRunning(true);
            setMessage(null);
            const token = localStorage.getItem('token');
            const response = await axios.post('http://localhost:3000/api/v1/backups', {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data?.success) {
                setMessage({ type: 'success', text: 'Backup completado exitosamente' });
                fetchBackups();
            }
        } catch (err: unknown) {
            let errorMsg = 'Error al crear el backup';
            if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
                errorMsg = err.response.data.error.message;
            }
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setRunning(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="panel-tech rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2">
                    <Database size={20} className="text-[color:var(--accent-0)]" />
                    Panel de Respaldos
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchBackups}
                        className="btn-ghost px-2.5 py-2"
                        title="Actualizar"
                    >
                        <RefreshCw size={18} />
                    </button>
                    <button
                        onClick={runBackup}
                        disabled={running}
                        className="btn-tech px-4 py-2 disabled:opacity-50 w-auto flex items-center justify-center gap-2"
                    >
                        {running ? (
                            <>
                                <RefreshCw size={16} className="animate-spin" />
                                Creando...
                            </>
                        ) : (
                            <>
                                <Play size={16} />
                                Ejecutar Backup
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Scheduler Status */}
            {scheduler && (
                <div className="bg-[color:var(--surface-2)] rounded-lg p-3 mb-4 flex items-center justify-between border border-[color:var(--border-1)]">
                    <div className="flex items-center gap-2">
                        <Clock size={16} className="text-[color:var(--text-3)]" />
                        <span className="text-sm text-[color:var(--text-2)]">Próximo backup automático:</span>
                        <span className="text-sm font-medium text-[color:var(--text-1)]">{scheduler.nextRun}</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs border ${scheduler.running ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]' : 'border-[color:var(--border-1)] text-[color:var(--text-3)]'}`}>
                        {scheduler.running ? 'Programado' : 'Detenido'}
                    </span>
                </div>
            )}

            {/* Message */}
            {message && (
                <div className={`p-3 rounded-lg mb-4 flex items-center gap-2 border ${message.type === 'success' ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]' : 'border-red-400 text-red-300'} bg-[color:var(--surface-2)]`}>
                    {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    {message.text}
                </div>
            )}

            {/* Backups List */}
            {loading ? (
                <div className="text-center py-8 text-[color:var(--text-3)]">Cargando backups...</div>
            ) : backups.length === 0 ? (
                <div className="text-center py-8 text-[color:var(--text-3)]">
                    <FolderOpen size={40} className="mx-auto mb-2 opacity-50" />
                    No hay backups disponibles
                </div>
            ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {backups.map((backup, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)] hover:border-[color:var(--accent-2)] transition-colors">
                            <div className="flex items-center gap-3">
                                <FolderOpen size={18} className="text-[color:var(--accent-0)]" />
                                <div>
                                    <div className="font-medium text-[color:var(--text-1)]">{backup.name}</div>
                                    <div className="text-xs text-[color:var(--text-3)]">Creado: {formatDate(backup.date)}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BackupPanel;
