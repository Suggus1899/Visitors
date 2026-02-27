import React from 'react';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Check from 'lucide-react/dist/esm/icons/check';
import PhotoCapture from '../PhotoCapture';

interface VisitDetailsStepProps {
    formData: {
        area: string;
        action: string;
        department: string;
        photo_url: string;
        id_photo_url: string;
    };
    loading: boolean;
    canSubmit: boolean;
    onFormDataChange: (field: string, value: string) => void;
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
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                        Área de Visita <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={formData.area}
                        onChange={(e) => onFormDataChange('area', e.target.value)}
                        className={`${getInputClass(formData.area !== 'Ninguna' ? true : null)} bg-transparent appearance-none`}
                    >
                        <option value="Ninguna">Seleccione área...</option>
                        <option value="Oficina">Oficina</option>
                        <option value="Planta">Planta</option>
                        <option value="Almacén">Almacén</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                        Acción a Realizar
                    </label>
                    <select
                        value={formData.action}
                        onChange={(e) => onFormDataChange('action', e.target.value)}
                        className={`${getInputClass(null)} bg-transparent appearance-none`}
                    >
                        <option value="Ninguna">Ninguna acción</option>
                        <option value="Carga">Carga de Mercancía</option>
                        <option value="Descarga">Descarga de Mercancía</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                    Dpto / Persona a Visitar <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    placeholder="Ej: RRHH, Ing. Carlos Machado..."
                    value={formData.department}
                    onChange={(e) => onFormDataChange('department', e.target.value)}
                    className={getInputClass(formData.department.trim() ? true : null)}
                    required
                />
            </div>

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
