'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Search, Pencil, Trash2, Loader2, ShieldCheck, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { platformApi } from '../api/platformApi';
import { getRoles } from '../api/mockApi';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { TableSkeleton } from './ui/Skeleton';
import { ErrorState, EmptyState } from './ui/States';
import type { PlatformUser, UserRole } from '../types';

export function Users() {
  const [search, setSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState<'all' | 'superadmin' | 'regular'>('all');
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlatformUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'admin' as UserRole, isSuperAdmin: false });
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, isError, refetch } = useQuery<PlatformUser[]>({
    queryKey: ['platform-users', search, adminFilter],
    queryFn: () =>
      platformApi.listPlatformUsers({
        search: search || undefined,
        isSuperAdmin: adminFilter === 'superadmin' ? true : adminFilter === 'regular' ? false : '',
      }),
  });

  const updateMutation = useMutation({
    mutationFn: (dto: { name?: string; email?: string; role?: UserRole; isSuperAdmin?: boolean }) =>
      platformApi.updatePlatformUser(editing!.id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User updated successfully.');
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update user.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => platformApi.deletePlatformUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User deleted.');
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete user.'),
  });

  const openEdit = (user: PlatformUser) => {
    setEditing(user);
    setForm({ name: user.name, email: user.email, role: user.role, isSuperAdmin: user.isSuperAdmin });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    updateMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Users</h2>
        <p className="text-sm text-[var(--text-3)]">All users across every tenant on the platform</p>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-tech pl-9"
              aria-label="Search users"
            />
          </div>
          <select
            value={adminFilter}
            onChange={(e) => setAdminFilter(e.target.value as typeof adminFilter)}
            className="input-tech w-auto"
            aria-label="Filter by admin status"
          >
            <option value="all">All users</option>
            <option value="superadmin">Superadmins only</option>
            <option value="regular">Regular users</option>
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : isError ? (
          <ErrorState message="Failed to load users." onRetry={() => refetch()} />
        ) : users.length === 0 ? (
          <EmptyState title="No users found" description="Try adjusting your search or filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-tech">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Tenant</th>
                  <th>Role</th>
                  <th>Type</th>
                  <th>Last active</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-[var(--surface-1)]">
                    <td className="font-medium text-[var(--text-1)]">{user.name}</td>
                    <td className="text-[var(--text-2)]">{user.email}</td>
                    <td className="text-[var(--text-2)]">{user.tenantName}</td>
                    <td><Badge role={user.role} /></td>
                    <td>
                      {user.isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <ShieldCheck size={14} /> Superadmin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--text-3)]">
                          <Shield size={14} /> Regular
                        </span>
                      )}
                    </td>
                    <td className="text-[var(--text-3)]">
                      {user.lastActiveAt ? format(parseISO(user.lastActiveAt), 'MMM d, yyyy') : 'Never'}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="rounded p-1.5 text-[var(--text-3)] hover:text-blue-400 hover:bg-[var(--surface-2)]"
                          aria-label={`Edit ${user.name}`}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(user)}
                          className="rounded p-1.5 text-[var(--text-3)] hover:text-red-400 hover:bg-[var(--surface-2)]"
                          aria-label={`Delete ${user.name}`}
                          title="Delete"
                          disabled={user.isSuperAdmin}
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

      {editing && (
        <Modal title={`Edit user — ${editing.name}`} isOpen={!!editing} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="input-tech"
              >
                {getRoles().map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isSuperAdmin}
                onChange={(e) => setForm({ ...form, isSuperAdmin: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--border-1)] accent-[var(--accent-0)]"
              />
              <span className="text-sm text-[var(--text-2)]">Grant superadmin privileges</span>
            </label>
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

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete user"
        message={`Are you sure you want to delete "${confirmDelete?.name}" from "${confirmDelete?.tenantName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
