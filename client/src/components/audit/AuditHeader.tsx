import { ThemeToggle } from '../ThemeToggle';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Download from 'lucide-react/dist/esm/icons/download';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard';
import { useNavigate } from 'react-router-dom';
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
    const navigate = useNavigate();
    const { user } = useAuth();

    const handleBack = () => {
        if (user?.role === 'admin') navigate('/admin');
        else if (user?.role === 'root') navigate('/root');
        else navigate('/');
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
                <button
                    onClick={handleBack}
                    className="btn-ghost px-4 py-2 border border-[color:var(--border-1)] flex items-center gap-2"
                    title="Volver al dashboard"
                >
                    <ArrowLeft size={16} />
                    <LayoutDashboard size={16} />
                    <span className="hidden sm:inline text-xs">Dashboard</span>
                </button>
                <ThemeToggle />
                <div className="flex items-center gap-2 mr-4 bg-[color:var(--surface-2)] rounded-lg px-3 py-2 border border-[color:var(--border-1)]">
                    <span className="text-xs text-[color:var(--text-3)] font-medium">Auto-refresh</span>
                    <div 
                        className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${autoRefresh ? 'bg-[color:var(--accent-0)]' : 'bg-[color:var(--border-1)]'}`}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${autoRefresh ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                </div>

                <button 
                    onClick={handleExport}
                    className="btn-ghost px-4 py-2"
                >
                    <Download size={18} />
                    <span className="hidden sm:inline">Exportar</span>
                </button>
                <button 
                    onClick={fetchData}
                    className={`btn-ghost px-4 py-2 ${loading ? 'opacity-70' : ''}`}
                    disabled={loading}
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    <span className="hidden sm:inline">Actualizar</span>
                </button>
                <button 
                    onClick={handleLogout}
                    className="border border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors font-medium ml-2"
                >
                    <LogOut size={18} />
                    <span className="hidden sm:inline">Salir</span>
                </button>
            </div>
        </div>
    );
};

export default AuditHeader;
