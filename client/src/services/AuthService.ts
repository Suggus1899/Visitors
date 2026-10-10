import api from './api.v1';

type SessionUser = {
  id: number;
  username: string;
  role: 'root' | 'admin' | 'operador' | 'auditor' | 'demo';
  mustChangePassword: boolean;
};

type ApiResponse<T> = { success: boolean; data: T };

class AuthService {
  private refreshing: Promise<void> | null = null;

  async login(username: string, password: string): Promise<SessionUser> {
    const response = await api.post<ApiResponse<{ user: SessionUser }>>('/auth/login', { username, password });
    return response.data.data.user;
  }

  refreshAccessToken(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = api.post('/auth/refresh').then(() => undefined).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  async logout(): Promise<void> {
    try { await api.post('/auth/logout'); } finally {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:logout'));
    }
  }

}

const authService = new AuthService();
export default authService;
