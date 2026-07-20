'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@logmaster/auth';
import { AuthService } from '@logmaster/api';
import type { User } from '@logmaster/types';
import { Loader2, Eye, EyeOff, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Login page for the auditor app.
 *
 * Authenticates via the shared AuthService and stores the user in the
 * AuthContext. After login the router will redirect to the tenant
 * selector (or directly to the dashboard if a single tenant exists).
 */
export const LoginPage = () => {
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

            // Enforce auditor-only access at the login gate.
            if (user.role !== 'auditor') {
                AuthService.logout();
                toast.error('Access denied: this portal is for auditors only.');
                setIsLoading(false);
                return;
            }

            login({
                username: user.username,
                role: user.role as User['role'],
                mustChangePassword: user.mustChangePassword,
            });
            toast.success(`Welcome, ${user.username}`);
            router.push('/select-tenant');
        } catch (err) {
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

                    <div className="flex flex-col items-center mb-8 animate-fadeIn">
                        <div className="p-3 mb-4 rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                            <Shield className="text-[color:var(--accent-0)]" size={40} />
                        </div>
                        <h2 className="text-3xl font-display font-semibold text-[color:var(--text-1)]">
                            LogMaster Auditor
                        </h2>
                        <p className="text-[color:var(--text-2)] text-xs uppercase tracking-[0.2em] mt-2">
                            Audit &amp; Compliance Portal
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5 animate-fadeIn">
                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 ml-1 uppercase tracking-[0.22em]">
                                Username
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={isLoading}
                                className="input-tech"
                                placeholder="Enter your username"
                                autoComplete="username"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 ml-1 uppercase tracking-[0.22em]">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    className="input-tech pr-10"
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
                                    <Loader2 className="animate-spin-slow" size={20} />
                                    <span>Verifying...</span>
                                </>
                            ) : (
                                <span>SIGN IN</span>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center animate-fadeIn">
                        <p className="text-[10px] text-[color:var(--text-3)] uppercase tracking-[0.3em] font-medium">
                            LogMaster Auditor &copy; v1.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
