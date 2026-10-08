import Users from 'lucide-react/dist/esm/icons/users';
import Activity from 'lucide-react/dist/esm/icons/activity';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

interface SuperAdminTabsProps {
  activeTab: 'users' | 'audit';
  setActiveTab: (tab: 'users' | 'audit') => void;
  loadData: () => void;
  loading: boolean;
}

const SuperAdminTabs = ({ activeTab, setActiveTab, loadData, loading }: SuperAdminTabsProps) => {
  return (
    <div className="flex gap-2 mb-6">
      <button
        onClick={() => setActiveTab('users')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          activeTab === 'users'
            ? 'bg-[color:var(--accent-0)] text-white'
            : 'bg-[color:var(--surface-1)] text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)]'
        }`}
      >
        <Users className="w-4 h-4" />
        Usuarios
      </button>
      <button
        onClick={() => setActiveTab('audit')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          activeTab === 'audit'
            ? 'bg-[color:var(--accent-0)] text-white'
            : 'bg-[color:var(--surface-1)] text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)]'
        }`}
      >
        <Activity className="w-4 h-4" />
        Logs de Auditoría
      </button>
      <button
        onClick={loadData}
        className="btn-ghost ml-auto flex items-center gap-2"
        disabled={loading}
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        Actualizar
      </button>
    </div>
  );
};

export default SuperAdminTabs;
