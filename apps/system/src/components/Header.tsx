import { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import LogOut from 'lucide-react/dist/esm/icons/log-out';

interface HeaderProps {
    user?: { username: string } | null;
    logout?: () => void;
    title?: string;
    children?: ReactNode;
    className?: string;
}

export const Header = ({ 
    user, 
    logout, 
    title = "Control de Acceso", 
    children,
    className = ""
}: HeaderProps) => {
    return (
        <header className={`bg-[color:var(--surface-1)] text-[color:var(--text-1)] border-b border-[color:var(--border-1)] shadow-[0_12px_28px_-22px_rgba(0,0,0,0.9)] sticky top-0 z-20 transition-all ${className}`}>
            <div className="container mx-auto px-4 py-3 flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-3">
                    <img src="./logo.png" alt="Logo" className="h-10 w-auto bg-[color:var(--surface-2)] rounded-md p-1.5 border border-[color:var(--border-1)]" />
                    <h1 className="text-xl font-display tracking-[0.18em] uppercase hidden md:block">{title}</h1>
                </div>
                
                <div className="flex items-center space-x-3">
                    {/* Theme Toggle First */}
                    <ThemeToggle />
                    
                    {/* User Greeting */}
                    {user && (
                        <span className="text-sm text-[color:var(--text-3)] capitalize hidden sm:block mr-2">
                            Hola, <span className="font-semibold text-[color:var(--text-1)]">{user.username}</span>
                        </span>
                    )}

                    {/* Custom Actions (Buttons) */}
                    {children}

                    {/* Logout Button (if provided) */}
                    {logout && (
                        <button
                            data-tour="logout-btn"
                            onClick={logout}
                            className="p-2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] rounded-full hover:bg-[color:var(--surface-2)] transition-colors ml-1"
                            title="Cerrar sesión"
                        >
                            <LogOut size={18} />
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};
