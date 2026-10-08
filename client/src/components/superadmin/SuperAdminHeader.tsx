import Shield from 'lucide-react/dist/esm/icons/shield';
import LogOut from 'lucide-react/dist/esm/icons/log-out';

interface SuperAdminHeaderProps {
  user: any;
  handleLogout: () => void;
}

const SuperAdminHeader = ({ user, handleLogout }: SuperAdminHeaderProps) => {
  return (
    <header className="bg-[color:var(--surface-1)] border-b border-[color:var(--border-1)] p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-[color:var(--accent-0)]" />
          <div>
            <h1 className="text-xl font-bold text-[color:var(--text-1)]">Super Admin Panel</h1>
            <p className="text-sm text-[color:var(--text-3)]">Gestión completa del sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[color:var(--text-2)]">
            {user?.username} ({user?.role})
          </span>
          <button onClick={handleLogout} className="btn-ghost flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </div>
    </header>
  );
};

export default SuperAdminHeader;
