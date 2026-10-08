import React from 'react';
import Search from 'lucide-react/dist/esm/icons/search';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import History from 'lucide-react/dist/esm/icons/history';

interface ValidationState {
    cedula: boolean | null;
    first_name: boolean | null;
    last_name: boolean | null;
}

interface VisitorLookupStepProps {
    cedula: string;
    cedulaError: string;
    formData: { first_name: string; last_name: string; photo_url: string; id_photo_url: string };
    validation: ValidationState;
    loading: boolean;
    canProceed: boolean;
    onCedulaChange: (value: string) => void;
    onSearch: () => void;
    onFormDataChange: (field: 'first_name' | 'last_name', value: string) => void;
    onShowHistory: () => void;
    onNext: () => void;
    getInputClass: (valid: boolean | null) => string;
}

const VisitorLookupStep: React.FC<VisitorLookupStepProps> = ({
    cedula, cedulaError, formData, validation, loading,
    canProceed, onCedulaChange, onSearch, onFormDataChange,
    onShowHistory, onNext, getInputClass
}) => (
    <div className="space-y-4 animate-slideUp">
        {/* Cédula search */}
        <div>
            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">Cédula de Identidad</label>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-2)] font-mono font-bold">V-</span>
                    <input
                        type="text"
                        placeholder="12345678"
                        value={cedula}
                        onChange={(e) => onCedulaChange(e.target.value)}
                        onBlur={onSearch}
                        maxLength={8}
                        className={`${getInputClass(validation.cedula)} font-mono pl-10`}
                    />
                </div>
                <button
                    type="button"
                    onClick={onSearch}
                    disabled={loading}
                    className="px-3 py-2 rounded-md bg-[color:var(--accent-1)] hover:bg-[color:var(--accent-0)] text-[#081116] transition disabled:opacity-50"
                    title="Buscar visitante"
                >
                    <Search size={18} />
                </button>
                {validation.cedula === true && (
                    <button
                        type="button"
                        onClick={onShowHistory}
                        className="px-3 py-2 rounded-md border border-[color:var(--border-1)] bg-[color:var(--surface-2)] text-[color:var(--accent-0)] hover:text-[color:var(--text-1)] transition"
                        title="Ver historial de visitas"
                    >
                        <History size={18} />
                    </button>
                )}
            </div>
            {cedulaError && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {cedulaError}
                </p>
            )}
        </div>

        {/* Existing visitor photo */}
        {validation.cedula === true && formData.photo_url && (
            <div className="flex items-center gap-4 p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)]">
                <img
                    src={formData.photo_url}
                    alt="Foto del visitante"
                    className="w-16 h-16 rounded-full object-cover border-2 border-[color:var(--accent-0)]"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                />
                <div className="w-16 h-16 rounded-full bg-[color:var(--surface-1)] flex items-center justify-center border-2 border-[color:var(--border-1)] flex-shrink-0 hidden">
                    <span className="text-[color:var(--text-3)] text-lg font-bold">
                        {(formData.first_name?.[0] || '?').toUpperCase()}
                    </span>
                </div>
                <div className="text-xs text-[color:var(--text-2)]">
                    <span className="text-[color:var(--accent-0)] font-semibold">Foto existente</span>
                    <br />Puede actualizarla en el paso final
                </div>
            </div>
        )}

        {/* Names */}
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">Nombres *</label>
                <input
                    type="text"
                    placeholder="Juan Carlos"
                    value={formData.first_name}
                    onChange={(e) => onFormDataChange('first_name', e.target.value)}
                    className={getInputClass(validation.first_name)}
                    required
                />
            </div>
            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">Apellidos *</label>
                <input
                    type="text"
                    placeholder="Pérez García"
                    value={formData.last_name}
                    onChange={(e) => onFormDataChange('last_name', e.target.value)}
                    className={getInputClass(validation.last_name)}
                    required
                />
            </div>
        </div>

        <button
            type="button"
            onClick={onNext}
            disabled={!canProceed}
            className="btn-tech disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            Siguiente <ArrowRight size={18} />
        </button>
    </div>
);

export default VisitorLookupStep;
