'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, Search, Pencil, Trash2, Eye, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { platformApi } from '../api/platformApi';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { TableSkeleton } from './ui/Skeleton';
import { ErrorState, EmptyState } from './ui/States';
import type { Tenant, TenantInput } from '../types';

const emptyForm: TenantInput = {
  name: '',
  slug: '',
  plan: 'free',
  status: 'active',
};

export function Tenants() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantInput>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<Tenant | null>(null);
  const navigate = useRouter();
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading, isError, refetch } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: () => platformApi.listTenants(),
  });

  const createMutation = useMutation({
    mutationFn: (input: TenantInput) =>
      platformApi.createTenant({
        name: input.name,
        slug: input.slug,
        plan: input.plan,
        isDemo: input.status === 'demo',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      toast.success('Tenant created successfully.');
      setShowModal(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create tenant.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TenantInput }) =>
      platformApi.updateTenant(id, {
        name: input.name,
        slug: input.slug,
        plan: input.plan,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      toast.success('Tenant updated successfully.');
      setShowModal(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update tenant.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => platformApi.deleteTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      toast.success('Tenant deleted.');
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete tenant.'),
  });

  const filtered = tenants.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPlan = planFilter === 'all' || t.plan === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant);
    setForm({ name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, input: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Tenants</h2>
          <p className="text-sm text-[var(--text-3)]">Manage all organizations on the platform</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          New Tenant
        </Button>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search by name or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-tech pl-9"
              aria-label="Search tenants"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-tech w-auto"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="trial">Trial</option>
          </select>
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
          <ErrorState message="Failed to load tenants." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No tenants found"
            description="Try adjusting your filters or create a new tenant."
            action={
              <Button onClick={openCreate}>
                <Plus size={16} />
                New Tenant
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-tech">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Users</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-[var(--surface-1)]">
                    <td className="font-medium text-[var(--text-1)]">{tenant.name}</td>
                    <td className="text-[var(--text-2)] font-mono text-sm">{tenant.slug}</td>
                    <td><Badge plan={tenant.plan} /></td>
                    <td><Badge status={tenant.status} /></td>
                    <td className="text-[var(--text-2)]">{tenant.userCount}</td>
                    <td className="text-[var(--text-3)]">
                      {format(parseISO(tenant.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate.push(`/tenants/${tenant.id}`)}
                          className="rounded p-1.5 text-[var(--text-3)] hover:text-[var(--accent-0)] hover:bg-[var(--surface-2)]"
                          aria-label={`View ${tenant.name}`}
                          title="View"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openEdit(tenant)}
                          className="rounded p-1.5 text-[var(--text-3)] hover:text-blue-400 hover:bg-[var(--surface-2)]"
                          aria-label={`Edit ${tenant.name}`}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(tenant)}
                          className="rounded p-1.5 text-[var(--text-3)] hover:text-red-400 hover:bg-[var(--surface-2)]"
                          aria-label={`Delete ${tenant.name}`}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} aria-hidden="true" />
          <div className="relative w-full max-w-md panel-tech rounded-2xl p-6 animate-slideUp">
            <h3 className="mb-4 font-display text-xl font-bold text-[var(--text-1)]">
              {editing ? 'Edit Tenant' : 'New Tenant'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Corp"
                required
              />
              <Input
                label="Slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="acme-corp"
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Plan</label>
                  <select
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value as TenantInput['plan'] })}
                    className="input-tech"
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="demo">Demo</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as TenantInput['status'] })}
                    className="input-tech"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="trial">Trial</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  {editing ? 'Save changes' : 'Create tenant'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete tenant"
        message={`Are you sure you want to delete "${confirmDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
