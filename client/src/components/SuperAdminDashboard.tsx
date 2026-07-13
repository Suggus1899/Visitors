import { useState, useEffect, useCallback } from 'react';
import api from '../services/api.v1';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import SuperAdminHeader from './superadmin/SuperAdminHeader';
import SuperAdminTabs from './superadmin/SuperAdminTabs';
import UsersTab from './superadmin/UsersTab';
import AuditLogsTab from './superadmin/AuditLogsTab';
import UserModals from './superadmin/UserModals';
import { User, AuditLog, UserFormData } from './superadmin/types';

interface ApiError {
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
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
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'operador' as User['role'] });
  const [editUser, setEditUser] = useState<Partial<UserFormData> & { id?: number }>({ username: '', role: 'operador' });
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    try {
      const response = await api.get('/root/users');
      setUsers(response.data.data || []);
    } catch {
      toast.error('Error al cargar usuarios');
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/root/audit-logs');
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

  const handleCreateUser = async () => {
    try {
      await api.post('/root/users', newUser);
      toast.success('Usuario creado exitosamente');
      setShowCreateModal(false);
      setNewUser({ username: '', password: '', role: 'operador' });
      fetchUsers();
    } catch (err) {
      const error = err as ApiError;
      toast.error(error.response?.data?.error?.message || 'Error al crear usuario');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    try {
      await api.put(`/root/users/${selectedUser.id}`, editUser);
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
      await api.delete(`/root/users/${userId}`);
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
      await api.post(`/root/users/${selectedUser.id}/reset-password`, 
        { newPassword }
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
      <SuperAdminHeader 
        user={user} 
        handleLogout={handleLogout} 
      />

      <div className="max-w-7xl mx-auto px-4 py-4">
        <SuperAdminTabs 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          loadData={loadData} 
          loading={loading} 
        />

        {activeTab === 'users' && (
          <UsersTab 
            users={users} 
            setShowCreateModal={setShowCreateModal} 
            openEditModal={openEditModal} 
            openResetModal={openResetModal} 
            handleDeleteUser={handleDeleteUser} 
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogsTab auditLogs={auditLogs} />
        )}
      </div>

      <UserModals 
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        newUser={newUser}
        setNewUser={setNewUser}
        handleCreateUser={handleCreateUser}
        
        showEditModal={showEditModal}
        setShowEditModal={setShowEditModal}
        editUser={editUser}
        setEditUser={setEditUser}
        handleUpdateUser={handleUpdateUser}
        
        showResetModal={showResetModal}
        setShowResetModal={setShowResetModal}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        handleResetPassword={handleResetPassword}
        
        selectedUser={selectedUser}
      />
    </div>
  );
}
