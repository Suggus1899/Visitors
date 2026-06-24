import { User } from './types';

interface UserModalsProps {
  showCreateModal: boolean;
  setShowCreateModal: (val: boolean) => void;
  newUser: any;
  setNewUser: (val: any) => void;
  handleCreateUser: () => void;
  
  showEditModal: boolean;
  setShowEditModal: (val: boolean) => void;
  editUser: any;
  setEditUser: (val: any) => void;
  handleUpdateUser: () => void;
  
  showResetModal: boolean;
  setShowResetModal: (val: boolean) => void;
  newPassword: string;
  setNewPassword: (val: string) => void;
  handleResetPassword: () => void;
  
  selectedUser: User | null;
}

const UserModals = ({
  showCreateModal, setShowCreateModal, newUser, setNewUser, handleCreateUser,
  showEditModal, setShowEditModal, editUser, setEditUser, handleUpdateUser,
  showResetModal, setShowResetModal, newPassword, setNewPassword, handleResetPassword,
  selectedUser
}: UserModalsProps) => {
  return (
    <>
      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[color:var(--surface-1)] rounded-lg p-6 max-w-md w-full mx-4 border border-[color:var(--border-1)]">
            <h3 className="text-lg font-semibold text-[color:var(--text-1)] mb-4">Crear Nuevo Usuario</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Nombre de usuario</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Contraseña</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Rol</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as User['role'] })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                >
                  <option value="operador">Operador</option>
                  <option value="admin">Administrador</option>
                  <option value="auditor">Auditor</option>
                  <option value="demo">Demo</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setShowCreateModal(false)} className="btn-ghost px-4 py-2">
                Cancelar
              </button>
              <button onClick={handleCreateUser} className="btn-tech px-4 py-2">
                Crear Usuario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[color:var(--surface-1)] rounded-lg p-6 max-w-md w-full mx-4 border border-[color:var(--border-1)]">
            <h3 className="text-lg font-semibold text-[color:var(--text-1)] mb-4">Editar Usuario</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Nombre de usuario</label>
                <input
                  type="text"
                  value={editUser.username}
                  onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Rol</label>
                <select
                  value={editUser.role}
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value as User['role'] })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                >
                  <option value="operador">Operador</option>
                  <option value="admin">Administrador</option>
                  <option value="auditor">Auditor</option>
                  <option value="demo">Demo</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setShowEditModal(false)} className="btn-ghost px-4 py-2">
                Cancelar
              </button>
              <button onClick={handleUpdateUser} className="btn-tech px-4 py-2">
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[color:var(--surface-1)] rounded-lg p-6 max-w-md w-full mx-4 border border-[color:var(--border-1)]">
            <h3 className="text-lg font-semibold text-[color:var(--text-1)] mb-2">Restablecer Contraseña</h3>
            <p className="text-sm text-[color:var(--text-2)] mb-4">
              Usuario: <strong>{selectedUser.username}</strong>
            </p>
            <div>
              <label className="block text-sm text-[color:var(--text-2)] mb-1">Nueva contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
              />
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setShowResetModal(false)} className="btn-ghost px-4 py-2">
                Cancelar
              </button>
              <button onClick={handleResetPassword} className="btn-tech px-4 py-2">
                Restablecer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserModals;
