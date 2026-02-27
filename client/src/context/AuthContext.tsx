import { useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContextInstance';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<{ username: string; role: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Force re-authentication on every app startup
        // Clear any existing session tokens
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
        setLoading(false);
    }, []);

    const login = (token: string, userData: { username: string; role: string }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('role', userData.role);
        localStorage.setItem('username', userData.username);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

