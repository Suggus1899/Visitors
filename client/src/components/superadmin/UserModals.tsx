import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { User, UserFormData } from './types';

interface UserModalsProps {
  showCreateModal: boolean;
  setShowCreateModal: (val: boolean) => void;
  newUser: UserFormData;
  setNewUser: (val: UserFormData) => void;
  handleCreateUser: () => void;

  showEditModal: boolean;
  setShowEditModal: (val: boolean) => void;
  editUser: Partial<UserFormData> & { id?: number };
  setEditUser: (val: Partial<UserFormData> & { id?: number }) => void;
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
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="bg-[color:var(--surface-1)] rounded-lg p-6 max-w-md w-full mx-4 border border-[color:var(--border-1)]">
            <DialogTitle className="text-lg font-semibold text-[color:var(--text-1)] mb-4">Crear Nuevo Usuario</DialogTitle><DialogDescription className="sr-only">Administración de la cuenta de usuario</DialogDescription>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Nombre de usuario</label>
                <Input
                  type="text"
                  aria-label="Nombre de usuario"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Contraseña</label>
                <Input
                  type="password"
                  aria-label="Contraseña"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Correo electrónico</label>
                            <Input type="email" aria-label="Correo electrónico" value={newUser.email || ''} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required={newUser.role !== 'demo'} className="input-tech mb-4" />
                            <label className="block text-sm text-[color:var(--text-2)] mb-1">Rol</label>
                <select
                  aria-label="Rol"
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
              <Button onClick={() => setShowCreateModal(false)} className="btn-ghost px-4 py-2">
                Cancelar
              </Button>
              <Button onClick={handleCreateUser} className="btn-tech px-4 py-2">
                Crear Usuario
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="bg-[color:var(--surface-1)] rounded-lg p-6 max-w-md w-full mx-4 border border-[color:var(--border-1)]">
            <DialogTitle className="text-lg font-semibold text-[color:var(--text-1)] mb-4">Editar Usuario</DialogTitle><DialogDescription className="sr-only">Administración de la cuenta de usuario</DialogDescription>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[color:var(--text-2)] mb-1">Nombre de usuario</label>
                <Input
                  type="text"
                  aria-label="Nombre de usuario"
                  value={editUser.username}
                  onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Correo electrónico</label>
                            <Input type="email" aria-label="Correo electrónico" value={editUser.email || ''} onChange={e => setEditUser({ ...editUser, email: e.target.value })}  className="input-tech mb-4" />
                            <label className="block text-sm text-[color:var(--text-2)] mb-1">Rol</label>
                <select
                  aria-label="Rol"
                  disabled={selectedUser.role === 'root'}
                  value={editUser.role}
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value as User['role'] })}
                  className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
                >
                  {selectedUser.role === 'root' && <option value="root">Root</option>}
                  <option value="operador">Operador</option>
                  <option value="admin">Administrador</option>
                  <option value="auditor">Auditor</option>
                  <option value="demo">Demo</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <Button onClick={() => setShowEditModal(false)} className="btn-ghost px-4 py-2">
                Cancelar
              </Button>
              <Button onClick={handleUpdateUser} className="btn-tech px-4 py-2">
                Guardar Cambios
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedUser && (
        <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
          <DialogContent className="bg-[color:var(--surface-1)] rounded-lg p-6 max-w-md w-full mx-4 border border-[color:var(--border-1)]">
            <DialogTitle className="text-lg font-semibold text-[color:var(--text-1)] mb-2">Restablecer Contraseña</DialogTitle><DialogDescription className="sr-only">Administración de la cuenta de usuario</DialogDescription>
            <p className="text-sm text-[color:var(--text-2)] mb-4">
              Usuario: <strong>{selectedUser.username}</strong>
            </p>
            <div>
              <label className="block text-sm text-[color:var(--text-2)] mb-1">Nueva contraseña</label>
              <Input
                type="password"
                aria-label="Nueva contraseña"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)]"
              />
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <Button onClick={() => setShowResetModal(false)} className="btn-ghost px-4 py-2">
                Cancelar
              </Button>
              <Button onClick={handleResetPassword} className="btn-tech px-4 py-2">
                Restablecer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default UserModals;
