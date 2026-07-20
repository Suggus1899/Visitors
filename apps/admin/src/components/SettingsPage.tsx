import { useState, useCallback } from 'react';
import { useAuth } from '@logmaster/auth';
import { useTenant } from '../context/TenantContext';
import { useTenantUsersQuery, useInviteUserMutation, useUpdateUserRoleMutation, useRemoveUserMutation, useUpdateTenantMutation } from '../services/useAdminQueries';
import { ConfirmDialog, ThemeToggle, PasswordChangeModal } from '@logmaster/ui';
import { PLAN_LIMITS } from '../types/tenant';
import type { TenantUser } from '../types/tenant';
import toast from 'react-hot-toast';

import Building from 'lucide-react/dist/esm/icons/building';
import Users from 'lucide-react/dist/esm/icons/users';
import CreditCard from 'lucide-react/dist/esm/icons/credit-card';
import Key from 'lucide-react/dist/esm/icons/key';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Save from 'lucide-react/dist/esm/icons/save';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

type Tab = 'profile' | 'users' | 'subscription' | 'security';

const SettingsPage = () => {
    const { user } = useAuth();
    const { tenant } = useTenant();
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [removeTarget, setRemoveTarget] = useState<TenantUser | null>(null);

    // Profile form
    const [tenantName, setTenantName] = useState(tenant?.name || '');
    const [savingProfile, setSavingProfile] = useState(false);

    // Invite form
    const [inviteUsername, setInviteUsername] = useState('');
    const [inviteRole, setInviteRole] = useState('operador');
    const [inviting, setInviting] = useState(false);

    const { data: tenantUsers = [], refetch: refetchUsers } = useTenantUsersQuery();
    const inviteMutation = useInviteUserMutation();
    const updateRoleMutation = useUpdateUserRoleMutation();
    const removeMutation = useRemoveUserMutation();
    const updateTenantMutation = useUpdateTenantMutation();

    const planLimits = tenant ? PLAN_LIMITS[tenant.plan] : PLAN_LIMITS.pro;

    const handleSaveProfile = useCallback(async () => {
        if (!tenantName.trim()) {
            toast.error('Tenant name cannot be empty');
            return;
        }
        setSavingProfile(true);
        try {
            await updateTenantMutation.mutateAsync({ name: tenantName });
            toast.success('Tenant profile updated');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: { message?: string } } } };
            toast.error(error.response?.data?.error?.message || 'Failed to update profile');
        } finally {
            setSavingProfile(false);
        }
    }, [tenantName, updateTenantMutation]);

    const handleInvite = useCallback(async () => {
        if (!inviteUsername.trim()) {
            toast.error('Please enter a username');
            return;
        }
        setInviting(true);
        try {
            await inviteMutation.mutateAsync({ username: inviteUsername, role: inviteRole });
            toast.success(`Invitation sent to ${inviteUsername}`);
            setInviteUsername('');
            refetchUsers();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: { message?: string } } } };
            toast.error(error.response?.data?.error?.message || 'Failed to invite user');
        } finally {
            setInviting(false);
        }
    }, [inviteUsername, inviteRole, inviteMutation, refetchUsers]);

    const handleRoleChange = useCallback(async (userId: number, role: string) => {
        try {
            await updateRoleMutation.mutateAsync({ userId, role });
            toast.success('User role updated');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: { message?: string } } } };
            toast.error(error.response?.data?.error?.message || 'Failed to update role');
        }
    }, [updateRoleMutation]);

    const handleRemoveUser = useCallback(async () => {
        if (!removeTarget) return;
        try {
            await removeMutation.mutateAsync(removeTarget.id);
            toast.success('User removed');
            setRemoveTarget(null);
            refetchUsers();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: { message?: string } } } };
            toast.error(error.response?.data?.error?.message || 'Failed to remove user');
        }
    }, [removeTarget, removeMutation, refetchUsers]);

    const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'profile', label: 'Tenant Profile', icon: Building },
        { id: 'users', label: 'User Management', icon: Users },
        { id: 'subscription', label: 'Subscription', icon: CreditCard },
        { id: 'security', label: 'Security', icon: Key },
    ];

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">Configuración</h1>
                <p className="text-sm text-[color:var(--text-3)] mt-1">Manage tenant settings and users</p>
            </div>

            {/* Tab navigation */}
            <div className="flex space-x-1 border-b border-[color:var(--border-1)] overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 whitespace-nowrap ${
                            activeTab === tab.id
                                ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]'
                                : 'border-transparent text-[color:var(--text-3)] hover:text-[color:var(--text-1)]'
                        }`}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Profile tab */}
            {activeTab === 'profile' && (
                <div className="panel-tech rounded-xl p-6 space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-[color:var(--text-1)] mb-4">Tenant Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                                    Organization Name
                                </label>
                                <input
                                    type="text"
                                    value={tenantName}
                                    onChange={(e) => setTenantName(e.target.value)}
                                    className="input-tech text-sm"
                                    placeholder="Organization name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                                    Slug
                                </label>
                                <input
                                    type="text"
                                    value={tenant?.slug || ''}
                                    disabled
                                    className="input-tech text-sm opacity-60"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                                    Plan
                                </label>
                                <input
                                    type="text"
                                    value={tenant?.plan || ''}
                                    disabled
                                    className="input-tech text-sm opacity-60 capitalize"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                                    Created
                                </label>
                                <input
                                    type="text"
                                    value={tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : '—'}
                                    disabled
                                    className="input-tech text-sm opacity-60"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleSaveProfile}
                            disabled={savingProfile}
                            className="btn-tech px-6 py-2 text-sm flex items-center gap-2 mt-4 disabled:opacity-50"
                        >
                            {savingProfile ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            Save Changes
                        </button>
                    </div>

                    <div className="border-t border-[color:var(--border-1)] pt-6">
                        <h3 className="text-sm font-semibold text-[color:var(--text-1)] mb-4">Appearance</h3>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-[color:var(--text-2)]">Theme</p>
                                <p className="text-xs text-[color:var(--text-3)]">Toggle between light and dark mode</p>
                            </div>
                            <ThemeToggle />
                        </div>
                    </div>
                </div>
            )}

            {/* Users tab */}
            {activeTab === 'users' && (
                <div className="space-y-6">
                    {/* Invite user */}
                    <div className="panel-tech rounded-xl p-6">
                        <h3 className="text-sm font-semibold text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                            <UserPlus size={18} className="text-[color:var(--accent-0)]" />
                            Invite User
                        </h3>
                        <div className="flex flex-wrap gap-3 items-end">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs text-[color:var(--text-3)] mb-1">Username</label>
                                <input
                                    type="text"
                                    value={inviteUsername}
                                    onChange={(e) => setInviteUsername(e.target.value)}
                                    className="input-tech text-sm"
                                    placeholder="Enter username"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[color:var(--text-3)] mb-1">Role</label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className="input-tech text-sm"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="operador">Operador</option>
                                    <option value="auditor">Auditor</option>
                                </select>
                            </div>
                            <button
                                onClick={handleInvite}
                                disabled={inviting}
                                className="btn-tech px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
                            >
                                {inviting ? <RefreshCw size={16} className="animate-spin" /> : <UserPlus size={16} />}
                                Invite
                            </button>
                        </div>
                        <p className="text-xs text-[color:var(--text-3)] mt-3">
                            TODO: User invitation requires backend endpoint POST /v1/:tenantSlug/users/invite
                        </p>
                    </div>

                    {/* Users list */}
                    <div className="panel-tech rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-[color:var(--border-1)]">
                            <h3 className="text-sm font-semibold text-[color:var(--text-1)]">Users in this Tenant</h3>
                        </div>
                        {tenantUsers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-[color:var(--text-3)]">
                                <Users size={32} className="mb-2 opacity-30" />
                                <p className="text-sm">No users found</p>
                                <p className="text-xs mt-1 opacity-60">
                                    TODO: Backend endpoint GET /v1/:tenantSlug/users not yet implemented
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] uppercase text-xs">
                                            <th className="text-left p-4 font-semibold">Username</th>
                                            <th className="text-left p-4 font-semibold">Role</th>
                                            <th className="text-left p-4 font-semibold">Last Login</th>
                                            <th className="text-left p-4 font-semibold">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tenantUsers.map((u: TenantUser) => (
                                            <tr key={u.id} className="hover:bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] last:border-0">
                                                <td className="p-4 font-medium text-[color:var(--text-1)]">{u.username}</td>
                                                <td className="p-4">
                                                    <select
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                        className="input-tech text-sm py-1"
                                                    >
                                                        <option value="admin">Admin</option>
                                                        <option value="operador">Operador</option>
                                                        <option value="auditor">Auditor</option>
                                                    </select>
                                                </td>
                                                <td className="p-4 text-[color:var(--text-3)] text-xs">
                                                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                                                </td>
                                                <td className="p-4">
                                                    <button
                                                        onClick={() => setRemoveTarget(u)}
                                                        className="p-1.5 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                                                        title="Remove user"
                                                        aria-label="Remove user"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Subscription tab */}
            {activeTab === 'subscription' && (
                <div className="panel-tech rounded-xl p-6 space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                            <CreditCard size={18} className="text-[color:var(--accent-0)]" />
                            Subscription Details
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-1)]">
                                <p className="text-xs text-[color:var(--text-3)] uppercase tracking-wider">Current Plan</p>
                                <p className="text-2xl font-bold text-[color:var(--text-1)] capitalize mt-1">{tenant?.plan || '—'}</p>
                            </div>
                            <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-1)]">
                                <p className="text-xs text-[color:var(--text-3)] uppercase tracking-wider">Status</p>
                                <p className="text-2xl font-bold text-emerald-400 mt-1">Active</p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-[color:var(--border-1)] pt-6">
                        <h4 className="text-sm font-semibold text-[color:var(--text-1)] mb-4">Plan Limits</h4>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                <span className="text-sm text-[color:var(--text-2)]">Max Visitors</span>
                                <span className="font-semibold text-[color:var(--text-1)]">
                                    {planLimits.maxVisitors === -1 ? 'Unlimited' : planLimits.maxVisitors.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                <span className="text-sm text-[color:var(--text-2)]">Max Backups</span>
                                <span className="font-semibold text-[color:var(--text-1)]">
                                    {planLimits.maxBackups === -1 ? 'Unlimited' : planLimits.maxBackups}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                <span className="text-sm text-[color:var(--text-2)]">Retention Period</span>
                                <span className="font-semibold text-[color:var(--text-1)]">
                                    {planLimits.retentionDays === -1 ? 'Unlimited' : `${planLimits.retentionDays} days`}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                <span className="text-sm text-[color:var(--text-2)]">Max Users</span>
                                <span className="font-semibold text-[color:var(--text-1)]">
                                    {planLimits.maxUsers === -1 ? 'Unlimited' : planLimits.maxUsers}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-[color:var(--border-1)] pt-6">
                        <p className="text-xs text-[color:var(--text-3)]">
                            TODO: Subscription management requires backend billing integration.
                            Contact support to upgrade or change your plan.
                        </p>
                    </div>
                </div>
            )}

            {/* Security tab */}
            {activeTab === 'security' && (
                <div className="panel-tech rounded-xl p-6 space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                            <Shield size={18} className="text-[color:var(--accent-0)]" />
                            Account Security
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                <div>
                                    <p className="text-sm font-medium text-[color:var(--text-1)]">Current User</p>
                                    <p className="text-xs text-[color:var(--text-3)]">{user?.username} · {user?.role}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                                <div>
                                    <p className="text-sm font-medium text-[color:var(--text-1)]">Change Password</p>
                                    <p className="text-xs text-[color:var(--text-3)]">Update your account password</p>
                                </div>
                                <button
                                    onClick={() => setShowPasswordChange(true)}
                                    className="btn-ghost px-4 py-2 text-sm flex items-center gap-2"
                                >
                                    <Key size={16} /> Change
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Password change modal */}
            <PasswordChangeModal
                show={showPasswordChange}
                onPasswordChanged={() => {
                    setShowPasswordChange(false);
                    toast.success('Password changed successfully');
                }}
            />

            {/* Remove user confirmation */}
            <ConfirmDialog
                isOpen={!!removeTarget}
                title="Remove User"
                message={`Are you sure you want to remove ${removeTarget?.username} from this tenant? They will lose access immediately.`}
                confirmText="Remove"
                variant="danger"
                onConfirm={handleRemoveUser}
                onCancel={() => setRemoveTarget(null)}
            />
        </div>
    );
};

export default SettingsPage;
