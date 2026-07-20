'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@logmaster/auth';
import { api } from '@logmaster/api';
import { useTenant } from '../context/TenantContext';
import { ThemeToggle } from '@logmaster/ui';
import Building from 'lucide-react/dist/esm/icons/building';
import UserIcon from 'lucide-react/dist/esm/icons/user';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import Key from 'lucide-react/dist/esm/icons/key';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import Menu from 'lucide-react/dist/esm/icons/menu';
import Keyboard from 'lucide-react/dist/esm/icons/keyboard';

interface TopBarProps {
    onToggleSidebar: () => void;
    onShowShortcuts: () => void;
    onShowPasswordChange: () => void;
}

const TopBar = ({ onToggleSidebar, onShowShortcuts, onShowPasswordChange }: TopBarProps) => {
    const { user, logout } = useAuth();
    const { tenant } = useTenant();
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleLogout = async () => {
        // Call the backend logout endpoint so the httpOnly access cookie is
        // cleared (client-side JS cannot clear httpOnly cookies).
        try {
            await api.post('/auth/logout');
        } catch {
            // Ignore network errors — proceed with local logout below.
        }
        logout();
        router.push('/login');
    };

    return (
        <header className="bg-[color:var(--surface-1)] border-b border-[color:var(--border-1)] sticky top-0 z-20">
            <div className="flex items-center justify-between px-4 py-3">
                {/* Left: mobile menu toggle + tenant name */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onToggleSidebar}
                        className="md:hidden p-2 text-[color:var(--text-2)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)] rounded-lg transition-colors"
                        aria-label="Toggle sidebar"
                    >
                        <Menu size={20} />
                    </button>

                    {tenant && (
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-[color:var(--surface-2)] border border-[color:var(--border-1)]">
                                <Building size={16} className="text-[color:var(--accent-0)]" />
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-sm font-semibold text-[color:var(--text-1)]">{tenant.name}</p>
                                <p className="text-[10px] text-[color:var(--text-3)] uppercase tracking-wider">
                                    {tenant.plan} plan
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onShowShortcuts}
                        className="p-2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] rounded-full hover:bg-[color:var(--surface-2)] transition-colors"
                        aria-label="Keyboard shortcuts"
                        title="Keyboard shortcuts (?)"
                    >
                        <Keyboard size={18} />
                    </button>

                    <ThemeToggle />

                    {/* User menu */}
                    <div ref={menuRef} className="relative">
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[color:var(--surface-2)] transition-colors"
                            aria-label="User menu"
                            aria-expanded={menuOpen}
                        >
                            <div className="w-8 h-8 rounded-full bg-[color:var(--accent-0)]/20 border border-[color:var(--accent-0)]/30 flex items-center justify-center">
                                <UserIcon size={16} className="text-[color:var(--accent-0)]" />
                            </div>
                            <span className="text-sm font-medium text-[color:var(--text-1)] hidden sm:block">
                                {user?.username}
                            </span>
                            <ChevronDown size={16} className="text-[color:var(--text-3)]" />
                        </button>

                        {menuOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-[color:var(--surface-1)] border border-[color:var(--border-1)] rounded-xl shadow-xl py-2 animate-slideUp z-50">
                                <div className="px-4 py-2 border-b border-[color:var(--border-1)]">
                                    <p className="text-sm font-semibold text-[color:var(--text-1)]">{user?.username}</p>
                                    <p className="text-xs text-[color:var(--text-3)] capitalize">{user?.role}</p>
                                </div>

                                <button
                                    onClick={() => {
                                        setMenuOpen(false);
                                        onShowPasswordChange();
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text-1)] transition-colors"
                                >
                                    <Key size={16} /> Change Password
                                </button>

                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <LogOut size={16} /> Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default TopBar;
