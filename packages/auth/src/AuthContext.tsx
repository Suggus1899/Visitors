import { useState, useEffect, ReactNode } from 'react';
import { AuthContext } from './AuthContextInstance';
import { AuthService } from '@logmaster/api';
import type { User } from '@logmaster/types';

interface AuthProviderProps {
    children: ReactNode;
    /**
     * Roles allowed to hold a restored session in this app, mirroring the
     * check each app's own Login component already does on submit (e.g.
     * admin only allows 'admin'/'root'). Without this, a stale non-allowed
     * role left in localStorage — plausible given the lm_access_token
     * cookie is shared across every app on localhost — would restore a
     * session on page load/refresh without ever going through the
     * role-gated login form. Omit to allow any role (unrestricted).
     */
    allowedRoles?: User['role'][];
}

export const AuthProvider = ({ children, allowedRoles }: AuthProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const restoreSession = async () => {
            const role = localStorage.getItem('role') as User['role'] | null;
            const username = localStorage.getItem('username');

            if (AuthService.isAuthenticated() && username && role && (!allowedRoles || allowedRoles.includes(role))) {
                try {
                    await AuthService.refreshAccessToken();
                    setUser({ username, role });
                } catch {
                    await rejectSession();
                }
            } else if (username || role) {
                // A role restriction rejected this session (or it was
                // already incomplete) — clear it instead of leaving stale
                // localStorage that would just fail this same check again.
                await rejectSession();
            }
            setLoading(false);
        };
        // Clears client-side session state AND the httpOnly access-token
        // cookie server-side (AuthService.logout() only clears local state).
        // Without clearing the cookie too, this app's middleware — which
        // gates purely on cookie presence — would keep letting a rejected
        // session's next navigation through, and the client would reject it
        // again, and so on: an unstable loop that any stray revisit (a
        // prefetch, a race) can keep re-triggering forever. Clearing the
        // cookie here makes the rejection self-stabilizing: once done, the
        // middleware itself blocks re-entry deterministically.
        const rejectSession = async () => {
            AuthService.logout();
            localStorage.removeItem('role');
            localStorage.removeItem('username');
            try {
                await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
            } catch {
                // Best effort — if this fails, the cookie's own expiry still
                // bounds how long a rejected session can affect middleware.
            }
        };
        restoreSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = (userData: User) => {
        localStorage.setItem('role', userData.role);
        localStorage.setItem('username', userData.username);
        setUser(userData);
    };

    const logout = () => {
        AuthService.logout();
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
