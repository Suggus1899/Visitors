export interface User {
  id: number;
  username: string;
  role: 'root' | 'admin' | 'operador' | 'auditor' | 'demo';
  mustChangePassword: boolean;
  loginAttempts: number;
  lockedUntil: string | null;
}

export interface UserFormData {
  username: string;
  password: string;
  role: 'root' | 'admin' | 'operador' | 'auditor' | 'demo';
}

export interface AuditLog {
  id: number;
  userId: number;
  username: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}
