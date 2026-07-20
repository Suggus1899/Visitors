import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { platformApi } from '../api/platformApi';
import { tokenStore } from '../api/tokenStore';
import type { LoginCredentials, PlatformSession } from '../types';

interface AuthContextValue {
  session: PlatformSession | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export { AuthContext };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore session from token store on mount. The access token lives in
    // sessionStorage (cleared on tab close); the refresh token in localStorage
    // lets us rehydrate the user object.
    const accessToken = tokenStore.getAccessToken();
    const refreshToken = tokenStore.getRefreshToken();
    const user = tokenStore.getUser<PlatformSession['user']>();
    if (accessToken && refreshToken && user) {
      setSession({ accessToken, refreshToken, user });
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const result = await platformApi.login(credentials);
    // Enforce the superadmin guard client-side as a first line of defense.
    // The backend MUST also enforce this on every /platform/v1/* request.
    if (!result.user.isSuperAdmin) {
      throw new Error('Access denied. Superadmin privileges required.');
    }
    tokenStore.setAccessToken(result.accessToken);
    tokenStore.setRefreshToken(result.refreshToken);
    tokenStore.setUser(result.user);
    setSession(result);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
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
