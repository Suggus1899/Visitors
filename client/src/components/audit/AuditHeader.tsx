import { Button } from '../ui/button';
import { Switch } from '@heroui/react';
import { ThemeToggle } from '../ThemeToggle';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Download from 'lucide-react/dist/esm/icons/download';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';

interface AuditHeaderProps {
    autoRefresh: boolean;
    setAutoRefresh: (val: boolean) => void;
    handleExport: () => void;
    handleLogout: () => void;
    fetchData: () => void;
    loading: boolean;
}

const AuditHeader = ({
    autoRefresh,
    setAutoRefresh,
    handleExport,
    handleLogout,
    fetchData,
    loading
}: AuditHeaderProps) => {
    const router = useRouter();
    const { user } = useAuth();

    const handleBack = () => {
        if (user?.role === 'admin') router.push('/admin');
        else if (user?.role === 'root') router.push('/root');
        else router.push('/');
    };

    return (
        <div className="flex flex-col md:flex-row justify-between items-center panel-tech p-6 rounded-xl gap-4">
            <div>
                <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2">
                    <Shield className="text-[color:var(--accent-0)]" />
                    Dashboard de Auditoría
                </h1>
                <p className="text-[color:var(--text-3)]">Monitorización y rastro de actividades del sistema</p>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
                <Button
                    onClick={handleBack}
                    className="btn-ghost px-4 py-2 border border-[color:var(--border-1)] flex items-center gap-2"
                    title="Volver al dashboard"
                >
                    <ArrowLeft size={16} />
                    <LayoutDashboard size={16} />
                    <span className="hidden sm:inline text-xs">Dashboard</span>
                </Button>
                <Button onClick={() => router.push('/privacy')} className="btn-ghost border border-[color:var(--border-1)] px-3 py-2 text-xs">Privacidad</Button>
                <ThemeToggle />
                <div className="flex items-center gap-2 mr-4 bg-[color:var(--surface-2)] rounded-lg px-3 py-2 border border-[color:var(--border-1)]">
                    <span className="text-xs text-[color:var(--text-3)] font-medium">Auto-refresh</span>
                    <Switch isSelected={autoRefresh} onChange={setAutoRefresh}>
                        <Switch.Content>
                            <span className="sr-only">Actualización automática</span>
                            <Switch.Control className={`flex h-4 w-8 items-center rounded-full p-0.5 transition-colors ${autoRefresh ? 'bg-[color:var(--accent-0)]' : 'bg-[color:var(--border-1)]'}`}>
                                <Switch.Thumb className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0'}`} />
                            </Switch.Control>
                        </Switch.Content>
                    </Switch>
                </div>

                <Button
                    onClick={handleExport}
                    aria-label="Exportar auditoría"
                    className="btn-ghost px-4 py-2"
                >
                    <Download size={18} />
                    <span className="hidden sm:inline">Exportar</span>
                </Button>
                <Button
                    onClick={fetchData}
                    aria-label="Actualizar auditoría"
                    className={`btn-ghost px-4 py-2 ${loading ? 'opacity-70' : ''}`}
                    disabled={loading}
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    <span className="hidden sm:inline">Actualizar</span>
                </Button>
                <Button
                    onClick={handleLogout}
                    aria-label="Cerrar sesión"
                    className="border border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors font-medium ml-2"
                >
                    <LogOut size={18} />
                    <span className="hidden sm:inline">Salir</span>
                </Button>
            </div>
        </div>
    );
};

export default AuditHeader;
