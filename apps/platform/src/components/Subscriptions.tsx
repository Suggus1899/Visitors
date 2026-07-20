'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Search, Pencil, Loader2, DollarSign, TrendingUp, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { platformApi } from '../api/platformApi';
import { PLAN_MRR_MAP } from '../api/mockApi';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { TableSkeleton } from './ui/Skeleton';
import { ErrorState, EmptyState } from './ui/States';
import type { SubscriptionSummary, TenantPlan } from '../types';

const PLAN_LABELS: Record<TenantPlan, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
  demo: 'Demo',
};

export function Subscriptions() {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [editing, setEditing] = useState<SubscriptionSummary | null>(null);
  const [form, setForm] = useState<{ plan: TenantPlan; expiryDate: string }>({
    plan: 'free',
    expiryDate: '',
  });
  const queryClient = useQueryClient();

  const { data: subscriptions = [], isLoading, isError, refetch } = useQuery<SubscriptionSummary[]>({
    queryKey: ['subscriptions'],
    queryFn: () => platformApi.listSubscriptions(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ tenantId, dto }: { tenantId: string; dto: { plan: TenantPlan; expiryDate: string | null } }) =>
      platformApi.updateSubscription(tenantId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      toast.success('Subscription updated successfully.');
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update subscription.'),
  });

  const filtered = subscriptions.filter((s) => {
    const matchesSearch =
      !search ||
      s.tenantName.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase());
    const matchesPlan = planFilter === 'all' || s.plan === planFilter;
    return matchesSearch && matchesPlan;
  });

  const totalMrr = filtered.reduce((sum, s) => sum + s.mrr, 0);
  const activeCount = filtered.filter((s) => s.status === 'active').length;

  const openEdit = (sub: SubscriptionSummary) => {
    setEditing(sub);
    setForm({
      plan: sub.plan,
      expiryDate: sub.expiryDate ? parseISO(sub.expiryDate).toISOString().slice(0, 10) : '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    updateMutation.mutate({
      tenantId: editing.tenantId,
      dto: {
        plan: form.plan,
        expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : null,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Subscriptions</h2>
        <p className="text-sm text-[var(--text-3)]">Manage billing plans and renewal dates</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-3)]">Total MRR</p>
              <p className="mt-1 font-display text-2xl font-bold text-[var(--text-1)]">${totalMrr.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400"><DollarSign size={20} /></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-3)]">Active subs</p>
              <p className="mt-1 font-display text-2xl font-bold text-[var(--text-1)]">{activeCount}</p>
            </div>
            <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-400"><TrendingUp size={20} /></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-3)]">Total tenants</p>
              <p className="mt-1 font-display text-2xl font-bold text-[var(--text-1)]">{filtered.length}</p>
            </div>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400"><Building2 size={20} /></div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search by tenant name or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-tech pl-9"
              aria-label="Search subscriptions"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="input-tech w-auto"
            aria-label="Filter by plan"
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
            <option value="demo">Demo</option>
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : isError ? (
          <ErrorState message="Failed to load subscriptions." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No subscriptions found" description="Try adjusting your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-tech">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>MRR</th>
                  <th>Expiry</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => (
                  <tr key={sub.tenantId} className="hover:bg-[var(--surface-1)]">
                    <td className="font-medium text-[var(--text-1)]">{sub.tenantName}</td>
                    <td><Badge plan={sub.plan} /></td>
                    <td><Badge status={sub.status} /></td>
                    <td className="text-[var(--text-2)]">${sub.mrr}/mo</td>
                    <td className="text-[var(--text-3)]">
                      {sub.expiryDate ? format(parseISO(sub.expiryDate), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => openEdit(sub)}
                        className="rounded p-1.5 text-[var(--text-3)] hover:text-blue-400 hover:bg-[var(--surface-2)]"
                        aria-label={`Edit subscription for ${sub.tenantName}`}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={`Edit subscription — ${editing.tenantName}`} isOpen={!!editing} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Plan</label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value as TenantPlan })}
                className="input-tech"
              >
                {Object.entries(PLAN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label} — ${PLAN_MRR_MAP[value as TenantPlan]}/mo</option>
                ))}
              </select>
            </div>
            <Input
              label="Expiry date"
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
