'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Home from 'lucide-react/dist/esm/icons/home';
import Users from 'lucide-react/dist/esm/icons/users';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import FileSpreadsheet from 'lucide-react/dist/esm/icons/file-spreadsheet';
import Database from 'lucide-react/dist/esm/icons/database';
import Settings from 'lucide-react/dist/esm/icons/settings';
import BarChart from 'lucide-react/dist/esm/icons/bar-chart';
import Activity from 'lucide-react/dist/esm/icons/activity';
import ClipboardList from 'lucide-react/dist/esm/icons/clipboard-list';
import X from 'lucide-react/dist/esm/icons/x';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/visitors', label: 'Visitantes', icon: Users },
    { path: '/visits', label: 'Visitas', icon: ClipboardList },
    { path: '/calendar', label: 'Calendario', icon: Calendar },
    { path: '/reports', label: 'Reportes', icon: FileSpreadsheet },
    { path: '/statistics', label: 'Estadísticas', icon: BarChart },
    { path: '/backups', label: 'Backups', icon: Database },
    { path: '/activity-logs', label: 'Logs de Actividad', icon: Activity },
    { path: '/settings', label: 'Configuración', icon: Settings },
];

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
    const pathname = usePathname();

    const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path));

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 md:hidden"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <nav
                className={`fixed md:sticky top-0 left-0 z-40 w-64 min-h-screen bg-[color:var(--surface-1)] border-r border-[color:var(--border-1)] p-4 transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
                }`}
                aria-label="Main navigation"
            >
                {/* Close button (mobile only) */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 md:hidden p-1.5 rounded-lg text-[color:var(--text-3)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)]"
                    aria-label="Close sidebar"
                >
                    <X size={20} />
                </button>

                <div className="space-y-1 mt-4 md:mt-0">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            href={item.path}
                            onClick={onClose}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                                isActive(item.path)
                                    ? 'bg-[color:var(--surface-2)] text-[color:var(--accent-0)]'
                                    : 'text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text-1)]'
                            }`}
                        >
                            <item.icon size={18} />
                            {item.label}
                        </Link>
                    ))}
                </div>
            </nav>
        </>
    );
};

export default Sidebar;
