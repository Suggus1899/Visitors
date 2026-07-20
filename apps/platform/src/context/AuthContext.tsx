'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { platformApi } from '../api/platformApi';
import { getClientUser } from '@lib/auth-client';
import type { LoginCredentials, PlatformSession } from '../types';

interface AuthContextValue {
  session: PlatformSession | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export { AuthContext };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore the user from the client-side mirror cookie. The access token
    // itself lives in an httpOnly cookie we cannot read from JS — its presence
    // is enforced by middleware.ts on the server side.
    const user = getClientUser();
    if (user) {
      setSession({
        accessToken: '',
        refreshToken: '',
        user,
      });
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const result = await platformApi.login(credentials);
    // The backend sets httpOnly cookies on success. We only keep the user
    // object in React state for UI rendering.
    setSession(result);
  }, []);

  const logout = useCallback(async () => {
    try {
      await platformApi.logout();
    } catch {
      // Best-effort — cookie may already be gone.
    }
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      login,
      logout,
      isAuthenticated: !!session,
    }),
    [session, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
