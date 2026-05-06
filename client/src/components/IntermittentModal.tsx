import React, { useState } from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';

interface IntermittentModalProps {
    isOpen: boolean;
    visitorName: string;
    mode: 'exit' | 'reentry';
    onConfirm: (notes: string) => void;
    onClose: () => void;
    loading?: boolean;
}

const IntermittentModal: React.FC<IntermittentModalProps> = ({
    isOpen, visitorName, mode, onConfirm, onClose, loading = false
}) => {
    const [notes, setNotes] = useState('');

    if (!isOpen) return null;

    const isExit = mode === 'exit';
    const title = isExit ? 'Salida Temporal' : 'Confirmar Reingreso';
    const description = isExit
        ? `¿Registrar salida temporal de ${visitorName}? El visitante pasará a estado Intermitente.`
        : `¿Confirmar reingreso de ${visitorName}? El visitante volverá a estado Activo.`;
    const confirmLabel = isExit ? 'REGISTRAR SALIDA TEMPORAL' : 'CONFIRMAR REINGRESO';

    const handleSubmit = () => {
        onConfirm(notes);
        setNotes('');
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div
                className="panel-tech rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all animate-slideUp"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] p-4">
                    <div className={`absolute inset-x-0 top-0 h-0.5 ${isExit ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={20} className={isExit ? 'text-amber-400' : 'text-emerald-400'} />
                            <h2 className="text-lg font-display uppercase tracking-[0.15em] text-[color:var(--text-1)]">{title}</h2>
                        </div>
                        <button onClick={onClose} className="p-1 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] rounded-full hover:bg-[color:var(--surface-1)] transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm text-[color:var(--text-2)]">{description}</p>

                    <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                            Motivo {isExit && <span className="text-[color:var(--text-3)]">(opcional)</span>}
                        </label>
                        <textarea
                            placeholder={isExit ? 'Ej: Salió a almorzar, fue al estacionamiento...' : 'Nota de reingreso (opcional)'}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="input-tech w-full"
                            rows={3}
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 btn-ghost text-sm"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 ${
                                isExit
                                    ? 'bg-amber-500/20 border border-amber-400 text-amber-300 hover:bg-amber-500/30'
                                    : 'bg-emerald-500/20 border border-emerald-400 text-emerald-300 hover:bg-emerald-500/30'
                            }`}
                        >
                            {loading ? (
                                <div className={`w-4 h-4 border-2 ${isExit ? 'border-amber-400' : 'border-emerald-400'} border-t-transparent rounded-full animate-spin`} />
                            ) : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IntermittentModal;
