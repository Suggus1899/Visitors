import { cookies } from 'next/headers';
import type { User } from '@logmaster/types';

/**
 * Server-side session helpers.
 *
 * The backend sets the `lm_access_token` httpOnly cookie on login, so the
 * server can read it directly (no Authorization header needed). The user's
 * role / username are persisted in separate readable cookies by the client
 * AuthProvider so server components can render role-aware UI without an extra
 * round-trip.
 */

export interface ServerSession {
    user: User | null;
    isAuthenticated: boolean;
}

export async function getServerSession(): Promise<ServerSession> {
    const store = cookies();
    const token = store.get('lm_access_token')?.value;
    const username = store.get('lm_username')?.value;
    const role = store.get('lm_role')?.value;

    if (!token) {
        return { user: null, isAuthenticated: false };
    }

    if (username && role) {
        return {
            user: { username, role: role as User['role'] },
            isAuthenticated: true,
        };
    }

    return { user: null, isAuthenticated: true };
}

export async function isAuthenticated(): Promise<boolean> {
    const store = cookies();
    return Boolean(store.get('lm_access_token')?.value);
}
