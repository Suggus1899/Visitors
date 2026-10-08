import Plus from 'lucide-react/dist/esm/icons/plus';
import Edit from 'lucide-react/dist/esm/icons/edit';
import Key from 'lucide-react/dist/esm/icons/key';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import { User } from './types';

interface UsersTabProps {
  users: User[];
  setShowCreateModal: (val: boolean) => void;
  openEditModal: (user: User) => void;
  openResetModal: (user: User) => void;
  handleDeleteUser: (id: number) => void;
}

const UsersTab = ({ users, setShowCreateModal, openEditModal, openResetModal, handleDeleteUser }: UsersTabProps) => {
  return (
    <div className="bg-[color:var(--surface-1)] rounded-lg border border-[color:var(--border-1)]">
      <div className="p-4 border-b border-[color:var(--border-1)] flex justify-between items-center">
        <h2 className="text-lg font-semibold text-[color:var(--text-1)]">Gestión de Usuarios</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-tech flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[color:var(--surface-2)]">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">ID</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Usuario</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Rol</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Estado</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--text-2)]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border-1)]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[color:var(--surface-2)]">
                <td className="px-4 py-3 text-sm text-[color:var(--text-2)]">{u.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-[color:var(--text-1)]">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    u.role === 'root' ? 'bg-purple-100 text-purple-700' :
                    u.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                    u.role === 'auditor' ? 'bg-yellow-100 text-yellow-700' :
                    u.role === 'operador' ? 'bg-gray-100 text-gray-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.lockedUntil ? (
                    <span className="text-red-500 text-sm">Bloqueado</span>
                  ) : u.mustChangePassword ? (
                    <span className="text-amber-500 text-sm">Cambio requerido</span>
                  ) : (
                    <span className="text-green-500 text-sm">Activo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEditModal(u)}
                      className="p-1.5 text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openResetModal(u)}
                      className="p-1.5 text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] transition-colors"
                      title="Restablecer contraseña"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    {u.role !== 'root' && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-1.5 text-[color:var(--text-3)] hover:text-red-500 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-8 text-[color:var(--text-3)]">
            No hay usuarios registrados
          </div>
        )}
      </div>
    </div>
  );
};

export default UsersTab;
