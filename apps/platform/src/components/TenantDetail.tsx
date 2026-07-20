import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users as UsersIcon,
  Activity,
  HardDrive,
  ScrollText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { platformApi } from '../api/platformApi';
import { getRoles } from '../api/mockApi';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Skeleton, TableSkeleton } from './ui/Skeleton';
import { ErrorState, EmptyState } from './ui/States';
import type { TenantUser, UserRole } from '../types';

type Tab = 'users' | 'usage' | 'backups' | 'audit';

const roleOptions = () => getRoles().map((role) => ({ value: role, label: role }));

export function TenantDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('users');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<TenantUser | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'admin' as UserRole });
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data: tenant, isLoading: tenantLoading, isError: tenantError, refetch: refetchTenant } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => platformApi.getTenant(id),
    enabled: !!id,
  });

  const { data: users = [], isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['tenant-users', id],
    queryFn: () => platformApi.listTenantUsers(id),
    enabled: !!id && tab === 'users',
  });

  const { data: usage } = useQuery({
    queryKey: ['tenant-usage', id],
    queryFn: () => platformApi.getTenantUsage(id),
    enabled: !!id && tab === 'usage',
  });

  const { data: backups = [], isLoading: backupsLoading } = useQuery({
    queryKey: ['tenant-backups', id],
    queryFn: () => platformApi.listTenantBackups(id),
    enabled: !!id && tab === 'backups',
  });

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['tenant-audit-logs', id],
    queryFn: () => platformApi.listTenantAuditLogs(id),
    enabled: !!id && tab === 'audit',
  });

  const createUserMutation = useMutation({
    mutationFn: (dto: { name: string; email: string; role: UserRole }) =>
      platformApi.createTenantUser(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users', id] });
      toast.success('User created successfully.');
      setShowUserModal(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create user.'),
  });

  const updateUserMutation = useMutation({
    mutationFn: (dto: { name?: string; email?: string; role?: UserRole }) =>
      platformApi.updateTenantUser(id, editingUser!.id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users', id] });
      toast.success('User updated successfully.');
      setShowUserModal(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update user.'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => platformApi.deleteTenantUser(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users', id] });
      toast.success('User deleted.');
      setConfirmDeleteUser(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete user.'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) => platformApi.resetTenantUserPassword(id, userId),
    onSuccess: (data) => {
      setTempPassword(data.temporaryPassword);
      toast.success('Password reset. Share the temporary password securely.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to reset password.'),
  });

  const suspendMutation = useMutation({
    mutationFn: () => platformApi.suspendTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Tenant suspended.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to suspend tenant.'),
  });

  const activateMutation = useMutation({
    mutationFn: () => platformApi.activateTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Tenant activated.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to activate tenant.'),
  });

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({ name: '', email: '', role: 'admin' });
    setShowUserModal(true);
  };

  const openEditUser = (user: TenantUser) => {
    setEditingUser(user);
    setUserForm({ name: user.name, email: user.email, role: user.role });
    setShowUserModal(true);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      updateUserMutation.mutate(userForm);
    } else {
      createUserMutation.mutate(userForm);
    }
  };

  const isSavingUser = createUserMutation.isPending || updateUserMutation.isPending;

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card><Skeleton rows={4} /></Card>
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/tenants')}>
          <ArrowLeft size={16} /> Back to tenants
        </Button>
        <ErrorState message="Failed to load tenant." onRetry={() => refetchTenant()} />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'users', label: 'Users', icon: UsersIcon },
    { key: 'usage', label: 'Usage', icon: Activity },
    { key: 'backups', label: 'Backups', icon: HardDrive },
    { key: 'audit', label: 'Audit Logs', icon: ScrollText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate('/tenants')}>
          <ArrowLeft size={16} /> Back
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">{tenant.name}</h2>
            <p className="mt-1 font-mono text-sm text-[var(--text-3)]">{tenant.slug}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge plan={tenant.plan} />
              <Badge status={tenant.status} />
              <span className="badge-tech border border-[var(--border-1)] text-[var(--text-3)]">
                {tenant.userCount}/{tenant.maxUsers} users
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {tenant.status === 'suspended' ? (
              <Button variant="ghost" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                {activateMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                Activate
              </Button>
            ) : (
              <Button variant="danger" onClick={() => suspendMutation.mutate()} disabled={suspendMutation.isPending}>
                {suspendMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                Suspend
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[var(--text-3)]">Created</p>
            <p className="font-medium text-[var(--text-1)]">{format(parseISO(tenant.createdAt), 'MMM d, yyyy')}</p>
          </div>
          {tenant.subscriptionExpiresAt && (
            <div>
              <p className="text-[var(--text-3)]">Sub expires</p>
              <p className="font-medium text-[var(--text-1)]">{format(parseISO(tenant.subscriptionExpiresAt), 'MMM d, yyyy')}</p>
            </div>
          )}
          {tenant.demoExpiresAt && (
            <div>
              <p className="text-[var(--text-3)]">Demo expires</p>
              <p className="font-medium text-[var(--text-1)]">{format(parseISO(tenant.demoExpiresAt), 'MMM d, yyyy')}</p>
            </div>
          )}
          <div>
            <p className="text-[var(--text-3)]">Max users</p>
            <p className="font-medium text-[var(--text-1)]">{tenant.maxUsers}</p>
          </div>
        </div>
      </Card>

      <div className="flex gap-1 border-b border-[var(--border-1)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === t.key
                  ? 'border-[var(--accent-0)] text-[var(--accent-0)]'
                  : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'users' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[var(--text-1)]">Users ({users.length})</h3>
            <Button onClick={openCreateUser}>
              <Plus size={16} /> Add user
            </Button>
          </div>
          {usersLoading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : usersError ? (
            <ErrorState message="Failed to load users." onRetry={() => refetchUsers()} />
          ) : users.length === 0 ? (
            <EmptyState title="No users yet" description="Add the first user to this tenant." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-tech">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Last active</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-[var(--surface-1)]">
                      <td className="font-medium text-[var(--text-1)]">{user.name}</td>
                      <td className="text-[var(--text-2)]">{user.email}</td>
                      <td><Badge role={user.role} /></td>
                      <td className="text-[var(--text-3)]">
                        {user.lastActiveAt ? format(parseISO(user.lastActiveAt), 'MMM d, yyyy') : 'Never'}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => resetPasswordMutation.mutate(user.id)}
                            className="rounded p-1.5 text-[var(--text-3)] hover:text-amber-400 hover:bg-[var(--surface-2)]"
                            aria-label={`Reset password for ${user.name}`}
                            title="Reset password"
                          >
                            <KeyRound size={16} />
                          </button>
                          <button
                            onClick={() => openEditUser(user)}
                            className="rounded p-1.5 text-[var(--text-3)] hover:text-blue-400 hover:bg-[var(--surface-2)]"
                            aria-label={`Edit ${user.name}`}
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteUser(user)}
                            className="rounded p-1.5 text-[var(--text-3)] hover:text-red-400 hover:bg-[var(--surface-2)]"
                            aria-label={`Delete ${user.name}`}
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
      )}

      {tab === 'usage' && (
        <Card>
          <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">Usage metrics</h3>
          {usage ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[var(--border-1)] p-4">
                <p className="text-sm text-[var(--text-3)]">Visits</p>
                <p className="mt-1 font-display text-2xl font-bold text-[var(--text-1)]">{usage.visitsCount.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[var(--border-1)] p-4">
                <p className="text-sm text-[var(--text-3)]">Visitors</p>
                <p className="mt-1 font-display text-2xl font-bold text-[var(--text-1)]">{usage.visitorsCount.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[var(--border-1)] p-4">
                <p className="text-sm text-[var(--text-3)]">Users</p>
                <p className="mt-1 font-display text-2xl font-bold text-[var(--text-1)]">{usage.usersCount}/{usage.maxUsers}</p>
              </div>
            </div>
          ) : (
            <Skeleton rows={3} />
          )}
        </Card>
      )}

      {tab === 'backups' && (
        <Card>
          <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">Backups</h3>
          {backupsLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : backups.length === 0 ? (
            <EmptyState title="No backups" description="Backup history will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-tech">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.id}>
                      <td className="font-mono text-sm text-[var(--text-1)]">{backup.fileName}</td>
                      <td className="text-[var(--text-2)]">{backup.size}</td>
                      <td>
                        <span className={`badge-tech border ${
                          backup.status === 'completed'
                            ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/15'
                            : backup.status === 'failed'
                            ? 'border-red-500/20 text-red-400 bg-red-500/15'
                            : 'border-amber-500/20 text-amber-400 bg-amber-500/15'
                        }`}>{backup.status}</span>
                      </td>
                      <td className="text-[var(--text-3)]">{format(parseISO(backup.createdAt), 'MMM d, yyyy HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">Audit logs</h3>
          {auditLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : auditLogs.length === 0 ? (
            <EmptyState title="No audit logs" description="Activity for this tenant will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-tech">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>User</th>
                    <th>Details</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="font-mono text-sm text-[var(--text-1)]">{log.action}</td>
                      <td className="text-[var(--text-2)]">{log.entity}</td>
                      <td className="text-[var(--text-2)]">{log.username}</td>
                      <td className="text-[var(--text-3)] max-w-xs truncate">{log.details}</td>
                      <td className="text-[var(--text-3)]">{format(parseISO(log.createdAt), 'MMM d, yyyy HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {showUserModal && (
        <Modal title={editingUser ? 'Edit user' : 'Add user'} isOpen={showUserModal} onClose={() => setShowUserModal(false)}>
          <form onSubmit={handleUserSubmit} className="space-y-4">
            <Input
              label="Name"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              placeholder="Jane Doe"
              required
            />
            <Input
              label="Email"
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="jane@example.com"
              required
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Role</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                className="input-tech"
              >
                {roleOptions().map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowUserModal(false)}>Cancel</Button>
              <Button type="submit" disabled={isSavingUser}>
                {isSavingUser && <Loader2 size={16} className="animate-spin" />}
                {editingUser ? 'Save changes' : 'Create user'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!confirmDeleteUser}
        title="Delete user"
        message={`Are you sure you want to delete "${confirmDeleteUser?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteUserMutation.isPending}
        onConfirm={() => confirmDeleteUser && deleteUserMutation.mutate(confirmDeleteUser.id)}
        onClose={() => setConfirmDeleteUser(null)}
      />

      <ConfirmDialog
        isOpen={!!tempPassword}
        title="Temporary password"
        message={`Temporary password: ${tempPassword}. Please share it securely with the user.`}
        confirmLabel="Done"
        variant="primary"
        onConfirm={() => setTempPassword(null)}
        onClose={() => setTempPassword(null)}
      />
    </div>
  );
}
