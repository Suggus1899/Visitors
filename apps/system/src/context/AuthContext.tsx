'use client';

import { useState, useEffect, ReactNode } from 'react';
import { AuthContext } from './AuthContextInstance';
import AuthService from '../services/AuthService';
import type { User } from '../types';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const restoreSession = async () => {
            const role = localStorage.getItem('role') as User['role'] | null;
            const username = localStorage.getItem('username');

            if (AuthService.isAuthenticated() && username && role) {
                try {
                    await AuthService.refreshAccessToken();
                    setUser({ username, role });
                } catch {
                    AuthService.logout();
                    localStorage.removeItem('role');
                    localStorage.removeItem('username');
                }
            }
            setLoading(false);
        };
        restoreSession();
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
