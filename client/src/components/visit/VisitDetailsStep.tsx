import React from 'react';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Check from 'lucide-react/dist/esm/icons/check';
import PhotoCapture from '../PhotoCapture';

const VISIT_PURPOSES = [
    'Reunión',
    'Entrega',
    'Mantenimiento',
    'Capacitación',
    'Inspección',
    'Otro'
];

interface VisitDetailsStepProps {
    formData: {
        target_department: string;
        host_person: string;
        department: string;
        reason: string;
        photo_url: string;
        id_photo_url: string;
        consent_accepted: boolean;
    };
    loading: boolean;
    canSubmit: boolean;
    onFormDataChange: (field: string, value: string | boolean) => void;
    onPhotoCapture: (img: string) => void;
    onPhotoRetake: () => void;
    onIdPhotoCapture: (img: string) => void;
    onIdPhotoRetake: () => void;
    onPrev: () => void;
    onSaveStatus: (status: 'active' | 'waiting') => void;
    getInputClass: (valid: boolean | null) => string;
}

const VisitDetailsStep: React.FC<VisitDetailsStepProps> = ({
    formData, loading, canSubmit,
    onFormDataChange, onPhotoCapture, onPhotoRetake,
    onIdPhotoCapture, onIdPhotoRetake, onPrev, onSaveStatus, getInputClass
}) => {
    const hasPhoto = formData.photo_url.length > 0;
    const hasIdPhoto = formData.id_photo_url.length > 0;

    return (
        <div className="space-y-4 animate-slideUp">

            {/* ── Mandatory Step 4 fields ─────────────────────────────── */}
            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                    Área / Departamento a Visitar <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    placeholder="Ej: Recursos Humanos, Finanzas, Almacén..."
                    value={formData.target_department}
                    onChange={(e) => onFormDataChange('target_department', e.target.value)}
                    className={getInputClass(formData.target_department.trim() ? true : null)}
                    required
                />
            </div>

            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                    Persona a Visitar <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    placeholder="Ej: Ing. Carlos Machado, Dra. Ana Rodríguez..."
                    value={formData.host_person}
                    onChange={(e) => onFormDataChange('host_person', e.target.value)}
                    className={getInputClass(formData.host_person.trim() ? true : null)}
                    required
                />
            </div>

            {/* ── Purpose Dropdown ─────────────────────────────────────── */}
            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                    Motivo de la Visita <span className="text-red-500">*</span>
                </label>
                <select
                    value={formData.reason}
                    onChange={(e) => onFormDataChange('reason', e.target.value)}
                    className={`${getInputClass(formData.reason.trim() ? true : null)} w-full bg-[color:var(--surface-0)]`}
                    required
                >
                    <option value="">Seleccione un motivo...</option>
                    {VISIT_PURPOSES.map((purpose) => (
                        <option key={purpose} value={purpose}>{purpose}</option>
                    ))}
                </select>
                {formData.reason === 'Otro' && (
                    <input
                        type="text"
                        placeholder="Especifique el motivo..."
                        onChange={(e) => onFormDataChange('reason', `Otro: ${e.target.value}`)}
                        className={`${getInputClass(true)} w-full mt-2`}
                    />
                )}
            </div>

            <label className={`flex items-start gap-3 rounded-lg border p-3 ${formData.consent_accepted ? 'border-[color:var(--accent-0)] bg-[color:var(--surface-2)]' : 'border-red-400 bg-[color:var(--surface-2)]'}`}>
                <input
                    type="checkbox"
                    checked={formData.consent_accepted}
                    onChange={(e) => onFormDataChange('consent_accepted', e.target.checked)}
                    className="mt-1 h-4 w-4"
                />
                <span className="text-xs text-[color:var(--text-2)] leading-relaxed">
                    Confirmo que el visitante otorgo consentimiento expreso e informado para el tratamiento de datos personales y captura de fotografias segun el aviso de privacidad vigente.
                    <span className="text-red-500"> *</span>
                </span>
            </label>

            {/* Photo Section - REQUIRED */}
            <div className={`border-2 rounded-lg p-4 ${hasPhoto ? 'border-[color:var(--accent-0)] bg-[color:var(--surface-2)]' : 'border-red-400 bg-[color:var(--surface-2)]'}`}>
                <label className="block text-sm font-medium text-[color:var(--text-1)] mb-2 text-center">
                    📸 Foto del Rostro <span className="text-red-500">*</span>
                </label>
                {!hasPhoto && (
                    <p className="text-xs text-red-400 text-center mb-2">La foto del rostro es obligatoria</p>
                )}
                <PhotoCapture
                    onCapture={onPhotoCapture}
                    onRetake={onPhotoRetake}
                    initialImage={formData.photo_url}
                />
            </div>

            {/* ID Photo Section - REQUIRED */}
            <div className={`border-2 rounded-lg p-4 ${hasIdPhoto ? 'border-[color:var(--accent-0)] bg-[color:var(--surface-2)]' : 'border-red-400 bg-[color:var(--surface-2)]'}`}>
                <label className="block text-sm font-medium text-[color:var(--text-1)] mb-2 text-center">
                    🪪 Foto de Identificación <span className="text-red-500">*</span>
                </label>
                {!hasIdPhoto && (
                    <p className="text-xs text-red-400 text-center mb-2">La foto de Cédula/Carnet es obligatoria</p>
                )}
                <PhotoCapture
                    onCapture={onIdPhotoCapture}
                    onRetake={onIdPhotoRetake}
                    initialImage={formData.id_photo_url}
                />
            </div>

            <div className="flex flex-col gap-3 mt-4">
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onPrev}
                        className="flex-1 btn-ghost flex items-center justify-center gap-2 text-sm"
                    >
                        <ArrowLeft size={16} /> Atrás
                    </button>
                    <button
                        type="button"
                        onClick={() => onSaveStatus('waiting')}
                        disabled={loading || !canSubmit}
                        className="flex-1 rounded border-2 border-[color:var(--accent-0)] text-[color:var(--accent-0)] px-4 py-2 hover:bg-[color:var(--surface-3)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-sm font-bold tracking-wider"
                    >
                        {loading ? (
                            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                        ) : 'PONER EN ESPERA'}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => onSaveStatus('active')}
                    disabled={loading || !canSubmit}
                    className="w-full btn-tech disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-sm"
                >
                    {loading ? (
                        <>
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            Registrando...
                        </>
                    ) : (
                        <>
                            <Check size={18} />
                            REGISTRAR ENTRADA
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default VisitDetailsStep;
