import React from 'react';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import LogIn from 'lucide-react/dist/esm/icons/log-in';
import Clock from 'lucide-react/dist/esm/icons/clock';
import { IntermittentLog } from '../types';

interface IntermittentAccessLogProps {
    logs: IntermittentLog[];
}

/** Format a datetime string to a short locale time string (HH:MM) */
const formatTime = (dt: string) =>
    new Date(dt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Format a datetime string to a short locale date string */
const formatDate = (dt: string) =>
    new Date(dt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

/** Compute duration between two ISO strings and return a human-readable string */
const durationLabel = (start: string, end: string | null | undefined): string => {
    if (!end) return '';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 0) return '';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

/**
 * IntermittentAccessLog — renders a timeline of temporary exit/re-entry
 * events for a given visit in ascending chronological order.
 *
 * Positioned adjacent to the main visit details (rendered conditionally
 * when `logs` is non-empty).
 */
const IntermittentAccessLog: React.FC<IntermittentAccessLogProps> = ({ logs }) => {
    if (!logs || logs.length === 0) return null;

    // Sort ascending by check_out
    const sorted = [...logs].sort(
        (a, b) => new Date(a.check_out).getTime() - new Date(b.check_out).getTime()
    );

    return (
        <div className="mt-4 bg-[color:var(--surface-2)] rounded-xl border border-[color:var(--border-1)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[color:var(--border-1)] bg-[color:var(--surface-1)]">
                <Clock size={14} className="text-[color:var(--accent-0)]" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-2)]">
                    Registro de Accesos Intermitentes
                </span>
                <span className="ml-auto text-xs text-[color:var(--text-3)] bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-full px-2 py-0.5">
                    {sorted.length} evento{sorted.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Timeline */}
            <div className="px-4 py-3 space-y-0 relative">
                {/* Vertical connector line */}
                <div className="absolute left-[2.1rem] top-4 bottom-4 w-px bg-[color:var(--border-1)]" />

                {sorted.map((log, idx) => {
                    const isStillOut = !log.re_entry;
                    const duration = durationLabel(log.check_out, log.re_entry);
                    const showDate = idx === 0 || formatDate(sorted[idx - 1].check_out) !== formatDate(log.check_out);

                    return (
                        <div key={log.id} className="relative pl-10 pb-4 last:pb-0">
                            {/* Date separator */}
                            {showDate && (
                                <p className="text-[10px] text-[color:var(--text-3)] mb-2 -ml-2 font-mono">
                                    {formatDate(log.check_out)}
                                </p>
                            )}

                            {/* Exit row */}
                            <div className="mb-1.5">
                                <div className="absolute left-2 w-4 h-4 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center" style={{ top: showDate ? 28 : 0 }}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <LogOut size={12} className="text-blue-400 shrink-0" />
                                    <span className="text-[color:var(--text-3)]">Salida temporal</span>
                                    <span className="font-mono font-semibold text-blue-400">
                                        {formatTime(log.check_out)}
                                    </span>
                                </div>
                            </div>

                            {/* Re-entry row */}
                            <div className="flex items-center gap-2 text-xs ml-0.5">
                                <LogIn size={12} className={isStillOut ? 'text-[color:var(--text-3)]' : 'text-emerald-400'} />
                                {isStillOut ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-blue-500/50 text-blue-400 bg-blue-600/10">
                                        Aún fuera
                                    </span>
                                ) : (
                                    <>
                                        <span className="text-[color:var(--text-3)]">Reingreso</span>
                                        <span className="font-mono font-semibold text-emerald-300">
                                            {formatTime(log.re_entry!)}
                                        </span>
                                        {duration && (
                                            <span className="text-[color:var(--text-3)] ml-auto font-mono text-[10px]">
                                                {duration} fuera
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Notes */}
                            {log.notes && (
                                <p className="mt-1.5 text-[10px] text-[color:var(--text-3)] italic pl-4 border-l border-[color:var(--border-1)]">
                                    {log.notes}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default IntermittentAccessLog;
