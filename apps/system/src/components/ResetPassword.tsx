import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import Key from 'lucide-react/dist/esm/icons/key';
import Lock from 'lucide-react/dist/esm/icons/lock';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';

const ResetPassword = () => {
    const [token, setToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post('/api/v1/auth/reset-password', { token, newPassword });
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch {
            alert('Error: El token es inválido o ha expirado.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-blueprint opacity-35" />
                <div className="absolute inset-0 bg-noise opacity-25 mix-blend-soft-light" />
                <div className="panel-tech rounded-2xl p-8 w-full max-w-md text-center relative z-10">
                    <CheckCircle className="mx-auto text-[color:var(--accent-0)] mb-4" size={64} />
                    <h2 className="text-2xl font-display text-[color:var(--text-1)] mb-2">¡Contraseña Actualizada!</h2>
                    <p className="text-[color:var(--text-3)] mb-6">Tu contraseña ha sido restablecida correctamente.</p>
                    <Link to="/login" className="block w-full btn-tech">IR AL LOGIN</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-35" />
            <div className="absolute inset-0 bg-noise opacity-25 mix-blend-soft-light" />
            <div className="panel-tech rounded-2xl p-8 w-full max-w-md relative z-10">
                <h2 className="text-2xl font-display text-center text-[color:var(--text-1)] mb-6">Nueva Contraseña</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="relative">
                        <Key className="absolute left-3 top-3 text-[color:var(--text-3)]" size={20} />
                        <input
                            type="text"
                            placeholder="Token de Seguridad"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            className="input-tech pl-10"
                            required
                        />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 text-[color:var(--text-3)]" size={20} />
                        <input
                            type="password"
                            placeholder="Nueva Contraseña"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="input-tech pl-10"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-tech disabled:opacity-70 flex justify-center items-center"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'CAMBIAR CONTRASEÑA'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;
