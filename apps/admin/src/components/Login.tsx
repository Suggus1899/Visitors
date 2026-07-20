'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@logmaster/auth';
import { AuthService } from '@logmaster/api';
import toast from 'react-hot-toast';
import type { User } from '@logmaster/types';
import Eye from 'lucide-react/dist/esm/icons/eye';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Lock from 'lucide-react/dist/esm/icons/lock';
import UserIcon from 'lucide-react/dist/esm/icons/user';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username.trim()) {
            toast.error('Please enter your username');
            return;
        }
        if (!password) {
            toast.error('Please enter your password');
            return;
        }

        setIsLoading(true);

        try {
            const user = await AuthService.login(username, password);

            // Only allow admin and root roles to access the admin app
            if (user.role !== 'admin' && user.role !== 'root') {
                toast.error('Access denied: admin role required');
                AuthService.logout();
                setIsLoading(false);
                return;
            }

            toast.success(`Welcome, ${user.username}!`);
            login({
                username: user.username,
                role: user.role as User['role'],
                mustChangePassword: user.mustChangePassword,
            });

            router.push('/');
        } catch (err: unknown) {
            const error = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
            const status = error.response?.status;
            const message = error.response?.data?.error?.message;

            if (status === 404) {
                toast.error('User not found');
            } else if (status === 401) {
                toast.error('Incorrect password');
            } else if (message) {
                toast.error(message);
            } else {
                toast.error('Connection error. Please verify the server is running.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-40" />
            <div className="absolute inset-0 bg-noise opacity-25 mix-blend-soft-light" />
            <div className="absolute -top-28 -left-28 h-72 w-72 rounded-full bg-[color:var(--accent-2)] opacity-25 blur-3xl" />
            <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[color:var(--accent-0)] opacity-20 blur-3xl" />

            <div className="relative w-full max-w-md">
                <div className="panel-tech rounded-2xl p-8 md:p-10 animate-slideUp relative z-10 overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-[color:var(--accent-0)]" />

                    <div className="flex flex-col items-center mb-8 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
                        <div className="p-3 mb-4 rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                            <img src="/logo.png" alt="LogMaster" className="h-16 w-auto object-contain" />
                        </div>
                        <h2 className="text-2xl font-display font-semibold text-[color:var(--text-1)]">LogMaster Admin</h2>
                        <p className="text-[color:var(--text-2)] text-xs uppercase tracking-[0.2em] mt-2">
                            Tenant Administration
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 ml-1 uppercase tracking-[0.22em]">
                                Username
                            </label>
                            <div className="relative">
                                <UserIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    disabled={isLoading}
                                    className="input-tech pl-10"
                                    placeholder="Enter your username"
                                    autoComplete="username"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 ml-1 uppercase tracking-[0.22em]">
                                Password
                            </label>
                            <div className="relative">
                                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    className="input-tech pl-10 pr-10"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] focus:outline-none"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-tech flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <span>SIGN IN</span>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center animate-fadeIn" style={{ animationDelay: '0.4s' }}>
                        <p className="text-[10px] text-[color:var(--text-3)] uppercase tracking-[0.3em] font-medium">
                            LogMaster © Visitor Management
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
