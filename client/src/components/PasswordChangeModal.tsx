import { Input } from './ui/input';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { useState, useCallback, useMemo } from 'react';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle, Info } from 'lucide-react';
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
    { label: 'Máximo 72 bytes UTF-8', test: (p) => new TextEncoder().encode(p).length <= 72 },
    { label: 'Al menos una letra mayúscula', test: (p) => /[A-Z]/.test(p) },
    { label: 'Al menos una letra minúscula', test: (p) => /[a-z]/.test(p) },
    { label: 'Al menos un número', test: (p) => /[0-9]/.test(p) },
    { label: 'Al menos un carácter especial', test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

interface PasswordFieldProps {
    id: string;
    label: string;
    toggleLabel: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    autoComplete: string;
}

const PasswordField = ({ id, label, toggleLabel, placeholder, value, onChange, disabled, autoComplete }: PasswordFieldProps) => {
    const [visible, setVisible] = useState(false);
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[color:var(--text-2)]">{label}</label>
            <div className="relative">
                <Input
                    type={visible ? 'text' : 'password'}
                    id={id}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="input-tech w-full pr-10"
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    disabled={disabled}
                />
                <Button
                    type="button"
                    aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${toggleLabel}`}
                    onClick={() => setVisible(!visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] hover:text-[color:var(--accent-0)]"
                >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
            </div>
        </div>
    );
};

export const PasswordChangeModal = ({ show, onPasswordChanged }: PasswordChangeModalProps) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const metCount = useMemo(() => newPassword ? passwordRequirements.filter(req => req.test(newPassword)).length : 0, [newPassword]);
    const allMet = metCount === passwordRequirements.length;

    const formValidation = useMemo(() => {
        const validationErrors: string[] = [];
        if (!currentPassword) validationErrors.push('La contraseña actual es requerida');
        if (!newPassword) validationErrors.push('La nueva contraseña es requerida');
        if (newPassword !== confirmPassword) validationErrors.push('Las contraseñas no coinciden');
        if (!allMet) validationErrors.push('La nueva contraseña no cumple con todos los requisitos');
        return validationErrors;
    }, [currentPassword, newPassword, confirmPassword, allMet]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (formValidation.length > 0) {
            setErrors(formValidation);
            return;
        }

        setLoading(true);
        setErrors([]);
        try {
            await AuthAPI.changePassword({ currentPassword, newPassword, confirmPassword });
            toast.success('¡Contraseña cambiada exitosamente!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
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
    }, [formValidation, currentPassword, newPassword, confirmPassword, onPasswordChanged]);

    if (!show) return null;

    const edit = (setter: (value: string) => void) => (value: string) => { setter(value); setErrors([]); };
    const confirmState = !confirmPassword ? null : confirmPassword === newPassword;

    return (
        <Dialog open={show}>
            <DialogContent showCloseButton={false} onEscapeKeyDown={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()} className="max-h-[92vh] max-w-md overflow-y-auto rounded-2xl border border-[color:var(--border-1)] bg-[color:var(--surface-0)] p-0">
                <div className="bg-gradient-to-br from-[#14532d] via-[#166534] to-[#15803d] px-6 py-5 text-white">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white/15 p-2.5">
                            <Lock size={22} aria-hidden />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                                Cambio de Contraseña Requerido
                            </DialogTitle>
                            <DialogDescription className="mt-0.5 text-sm text-green-100">
                                Debes cambiar tu contraseña antes de continuar
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {errors.length > 0 && (
                        <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
                            <AlertCircle className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" size={16} aria-hidden />
                            <div className="flex-1">
                                {errors.map((error, index) => (
                                    <p key={index} className="text-sm text-red-800 dark:text-red-300">{error}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <PasswordField id="currentPassword" label="Contraseña Actual" toggleLabel="contraseña actual" placeholder="Ingresa tu contraseña actual" value={currentPassword} onChange={edit(setCurrentPassword)} disabled={loading} autoComplete="current-password" />
                        <PasswordField id="newPassword" label="Nueva Contraseña" toggleLabel="nueva contraseña" placeholder="Ingresa tu nueva contraseña" value={newPassword} onChange={edit(setNewPassword)} disabled={loading} autoComplete="new-password" />
                        <div>
                            <PasswordField id="confirmPassword" label="Confirmar Nueva Contraseña" toggleLabel="confirmación" placeholder="Confirma tu nueva contraseña" value={confirmPassword} onChange={edit(setConfirmPassword)} disabled={loading} autoComplete="new-password" />
                            <p aria-live="polite" className={`mt-1.5 min-h-5 text-xs font-medium ${confirmState ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                {confirmState === null ? '' : confirmState ? 'Las contraseñas coinciden.' : 'Todavía no coinciden.'}
                            </p>
                        </div>

                        <div className="rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-1)] p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-[color:var(--text-2)]">Requisitos de Contraseña:</h3>
                                <span className="text-xs font-medium text-[color:var(--text-3)]">{metCount} de {passwordRequirements.length}</span>
                            </div>
                            <div
                                role="progressbar"
                                aria-label="Requisitos cumplidos"
                                aria-valuemin={0}
                                aria-valuemax={passwordRequirements.length}
                                aria-valuenow={metCount}
                                className="mb-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-2)]"
                            >
                                <div className="h-full rounded-full bg-[color:var(--accent-1)] transition-[width] duration-200 ease-out" style={{ width: `${(metCount / passwordRequirements.length) * 100}%` }} />
                            </div>
                            <ul className="space-y-1.5">
                                {passwordRequirements.map((req) => {
                                    const isMet = Boolean(newPassword) && req.test(newPassword);
                                    return (
                                        <li key={req.label} className="flex items-center gap-2">
                                            {isMet ? (
                                                <CheckCircle className="shrink-0 text-[color:var(--accent-1)]" size={16} aria-hidden />
                                            ) : (
                                                <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-[color:var(--border-1)]" />
                                            )}
                                            <span data-met={isMet} className={`text-sm ${isMet ? 'font-medium text-[color:var(--accent-0)]' : 'text-[color:var(--text-3)]'}`}>
                                                {req.label}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="btn-tech btn-press w-full py-3 text-sm uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loading ? 'Cambiando Contraseña...' : 'Cambiar Contraseña'}
                        </Button>
                    </form>

                    <div className="mt-4 flex items-start gap-2 rounded-lg bg-[color:var(--surface-2)] p-3">
                        <Info size={16} className="mt-0.5 shrink-0 text-[color:var(--accent-0)]" aria-hidden />
                        <p className="text-xs text-[color:var(--text-2)]">
                            <strong>Nota:</strong> Esta ventana no se puede cerrar hasta que cambies tu contraseña.
                            Es un requisito de seguridad para proteger tu cuenta.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
