import { useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '@logmaster/auth';
import Building from 'lucide-react/dist/esm/icons/building';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import LogOut from 'lucide-react/dist/esm/icons/log-out';

const TenantSelector = () => {
    const { tenants, selectTenant, loadingTenants } = useTenant();
    const { logout } = useAuth();
    const navigate = useNavigate();

    const handleSelect = (slug: string) => {
        selectTenant(slug);
        navigate('/');
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    if (loadingTenants) {
        return (
            <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-blueprint opacity-40" />
                <div className="absolute inset-0 bg-noise opacity-25 mix-blend-soft-light" />
                <div className="relative z-10">
                    <div className="animate-spin w-8 h-8 border-4 border-[color:var(--accent-0)] border-t-transparent rounded-full mx-auto" />
                    <p className="text-[color:var(--text-3)] text-sm mt-4 text-center">Loading tenants...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-40" />
            <div className="absolute inset-0 bg-noise opacity-25 mix-blend-soft-light" />
            <div className="absolute -top-28 -left-28 h-72 w-72 rounded-full bg-[color:var(--accent-2)] opacity-25 blur-3xl" />
            <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[color:var(--accent-0)] opacity-20 blur-3xl" />

            <div className="relative w-full max-w-lg z-10">
                <div className="panel-tech rounded-2xl p-8 animate-slideUp overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-[color:var(--accent-0)]" />

                    <div className="flex flex-col items-center mb-8">
                        <div className="p-3 mb-4 rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                            <Building size={32} className="text-[color:var(--accent-0)]" />
                        </div>
                        <h2 className="text-2xl font-display font-semibold text-[color:var(--text-1)]">Select Tenant</h2>
                        <p className="text-[color:var(--text-2)] text-xs uppercase tracking-[0.2em] mt-2">
                            Choose the organization to manage
                        </p>
                    </div>

                    {tenants.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-[color:var(--text-3)] text-sm mb-4">
                                No tenants available. Please contact your administrator.
                            </p>
                            <button onClick={handleLogout} className="btn-ghost px-6 py-2 flex items-center gap-2 mx-auto">
                                <LogOut size={16} /> Logout
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {tenants.map((membership) => (
                                    <button
                                        key={membership.tenant.slug}
                                        onClick={() => handleSelect(membership.tenant.slug)}
                                        className="w-full flex items-center justify-between p-4 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-xl hover:border-[color:var(--accent-0)] transition-colors group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--border-1)]">
                                                <Building size={20} className="text-[color:var(--accent-0)]" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-semibold text-[color:var(--text-1)]">
                                                    {membership.tenant.name}
                                                </p>
                                                <p className="text-xs text-[color:var(--text-3)]">
                                                    {membership.tenant.slug} · {membership.role}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight
                                            size={20}
                                            className="text-[color:var(--text-3)] group-hover:text-[color:var(--accent-0)] transition-colors"
                                        />
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={handleLogout}
                                className="w-full mt-6 btn-ghost py-2.5 flex items-center justify-center gap-2 text-sm"
                            >
                                <LogOut size={16} /> Logout
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TenantSelector;
