import { Input } from './ui/input';
import { Button } from './ui/button';
import React, { useState } from 'react';
import api from '../services/api.v1';
import { Link } from 'react-router-dom';
import Mail from 'lucide-react/dist/esm/icons/mail';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';

const ForgotPassword = () => {
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            await api.post('/auth/forgot-password', { username });
            setMessage('✅ Si la cuenta tiene correo registrado, recibirás un enlace de recuperación.');
        } catch {
            setMessage('❌ No se pudo procesar la solicitud. Inténtalo nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-35" />
            <div className="absolute inset-0 bg-noise opacity-25 mix-blend-soft-light" />
            <div className="absolute -top-28 -left-28 h-72 w-72 rounded-full bg-[color:var(--accent-2)] opacity-20 blur-3xl" />
            <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[color:var(--accent-0)] opacity-15 blur-3xl" />

            <div className="panel-tech rounded-2xl p-8 w-full max-w-md relative z-10">
                <Link to="/login" className="flex items-center text-[color:var(--text-3)] hover:text-[color:var(--text-1)] mb-4 text-sm">
                    <ArrowLeft size={16} className="mr-1" /> Volver al Login
                </Link>
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-display text-[color:var(--text-1)]">Recuperar Contraseña</h2>
                    <p className="text-sm text-[color:var(--text-3)] mt-2">Ingresa tu usuario para enviarte un enlace de recuperación.</p>
                </div>

                {message && (
                    <div className={`p-3 rounded text-sm mb-4 border ${message.includes('✅') ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]' : 'border-red-400 text-red-300'} bg-[color:var(--surface-2)]`}>
                        {message}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 text-[color:var(--text-3)]" size={20} />
                        <Input
                            type="text"
                            placeholder="Nombre de usuario" aria-label="Nombre de usuario"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="input-tech pl-10"
                            required
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="btn-tech disabled:opacity-70 flex justify-center items-center"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'ENVIAR ENLACE'}
                    </Button>
                </form>

                <div className="mt-8 pt-6 border-t border-[color:var(--border-1)] text-center">
                    <Link to="/reset-password" className="text-xs text-[color:var(--accent-0)] hover:underline">
                        ¿Ya tienes un token? Ingresa aquí
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
