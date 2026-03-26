import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// Icons
import Users from 'lucide-react/dist/esm/icons/users';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Activity from 'lucide-react/dist/esm/icons/activity';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import Edit from 'lucide-react/dist/esm/icons/edit';
import Key from 'lucide-react/dist/esm/icons/key';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

interface User {
  id: number;
  username: string;
  role: 'admin' | 'guard' | 'auditor' | 'superadmin';
  mustChangePassword: boolean;
  loginAttempts: number;
  lockedUntil: string | null;
}

interface AuditLog {
  id: number;
  userId: number;
  username: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form states
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'guard' as User['role'] });
  const [editUser, setEditUser] = useState({ username: '', role: 'guard' as User['role'] });
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:3000/api/v1/superadmin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data.data || []);
    } catch {
      toast.error('Error al cargar usuarios');
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:3000/api/v1/superadmin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuditLogs(response.data.data?.logs || []);
    } catch {
      toast.error('Error al cargar logs de auditoría');
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    if (activeTab === 'users') {
      await fetchUsers();
    } else {
      await fetchAuditLogs();
    }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

interface ApiError {
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
}

  const handleCreateUser = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:3000/api/v1/superadmin/users', newUser, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Usuario creado exitosamente');
      setShowCreateModal(false);
      setNewUser({ username: '', password: '', role: 'guard' });
      fetchUsers();
    } catch (err) {
      const error = err as ApiError;
      toast.error(error.response?.data?.error?.message || 'Error al crear usuario');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://localhost:3000/api/v1/superadmin/users/${selectedUser.id}`, editUser, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Usuario actualizado exitosamente');
      setShowEditModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      const error = err as ApiError;
      toast.error(error.response?.data?.error?.message || 'Error al actualizar usuario');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este usuario?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:3000/api/v1/superadmin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Usuario eliminado exitosamente');
      fetchUsers();
    } catch (err) {
      const error = err as ApiError;
      toast.error(error.response?.data?.error?.message || 'Error al eliminar usuario');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:3000/api/v1/superadmin/users/${selectedUser.id}/reset-password`, 
        { newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Contraseña restablecida exitosamente');
      setShowResetModal(false);
      setNewPassword('');
      setSelectedUser(null);
    } catch (err) {
      const error = err as ApiError;
      toast.error(error.response?.data?.error?.message || 'Error al restablecer contraseña');
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditUser({ username: user.username, role: user.role });
    setShowEditModal(true);
  };

  const openResetModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setShowResetModal(true);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[color:var(--surface-0)]">
      {/* Header */}
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

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
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

        {/* Users Tab */}
        {activeTab === 'users' && (
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
                          u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                          u.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                          u.role === 'auditor' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
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
                          {u.role !== 'superadmin' && (
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
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <div className="bg-[color:var(--surface-1)] rounded-lg border border-[color:var(--border-1)]">
            <div className="p-4 border-b border-[color:var(--border-1)]">
              <h2 className="text-lg font-semibold text-[color:var(--text-1)]">Logs de Auditoría</h2>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-[color:var(--surface-2)] sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Fecha</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Usuario</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Acción</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Entidad</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-1)]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[color:var(--surface-2)]">
                      <td className="px-4 py-3 text-sm text-[color:var(--text-2)]">
                        {new Date(log.createdAt).toLocaleString('es-ES')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-[color:var(--text-1)]">{log.username}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[color:var(--text-2)]">
                        {log.entityType} #{log.entityId}
                      </td>
                      <td className="px-4 py-3 text-sm text-[color:var(--text-2)] max-w-md truncate">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLogs.length === 0 && (
                <div className="text-center py-8 text-[color:var(--text-3)]">
                  No hay logs de auditoría
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
                  <option value="guard">Guardia</option>
                  <option value="admin">Administrador</option>
                  <option value="auditor">Auditor</option>
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
                  <option value="guard">Guardia</option>
                  <option value="admin">Administrador</option>
                  <option value="auditor">Auditor</option>
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
    </div>
  );
}
