'use client';

import { Input } from './ui/input';
import { Button } from './ui/button';
import React, { useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthService from '../services/AuthService';
import type { User } from '../types';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Eye from 'lucide-react/dist/esm/icons/eye';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import toast, { Toaster } from 'react-hot-toast';

const highlights = ['Registro de ingresos y salidas en la garita', 'Historial completo de cada visita', 'Permisos por rol y bitácora de auditoría'];

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return setError('Ingresa tu usuario.');
        if (!password) return setError('Ingresa tu contraseña.');

        setError('');
        setIsLoading(true);
        try {
            const user = await AuthService.login(username, password);
            toast.success(`¡Bienvenido, ${user.username}!`);
            login({ username: user.username, role: user.role as User['role'], mustChangePassword: user.mustChangePassword });
            router.replace(user.role === 'root' ? '/root' : user.role === 'auditor' ? '/audit' : '/');
        } catch (err) {
            const failure = err as AxiosError<{ error?: { message?: string } }>;
            const status = failure.response?.status;
            // One message for both cases, so the form does not reveal which usernames exist.
            if (status === 401 || status === 404) setError('Usuario o contraseña incorrectos.');
            else setError(failure.response?.data?.error?.message || 'No se pudo conectar con el servidor. Verifica que esté activo.');
        } finally {
            setIsLoading(false);
        }
    };

    const trackCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 3000,
                    style: { background: 'var(--surface-1)', color: 'var(--text-1)', borderRadius: '10px', border: '1px solid var(--border-1)' },
                    success: { iconTheme: { primary: '#16a34a', secondary: '#ffffff' } },
                    error: { iconTheme: { primary: '#dc2626', secondary: '#ffffff' } },
                }}
            />

            <aside className="relative overflow-hidden bg-gradient-to-br from-[#14532d] via-[#166534] to-[#15803d] text-white px-6 py-8 lg:px-14 lg:py-14 flex flex-col">
                <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-white/10" />
                <div aria-hidden className="pointer-events-none absolute -right-6 -bottom-6 h-40 w-40 rounded-full bg-white/10" />
                <div className="relative flex items-center gap-4">
                    <div className="rounded-xl bg-white p-2 shadow-sm">
                        <img src="/logo.png" alt="Industrias de Alimentos El Trébol" className="h-12 w-auto object-contain lg:h-14" />
                    </div>
                    <div>
                        <p className="text-xl font-semibold tracking-tight">LogMaster</p>
                        <p className="text-sm text-green-100">Industrias de Alimentos El Trébol</p>
                    </div>
                </div>
                <div className="relative mt-10 hidden lg:block">
                    <h1 className="text-4xl font-semibold leading-tight tracking-tight">Control de visitantes y trazabilidad de acceso</h1>
                    <p className="mt-4 max-w-md text-base text-green-100">Registra cada ingreso y salida, consulta quién está en la planta y reconstruye el historial de cualquier visita.</p>
                    <ul className="mt-8 space-y-3">
                        {highlights.map(item => (
                            <li key={item} className="flex items-center gap-3 text-green-50">
                                <CheckCircle size={18} className="shrink-0 text-green-300" aria-hidden />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="relative mt-auto hidden pt-10 text-xs text-green-200 lg:block">© Industrias de Alimentos El Trébol · LogMaster</p>
            </aside>

            <main className="flex items-center justify-center px-6 py-10 lg:px-12">
                <div className="w-full max-w-sm">
                    <h2 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
                    <p className="mt-1 text-sm text-[color:var(--text-2)]">Ingresa con la cuenta que te asignó el administrador.</p>

                    {error && (
                        <div role="alert" className="mt-6 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                            <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
                        <div>
                            <label htmlFor="login-username" className="mb-1.5 block text-sm font-medium text-[color:var(--text-2)]">Usuario</label>
                            <Input
                                id="login-username"
                                autoComplete="username"
                                autoFocus
                                type="text"
                                value={username}
                                onChange={e => { setUsername(e.target.value); setError(''); }}
                                disabled={isLoading}
                                className="input-tech w-full"
                                placeholder="Ingrese su usuario"
                            />
                        </div>

                        <div>
                            <div className="mb-1.5 flex items-baseline justify-between">
                                <label htmlFor="login-password" className="block text-sm font-medium text-[color:var(--text-2)]">Contraseña</label>
                                <Link href="/forgot-password" className="text-sm font-medium text-[color:var(--accent-0)] hover:underline">¿La olvidaste?</Link>
                            </div>
                            <div className="relative">
                                <Input
                                    id="login-password"
                                    autoComplete="current-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setError(''); }}
                                    onKeyUp={trackCapsLock}
                                    onKeyDown={trackCapsLock}
                                    onBlur={() => setCapsLock(false)}
                                    disabled={isLoading}
                                    className="input-tech w-full pr-10"
                                    placeholder="••••••••"
                                />
                                <Button
                                    type="button"
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] hover:text-[color:var(--accent-0)]"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </Button>
                            </div>
                            <p aria-live="polite" className="mt-1.5 min-h-5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                {capsLock ? 'Bloq Mayús está activado.' : ''}
                            </p>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="btn-tech btn-press flex w-full items-center justify-center gap-2 py-3 text-sm tracking-wide disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} aria-hidden />
                                    <span>Verificando...</span>
                                </>
                            ) : (
                                <span>INGRESAR</span>
                            )}
                        </Button>
                    </form>

                    <p className="mt-10 text-center text-xs text-[color:var(--text-3)] lg:hidden">© Industrias de Alimentos El Trébol · LogMaster</p>
                </div>
            </main>
        </div>
    );
};

export default Login;
