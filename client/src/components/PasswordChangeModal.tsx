import { useState } from 'react';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { AuthAPI } from '../services/api.v1';
import toast from 'react-hot-toast';

interface PasswordChangeModalProps {
    show: boolean;
    onPasswordChanged: () => void;
}

interface PasswordRequirement {
    label: string;
    test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
    { label: 'Mínimo 12 caracteres', test: (p) => p.length >= 12 },
    { label: 'Máximo 128 caracteres', test: (p) => p.length <= 128 },
    { label: 'Al menos una letra mayúscula', test: (p) => /[A-Z]/.test(p) },
    { label: 'Al menos una letra minúscula', test: (p) => /[a-z]/.test(p) },
    { label: 'Al menos un número', test: (p) => /[0-9]/.test(p) },
    { label: 'Al menos un carácter especial', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export const PasswordChangeModal = ({ show, onPasswordChanged }: PasswordChangeModalProps) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    if (!show) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors([]);

        // Client-side validation
        const validationErrors: string[] = [];

        if (!currentPassword) {
            validationErrors.push('La contraseña actual es requerida');
        }

        if (!newPassword) {
            validationErrors.push('La nueva contraseña es requerida');
        }

        if (newPassword !== confirmPassword) {
            validationErrors.push('Las contraseñas no coinciden');
        }

        // Check password requirements
        const failedRequirements = passwordRequirements.filter(req => !req.test(newPassword));
        if (failedRequirements.length > 0) {
            validationErrors.push('La nueva contraseña no cumple con todos los requisitos');
        }

        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            return;
        }

        setLoading(true);

        try {
            // Call the password change endpoint
            await AuthAPI.changePassword({
                currentPassword,
                newPassword,
                confirmPassword
            });

            // Show success toast
            toast.success('¡Contraseña cambiada exitosamente!');

            // Clear form
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');

            // Close modal and allow navigation
            onPasswordChanged();
        } catch (error: unknown) {
            const axiosError = error as { response?: { data?: { error?: { details?: string[]; message?: string } } } };
            const serverErrors = axiosError.response?.data?.error?.details || [
                axiosError.response?.data?.error?.message || 'Error al cambiar la contraseña'
            ];
            setErrors(Array.isArray(serverErrors) ? serverErrors : [serverErrors]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[color:var(--surface-0)] border border-[color:var(--border-1)] rounded-lg shadow-2xl w-full max-w-md mx-4 p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-[color:var(--accent-0)]/10 rounded-lg">
                        <Lock className="text-[color:var(--accent-0)]" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-display uppercase tracking-wider text-[color:var(--text-1)]">
                            Cambio de Contraseña Requerido
                        </h2>
                        <p className="text-sm text-[color:var(--text-3)] mt-1">
                            Debes cambiar tu contraseña antes de continuar
                        </p>
                    </div>
                </div>

                {/* Error Messages */}
                {errors.length > 0 && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                            <div className="flex-1">
                                {errors.map((error, index) => (
                                    <p key={index} className="text-sm text-red-400">
                                        {error}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Current Password */}
                    <div>
                        <label className="block text-sm font-medium text-[color:var(--text-2)] mb-2">
                            Contraseña Actual
                        </label>
                        <div className="relative">
                            <input
                                type={showCurrentPassword ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="input-tech w-full pr-10"
                                placeholder="Ingresa tu contraseña actual"
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] transition-colors"
                            >
                                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* New Password */}
                    <div>
                        <label className="block text-sm font-medium text-[color:var(--text-2)] mb-2">
                            Nueva Contraseña
                        </label>
                        <div className="relative">
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="input-tech w-full pr-10"
                                placeholder="Ingresa tu nueva contraseña"
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] transition-colors"
                            >
                                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label className="block text-sm font-medium text-[color:var(--text-2)] mb-2">
                            Confirmar Nueva Contraseña
                        </label>
                        <div className="relative">
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="input-tech w-full pr-10"
                                placeholder="Confirma tu nueva contraseña"
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] transition-colors"
                            >
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Password Requirements */}
                    <div className="bg-[color:var(--surface-1)] border border-[color:var(--border-1)] rounded-md p-4">
                        <h3 className="text-sm font-semibold text-[color:var(--text-2)] mb-3">
                            Requisitos de Contraseña:
                        </h3>
                        <div className="space-y-2">
                            {passwordRequirements.map((req, index) => {
                                const isMet = newPassword && req.test(newPassword);
                                return (
                                    <div key={index} className="flex items-center gap-2">
                                        {isMet ? (
                                            <CheckCircle className="text-green-500 flex-shrink-0" size={16} />
                                        ) : (
                                            <div className="w-4 h-4 rounded-full border-2 border-[color:var(--border-1)] flex-shrink-0" />
                                        )}
                                        <span className={`text-sm ${isMet ? 'text-green-400' : 'text-[color:var(--text-3)]'}`}>
                                            {req.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[color:var(--accent-0)] hover:bg-[color:var(--accent-1)] text-[#081116] font-semibold py-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                    >
                        {loading ? 'Cambiando Contraseña...' : 'Cambiar Contraseña'}
                    </button>
                </form>

                {/* Info Note */}
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
                    <p className="text-xs text-blue-400">
                        <strong>Nota:</strong> Esta ventana no se puede cerrar hasta que cambies tu contraseña.
                        Es un requisito de seguridad para proteger tu cuenta.
                    </p>
                </div>
            </div>
        </div>
    );
};
