import React, { useState } from 'react';
import axios, { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Eye from 'lucide-react/dist/esm/icons/eye';
import EyeOff from 'lucide-react/dist/esm/icons/eye-off';
import toast, { Toaster } from 'react-hot-toast';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!username.trim()) {
            toast.error('Por favor ingresa tu usuario');
            return;
        }
        if (!password) {
            toast.error('Por favor ingresa tu contraseña');
            return;
        }

        setIsLoading(true);

        try {
            // Attempt auto-seed if first run (optional/dev convenience) - Removed as it is legacy
            // try { await axios.post('http://localhost:3000/api/auth/seed'); } catch { /* ignore */ }

            const res = await axios.post('http://localhost:3000/api/v1/auth/login', { username, password });
            
            // Backend returns: { success: true, data: { token, user: { username, role } } }
            const { token, user } = res.data.data;
            
            toast.success(`¡Bienvenido, ${user.username}!`);
            login(token, { username: user.username, role: user.role });

            if (user.role === 'superadmin') {
                setTimeout(() => navigate('/superadmin'), 500);
            } else if (user.role === 'auditor') {
                setTimeout(() => navigate('/audit'), 500);
            } else {
                setTimeout(() => navigate('/'), 500);
            }
        } catch (err) {
            const error = err as AxiosError<{ error?: { message?: string } }>; 
            const status = error.response?.status;
            const message = error.response?.data?.error?.message;

            if (status === 404) {
                toast.error('Usuario no encontrado');
            } else if (status === 401) {
                toast.error('Contraseña incorrecta');
            } else if (message) {
                toast.error(message);
            } else {
                toast.error('Error de conexión. Verifica que el servidor esté activo.');
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

            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 3000,
                    style: {
                        background: 'var(--surface-1)',
                        color: 'var(--text-1)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-1)'
                    },
                    success: { iconTheme: { primary: '#4dd7ff', secondary: '#081116' } },
                    error: { iconTheme: { primary: '#ff6b6b', secondary: '#0b0f12' } }
                }}
            />

            <div className="relative w-full max-w-md">
                <div className="panel-tech rounded-2xl p-8 md:p-10 animate-slideUp relative z-10 overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-[color:var(--accent-0)]" />

                    <div className="flex flex-col items-center mb-8 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
                        <div className="p-3 mb-4 rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                            <img src="./logo.png" alt="Industrias de Alimentos el Trébol" className="h-20 w-auto object-contain" />
                        </div>
                        <h2 className="text-3xl font-display font-semibold text-[color:var(--text-1)]">Bienvenido</h2>
                        <p className="text-[color:var(--text-2)] text-xs uppercase tracking-[0.2em] mt-2">
                            Sistema de Control de Acceso
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
                        <div className="group">
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 ml-1 uppercase tracking-[0.22em]">
                                Usuario
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    disabled={isLoading}
                                    className="input-tech"
                                    placeholder="Ingrese su usuario"
                                />
                            </div>
                        </div>

                        <div className="group">
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 ml-1 uppercase tracking-[0.22em]">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    className="input-tech pr-10"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] focus:outline-none"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end pt-1">
                            <Link
                                to="/forgot-password"
                                className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-3)] hover:text-[color:var(--accent-0)] transition-colors"
                            >
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-tech flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="animate-spin-slow" size={20} />
                                    <span>Verificando...</span>
                                </>
                            ) : (
                                <span>INGRESAR</span>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center animate-fadeIn" style={{ animationDelay: '0.4s' }}>
                        <p className="text-[10px] text-[color:var(--text-3)] uppercase tracking-[0.3em] font-medium">
                            Industrias de Alimentos el Trébol © System Control v1.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
