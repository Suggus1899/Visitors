'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from './AuthContextInstance';
import AuthService from '../services/AuthService';
import type { User } from '../types';

export function AuthProvider({ children, initialUser = null }: { children: ReactNode; initialUser?: User | null }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(initialUser);

  useEffect(() => {
    const clearSession = () => { queryClient.clear(); setUser(null); };
    window.addEventListener('auth:logout', clearSession);
    return () => window.removeEventListener('auth:logout', clearSession);
  }, [queryClient]);

  const login = (nextUser: User) => setUser(nextUser);
  const logout = async () => {
    queryClient.clear();
    try { await AuthService.logout(); } finally {
      setUser(null);
      window.location.replace('/login');
    }
  };

  return <AuthContext.Provider value={{ user, login, logout, loading: false }}>{children}</AuthContext.Provider>;
}
