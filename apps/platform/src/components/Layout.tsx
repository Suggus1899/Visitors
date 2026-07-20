import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { usePlatformTheme } from '../context/usePlatformTheme';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tenants', label: 'Tenants', icon: Building2 },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function ThemeToggle() {
  const { theme, toggleTheme } = usePlatformTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-lg p-2 text-[var(--text-2)] hover:text-[var(--accent-0)] hover:bg-[var(--surface-2)] transition"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="hidden w-64 flex-col border-r border-[var(--border-1)] bg-[var(--surface-0)] md:flex">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-0)] to-[var(--accent-1)] text-[#081116]">
          <Shield size={22} />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold leading-tight text-[var(--text-1)]">
            LOGMASTER
          </h1>
          <p className="text-xs font-medium tracking-wide text-[var(--accent-0)]">PLATFORM</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-4 py-4" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="nav-link"
              end={item.to === '/dashboard'}
              onClick={onNavigate}
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border-1)] p-4 text-xs text-[var(--text-3)]">
        v1.0.0 &middot; Superadmin console
      </div>
    </aside>
  );
}

export function Layout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg-0)]">
      <Sidebar />

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-[var(--border-1)] bg-[var(--surface-0)] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <Shield size={22} className="text-[var(--accent-0)]" />
                <span className="font-display font-bold">LOGMASTER</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded p-1 text-[var(--text-3)] hover:text-[var(--text-1)]"
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-4 py-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="nav-link"
                    end={item.to === '/dashboard'}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <Icon size={18} />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border-1)] bg-[var(--surface-0)] px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-[var(--text-2)] hover:bg-[var(--surface-2)]"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <Shield size={20} className="text-[var(--accent-0)]" />
            <span className="font-display font-bold">LOGMASTER</span>
          </div>

          <div className="hidden items-center gap-2 text-sm text-[var(--text-2)] md:flex">
            <BarChart3 size={16} />
            <span>Superadmin workspace</span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden text-sm text-[var(--text-2)] sm:inline">
              {session?.user.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-ghost text-sm"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
