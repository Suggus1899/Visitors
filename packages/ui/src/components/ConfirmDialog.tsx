import React, { useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import X from 'lucide-react/dist/esm/icons/x';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: (notes?: string) => void;
    onCancel: () => void;
    variant?: 'danger' | 'warning' | 'info';
    notesLabel?: string;
    notesPlaceholder?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    onConfirm,
    onCancel,
    variant = 'warning',
    notesLabel,
    notesPlaceholder = 'Escribe un mensaje opcional...'
}) => {
    const [notes, setNotes] = useState('');

    if (!isOpen) return null;

    const colors = {
        danger: 'border-red-400 text-red-400 bg-red-500/10',
        warning: 'border-amber-400 text-amber-400 bg-amber-500/10',
        info: 'border-[color:var(--accent-0)] text-[color:var(--accent-0)] bg-[color:var(--accent-0)]/10'
    };

    const buttonColors = {
        danger: 'bg-red-500 hover:bg-red-600',
        warning: 'bg-amber-500 hover:bg-amber-600',
        info: 'bg-[color:var(--accent-0)] hover:bg-[color:var(--accent-1)]'
    };

    const handleConfirm = () => {
        onConfirm(notes.trim() || undefined);
        setNotes('');
    };

    const handleCancel = () => {
        setNotes('');
        onCancel();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="panel-tech rounded-2xl max-w-md w-full transform transition-all scale-100 animate-slideUp relative">
                {/* Accent bar */}
                <div className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl ${colors[variant].split(' ')[0]}`} />

                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full ${colors[variant]}`}>
                            <AlertTriangle size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-display uppercase tracking-[0.15em] text-[color:var(--text-1)] mb-2">
                                {title}
                            </h3>
                            <p className="text-sm text-[color:var(--text-2)] leading-relaxed">
                                {message}
                            </p>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="p-1.5 rounded-full text-[color:var(--text-3)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)] transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Optional notes textarea */}
                    {notesLabel !== undefined && (
                        <div className="mt-4">
                            <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-1.5">
                                {notesLabel}
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={notesPlaceholder}
                                rows={3}
                                className="w-full bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-1)] placeholder-[color:var(--text-3)] focus:outline-none focus:border-[color:var(--accent-0)] resize-none transition-colors"
                            />
                        </div>
                    )}

                    {/* Buttons */}
                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={handleCancel}
                            className="flex-1 btn-ghost py-2.5 text-sm font-semibold"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-[#081116] font-semibold text-sm transition-colors ${buttonColors[variant]}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
