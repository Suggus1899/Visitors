'use client';

import { useState, useCallback } from 'react';
import { useBackupsQuery, useCreateBackupMutation, useRestoreBackupMutation, useDeleteBackupMutation, useAdminApi } from '../services/useAdminQueries';
import { ConfirmDialog, Skeleton } from '@logmaster/ui';
import { useTenant } from '../context/TenantContext';
import { PLAN_LIMITS } from '../types/tenant';
import toast from 'react-hot-toast';
import type { Backup } from '../services/adminApi';

import Database from 'lucide-react/dist/esm/icons/database';
import Clock from 'lucide-react/dist/esm/icons/clock';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import Play from 'lucide-react/dist/esm/icons/play';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import Download from 'lucide-react/dist/esm/icons/download';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Lock from 'lucide-react/dist/esm/icons/lock';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Info from 'lucide-react/dist/esm/icons/info';
import { AuthService } from '@logmaster/api';

const BackupsPage = () => {
    const { tenant } = useTenant();
    const api = useAdminApi();
    const { data: backups = [], isLoading, refetch } = useBackupsQuery();
    const createMutation = useCreateBackupMutation();
    const restoreMutation = useRestoreBackupMutation();
    const deleteMutation = useDeleteBackupMutation();

    const [restoreModal, setRestoreModal] = useState<{ open: boolean; backupName: string; password: string }>({
        open: false,
        backupName: '',
        password: '',
    });
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const planLimits = tenant ? PLAN_LIMITS[tenant.plan] : PLAN_LIMITS.pro;
    const retentionInfo = planLimits.retentionDays === -1 ? 'Unlimited' : `${planLimits.retentionDays} days`;
    const maxBackupsInfo = planLimits.maxBackups === -1 ? 'Unlimited' : planLimits.maxBackups;

    const handleCreate = useCallback(async () => {
        try {
            await createMutation.mutateAsync();
            toast.success('Backup created successfully');
            refetch();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: { message?: string } } } };
            toast.error(error.response?.data?.error?.message || 'Failed to create backup');
        }
    }, [createMutation, refetch]);

    const handleRestore = useCallback(async () => {
        if (!restoreModal.password.trim()) {
            toast.error('Please enter the restore password');
            return;
        }
        try {
            await restoreMutation.mutateAsync({
                backupName: restoreModal.backupName,
                restorePassword: restoreModal.password,
            });
            toast.success('Backup restored successfully. Reloading...');
            setRestoreModal({ open: false, backupName: '', password: '' });
            setTimeout(() => window.location.reload(), 2000);
        } catch (err: unknown) {
            const error = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
            if (error.response?.status === 401) {
                toast.error('Incorrect restore password');
            } else {
                toast.error(error.response?.data?.error?.message || 'Failed to restore backup');
            }
        }
    }, [restoreModal, restoreMutation]);

    const handleDelete = useCallback(async () => {
        if (!deleteTarget) return;
        try {
            await deleteMutation.mutateAsync(deleteTarget);
            toast.success('Backup deleted');
            setDeleteTarget(null);
            refetch();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: { message?: string } } } };
            toast.error(error.response?.data?.error?.message || 'Failed to delete backup');
        }
    }, [deleteTarget, deleteMutation, refetch]);

    const handleDownload = useCallback((backupName: string) => {
        // TODO: Backend download endpoint may need auth token in query params.
        // For now, we open the URL with the current access token.
        const token = AuthService.getAccessToken();
        const url = api.downloadBackupUrl(backupName);
        // Append token as query param for authentication
        const urlWithToken = token ? `${url}?token=${encodeURIComponent(token)}` : url;
        window.open(urlWithToken, '_blank');
        toast('Downloading backup...', { icon: 'ℹ️' });
    }, [api]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Backups</h1>
                    <p className="text-sm text-[color:var(--text-3)] mt-1">Manage database backups and restores</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => refetch()} className="btn-ghost px-3 py-2 text-sm flex items-center gap-1">
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={createMutation.isPending}
                        className="btn-tech px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {createMutation.isPending ? (
                            <><RefreshCw size={16} className="animate-spin" /> Creating...</>
                        ) : (
                            <><Play size={16} /> Create Backup</>
                        )}
                    </button>
                </div>
            </div>

            {/* Retention info */}
            <div className="panel-tech rounded-xl p-4 border-l-2 border-[color:var(--accent-0)]">
                <div className="flex items-center gap-3">
                    <Info size={20} className="text-[color:var(--accent-0)]" />
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-[color:var(--text-1)]">Retention Policy — {tenant?.plan || 'pro'} Plan</h3>
                        <div className="flex gap-6 mt-2 text-sm text-[color:var(--text-2)]">
                            <span>Retention: <strong className="text-[color:var(--text-1)]">{retentionInfo}</strong></span>
                            <span>Max backups: <strong className="text-[color:var(--text-1)]">{maxBackupsInfo}</strong></span>
                            <span>Current: <strong className="text-[color:var(--text-1)]">{backups.length}</strong></span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Backups list */}
            <div className="panel-tech rounded-xl p-5">
                <h3 className="font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2 mb-4">
                    <Database size={20} className="text-[color:var(--accent-0)]" />
                    Available Backups
                </h3>

                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                <Skeleton height={20} />
                            </div>
                        ))}
                    </div>
                ) : backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[color:var(--text-3)]">
                        <FolderOpen size={40} className="mb-3 opacity-30" />
                        <p className="font-medium text-sm">No backups available</p>
                        <p className="text-xs mt-1 opacity-60">Create a backup to get started</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {backups.map((backup: Backup, i: number) => (
                            <div
                                key={i}
                                className="flex items-center justify-between p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)] hover:border-[color:var(--accent-2)] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <FolderOpen size={18} className="text-[color:var(--accent-0)]" />
                                    <div>
                                        <div className="font-medium text-[color:var(--text-1)]">{backup.name}</div>
                                        <div className="text-xs text-[color:var(--text-3)] flex items-center gap-1">
                                            <Clock size={12} />
                                            {formatDate(backup.date)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleDownload(backup.name)}
                                        className="p-1.5 rounded text-[color:var(--accent-0)] hover:bg-[color:var(--accent-0)]/10 transition-colors"
                                        title="Download"
                                        aria-label="Download backup"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <button
                                        onClick={() => setRestoreModal({ open: true, backupName: backup.name, password: '' })}
                                        className="p-1.5 rounded text-amber-400 hover:bg-amber-500/10 transition-colors"
                                        title="Restore"
                                        aria-label="Restore backup"
                                    >
                                        <RotateCcw size={16} />
                                    </button>
                                    <button
                                        onClick={() => setDeleteTarget(backup.name)}
                                        disabled={deleteMutation.isPending}
                                        className="p-1.5 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                                        title="Delete"
                                        aria-label="Delete backup"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Restore modal */}
            {restoreModal.open && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setRestoreModal({ open: false, backupName: '', password: '' })}
                >
                    <div
                        className="panel-tech rounded-2xl max-w-md w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-4 text-amber-400">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-semibold">Restore Backup</h3>
                        </div>

                        <p className="text-[color:var(--text-2)] mb-4 text-sm">
                            You are about to restore: <strong>{restoreModal.backupName}</strong>
                        </p>

                        <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-3 mb-4">
                            <p className="text-red-300 text-sm">
                                <strong>Warning:</strong> This will overwrite the entire current database.
                                All current data will be lost.
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-[color:var(--text-2)] mb-2">
                                <Lock size={14} className="inline mr-1" />
                                Restore password
                            </label>
                            <input
                                type="text"
                                value={restoreModal.password}
                                onChange={(e) => setRestoreModal({ ...restoreModal, password: e.target.value })}
                                placeholder="trebol-..."
                                className="input-tech w-full"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setRestoreModal({ open: false, backupName: '', password: '' })}
                                className="btn-ghost px-4 py-2"
                                disabled={restoreMutation.isPending}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRestore}
                                disabled={restoreMutation.isPending || !restoreModal.password.trim()}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {restoreMutation.isPending ? (
                                    <><RefreshCw size={16} className="animate-spin" /> Restoring...</>
                                ) : (
                                    <><RotateCcw size={16} /> Restore</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            <ConfirmDialog
                isOpen={!!deleteTarget}
                title="Delete Backup"
                message={`Are you sure you want to delete backup "${deleteTarget}"? This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
};

export default BackupsPage;
