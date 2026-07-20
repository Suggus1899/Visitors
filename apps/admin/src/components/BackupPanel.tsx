import { useState, useEffect, useCallback } from 'react';
import { api } from '@logmaster/api';
import Database from 'lucide-react/dist/esm/icons/database';
import Clock from 'lucide-react/dist/esm/icons/clock';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import Play from 'lucide-react/dist/esm/icons/play';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Lock from 'lucide-react/dist/esm/icons/lock';

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
    
    // Restore modal state
    const [restoreModal, setRestoreModal] = useState<{ open: boolean; backupName: string; password: string }>({ 
        open: false, 
        backupName: '', 
        password: '' 
    });
    const [restoring, setRestoring] = useState(false);

    const fetchBackups = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/backups');
            setBackups(response.data.data || []);
            setScheduler(null);
        } catch {
            // handled silently; user sees empty state
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchBackups(); }, [fetchBackups]);

    const runBackup = async () => {
        try {
            setRunning(true);
            setMessage(null);
            const response = await api.post('/backups', {});

            if (response.data?.success) {
                setMessage({ 
                    type: 'success', 
                    text: 'Backup completado exitosamente.' 
                });
                fetchBackups();
            }
        } catch (err: unknown) {
            let errorMsg = 'Error al crear el backup';
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
                if (axiosErr.response?.data?.error?.message) errorMsg = axiosErr.response.data.error.message;
            }
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setRunning(false);
        }
    };

    const openRestoreModal = (backupName: string) => {
        setRestoreModal({ open: true, backupName, password: '' });
    };

    const closeRestoreModal = () => {
        setRestoreModal({ open: false, backupName: '', password: '' });
    };

    const handleRestore = async () => {
        if (!restoreModal.password.trim()) {
            setMessage({ type: 'error', text: 'Ingrese la contraseña de restauración' });
            return;
        }

        try {
            setRestoring(true);
            setMessage(null);
            
            const response = await api.post(
                `/backups/${encodeURIComponent(restoreModal.backupName)}/restore`,
                { restorePassword: restoreModal.password }
            );

            if (response.data?.success) {
                setMessage({ type: 'success', text: 'Backup restaurado exitosamente. La página se recargará...' });
                closeRestoreModal();
                setTimeout(() => window.location.reload(), 2000);
            }
        } catch (err: unknown) {
            let errorMsg = 'Error al restaurar el backup';
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosErr = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
                if (axiosErr.response?.data?.error?.message) errorMsg = axiosErr.response.data.error.message;
                if (axiosErr.response?.status === 401) errorMsg = 'Contraseña de restauración incorrecta';
            }
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setRestoring(false);
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

            {/* Restore Modal */}
            {restoreModal.open && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[color:var(--surface-0)] rounded-lg p-6 max-w-md w-full mx-4 border border-[color:var(--border-1)]">
                        <div className="flex items-center gap-2 mb-4 text-amber-400">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-semibold">Restaurar Backup</h3>
                        </div>
                        
                        <p className="text-[color:var(--text-2)] mb-4 text-sm">
                            Está a punto de restaurar: <strong>{restoreModal.backupName}</strong>
                        </p>
                        
                        <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-3 mb-4">
                            <p className="text-red-300 text-sm">
                                <strong>Advertencia:</strong> Esto sobrescribirá toda la base de datos actual. 
                                Los datos actuales se perderán.
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-[color:var(--text-2)] mb-2">
                                <Lock size={14} className="inline mr-1" />
                                Contraseña de restauración (formato: trebol-XXXX-XXXX)
                            </label>
                            <input
                                type="text"
                                value={restoreModal.password}
                                onChange={(e) => setRestoreModal({ ...restoreModal, password: e.target.value })}
                                placeholder="trebol-..."
                                className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                            />
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={closeRestoreModal}
                                className="btn-ghost px-4 py-2"
                                disabled={restoring}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRestore}
                                disabled={restoring || !restoreModal.password.trim()}
                                className="btn-tech px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50"
                            >
                                {restoring ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin mr-1" />
                                        Restaurando...
                                    </>
                                ) : (
                                    <>
                                        <RotateCcw size={16} className="mr-1" />
                                        Restaurar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
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
                            <button
                                onClick={() => openRestoreModal(backup.name)}
                                className="btn-ghost px-3 py-1.5 text-sm flex items-center gap-1.5 hover:text-[color:var(--accent-0)]"
                                title="Restaurar este backup"
                            >
                                <RotateCcw size={14} />
                                Restaurar
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BackupPanel;
