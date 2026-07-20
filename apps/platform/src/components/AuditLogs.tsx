'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Search, ScrollText, Filter } from 'lucide-react';
import { platformApi } from '../api/platformApi';
import { Card } from './ui/Card';
import { TableSkeleton } from './ui/Skeleton';
import { ErrorState, EmptyState } from './ui/States';
import type { AuditLogEntry } from '../types';

const ACTION_TONES: Record<string, string> = {
  LOGIN: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/15',
  LOGOUT: 'border-slate-500/20 text-slate-300 bg-slate-500/15',
  CREATE: 'border-cyan-500/20 text-cyan-400 bg-cyan-500/15',
  UPDATE: 'border-amber-500/20 text-amber-400 bg-amber-500/15',
  DELETE: 'border-red-500/20 text-red-400 bg-red-500/15',
  SUSPEND: 'border-red-500/20 text-red-400 bg-red-500/15',
  ACTIVATE: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/15',
};

const toneFor = (action: string) => {
  const key = Object.keys(ACTION_TONES).find((k) => action.toUpperCase().includes(k));
  return key ? ACTION_TONES[key] : 'border-[var(--border-1)] text-[var(--text-2)] bg-[var(--surface-2)]';
};

export function AuditLogs() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const { data: logs = [], isLoading, isError, refetch } = useQuery<AuditLogEntry[]>({
    queryKey: ['audit-logs', search, actionFilter],
    queryFn: () =>
      platformApi.listAuditLogs({
        search: search || undefined,
        action: actionFilter === 'all' ? undefined : actionFilter,
      }),
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action))).sort();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Audit Logs</h2>
        <p className="text-sm text-[var(--text-3)]">Platform-wide activity trail across all tenants</p>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search by user, action, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-tech pl-9"
              aria-label="Search audit logs"
            />
          </div>
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="input-tech pl-9 w-auto"
              aria-label="Filter by action"
            >
              <option value="all">All actions</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : isError ? (
          <ErrorState message="Failed to load audit logs." onRetry={() => refetch()} />
        ) : logs.length === 0 ? (
          <EmptyState
            title="No audit logs found"
            description="Try adjusting your search or filters."
            icon={<ScrollText size={28} />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-tech">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>User</th>
                  <th>Tenant</th>
                  <th>Details</th>
                  <th>IP</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--surface-1)]">
                    <td>
                      <span className={`badge-tech border ${toneFor(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="text-[var(--text-2)]">{log.entity}</td>
                    <td className="text-[var(--text-2)]">{log.username}</td>
                    <td className="text-[var(--text-2)]">{log.tenantName ?? '—'}</td>
                    <td className="text-[var(--text-3)] max-w-xs truncate">{log.details ?? '—'}</td>
                    <td className="text-[var(--text-3)] font-mono text-sm">{log.ipAddress ?? '—'}</td>
                    <td className="text-[var(--text-3)] whitespace-nowrap">
                      {format(parseISO(log.createdAt), 'MMM d, yyyy HH:mm')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
