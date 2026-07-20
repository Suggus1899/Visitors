import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@logmaster/auth';
import { useTenant } from '../contexts/TenantContext';
import { ThemeToggle, PasswordChangeModal } from '@logmaster/ui';
import {
    LayoutDashboard,
    Activity,
    FileText,
    ShieldCheck,
    BarChart3,
    UserSearch,
    LogOut,
    Menu,
    X,
    Building2,
    ChevronDown,
    Lock,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

const NAV_ITEMS = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/logs', label: 'Audit Logs', icon: Activity },
    { path: '/arco', label: 'ARCO Requests', icon: FileText },
    { path: '/subjects', label: 'Subject Search', icon: UserSearch },
    { path: '/reports', label: 'Reports', icon: FileText },
    { path: '/compliance', label: 'Compliance', icon: ShieldCheck },
    { path: '/statistics', label: 'Statistics', icon: BarChart3 },
] as const;

interface LayoutProps {
    children: ReactNode;
}

/**
 * Main application layout with a responsive collapsible sidebar,
 * top bar (tenant name, user menu, theme toggle), and content area.
 */
export const Layout = ({ children }: LayoutProps) => {
    const { user, logout } = useAuth();
    const { currentTenant, tenants, selectTenant } = useTenant();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);

    useEffect(() => {
        const handlePasswordChangeRequired = () => setShowPasswordChangeModal(true);
        window.addEventListener('password-change-required', handlePasswordChangeRequired);
        return () => window.removeEventListener('password-change-required', handlePasswordChangeRequired);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    const closeMenus = () => {
        setTenantMenuOpen(false);
        setUserMenuOpen(false);
    };

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-[color:var(--surface-1)] border-r border-[color:var(--border-1)] z-40 transform transition-transform duration-300 flex flex-col ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}
            >
                {/* Sidebar header */}
                <div className="flex items-center justify-between p-4 border-b border-[color:var(--border-1)]">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="text-[color:var(--accent-0)]" size={24} />
                        <span className="font-display uppercase tracking-[0.15em] text-sm text-[color:var(--text-1)]">
                            Auditor
                        </span>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden p-1.5 rounded-lg text-[color:var(--text-3)] hover:bg-[color:var(--surface-2)]"
                        aria-label="Close sidebar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'bg-[color:var(--accent-0)]/10 text-[color:var(--accent-0)] border border-[color:var(--accent-0)]/30'
                                        : 'text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text-1)] border border-transparent'
                                }`
                            }
                        >
                            <item.icon size={18} />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                {/* Read-only badge */}
                <div className="p-3 border-t border-[color:var(--border-1)]">
                    <div className="flex items-center gap-2 text-xs text-[color:var(--text-3)] bg-[color:var(--surface-2)] rounded-lg px-3 py-2 border border-[color:var(--border-1)]">
                        <Lock size={12} />
                        Read-only auditor access
                    </div>
                </div>
            </aside>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="sticky top-0 z-20 bg-[color:var(--surface-1)] border-b border-[color:var(--border-1)] px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-lg text-[color:var(--text-3)] hover:bg-[color:var(--surface-2)]"
                            aria-label="Open sidebar"
                        >
                            <Menu size={20} />
                        </button>

                        {/* Tenant selector dropdown */}
                        {currentTenant && (
                            <div className="relative">
                                <button
                                    onClick={() => {
                                        setTenantMenuOpen(!tenantMenuOpen);
                                        setUserMenuOpen(false);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--border-1)] hover:border-[color:var(--accent-0)]/30 transition-colors text-sm"
                                >
                                    <Building2 size={16} className="text-[color:var(--accent-0)]" />
                                    <span className="text-[color:var(--text-1)] font-medium max-w-[160px] truncate">
                                        {currentTenant.name}
                                    </span>
                                    <ChevronDown size={14} className="text-[color:var(--text-3)]" />
                                </button>
                                {tenantMenuOpen && tenants.length > 1 && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-30"
                                            onClick={closeMenus}
                                        />
                                        <div className="absolute top-full left-0 mt-1 w-56 panel-tech rounded-lg shadow-xl z-40 py-1 animate-slideDown">
                                            {tenants.map((t) => (
                                                <button
                                                    key={t.slug}
                                                    onClick={() => {
                                                        selectTenant(t.slug);
                                                        closeMenus();
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] flex items-center gap-2 ${
                                                        t.slug === currentTenant.slug
                                                            ? 'text-[color:var(--accent-0)]'
                                                            : 'text-[color:var(--text-2)]'
                                                    }`}
                                                >
                                                    <Building2 size={14} />
                                                    {t.name}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />

                        {/* User menu */}
                        {user && (
                            <div className="relative">
                                <button
                                    onClick={() => {
                                        setUserMenuOpen(!userMenuOpen);
                                        setTenantMenuOpen(false);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[color:var(--surface-2)] transition-colors"
                                >
                                    <div className="w-7 h-7 rounded-full bg-[color:var(--accent-0)]/20 flex items-center justify-center text-[color:var(--accent-0)] text-xs font-bold uppercase">
                                        {user.username.slice(0, 2)}
                                    </div>
                                    <span className="text-sm text-[color:var(--text-2)] hidden sm:block">
                                        {user.username}
                                    </span>
                                    <ChevronDown size={14} className="text-[color:var(--text-3)]" />
                                </button>
                                {userMenuOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-30"
                                            onClick={closeMenus}
                                        />
                                        <div className="absolute top-full right-0 mt-1 w-48 panel-tech rounded-lg shadow-xl z-40 py-1 animate-slideDown">
                                            <div className="px-3 py-2 border-b border-[color:var(--border-1)]">
                                                <p className="text-sm font-medium text-[color:var(--text-1)]">
                                                    {user.username}
                                                </p>
                                                <p className="text-xs text-[color:var(--text-3)] uppercase tracking-wider">
                                                    {user.role}
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleLogout}
                                                className="w-full text-left px-3 py-2 text-sm text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] flex items-center gap-2"
                                            >
                                                <LogOut size={14} />
                                                Sign out
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto space-y-6">
                    {children}
                </main>
            </div>

            <PasswordChangeModal
                show={showPasswordChangeModal}
                onPasswordChanged={() => {
                    setShowPasswordChangeModal(false);
                    window.location.reload();
                }}
            />
        </div>
    );
};
