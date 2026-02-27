import React from 'react';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Check from 'lucide-react/dist/esm/icons/check';
import PhotoCapture from '../PhotoCapture';

interface VisitDetailsStepProps {
    reason: string;
    photoUrl: string;
    loading: boolean;
    canSubmit: boolean;
    onReasonChange: (value: string) => void;
    onPhotoCapture: (img: string) => void;
    onPhotoRetake: () => void;
    onPrev: () => void;
    getInputClass: (valid: boolean | null) => string;
}

const VisitDetailsStep: React.FC<VisitDetailsStepProps> = ({
    reason, photoUrl, loading, canSubmit,
    onReasonChange, onPhotoCapture, onPhotoRetake, onPrev, getInputClass
}) => {
    const hasPhoto = photoUrl.length > 0;

    return (
        <div className="space-y-4 animate-slideUp">
            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                    Motivo de Visita <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    placeholder="Ej: Reunión, Entrega, Mantenimiento..."
                    value={reason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    className={getInputClass(reason.trim() ? true : null)}
                    required
                />
            </div>

            {/* Photo Section - REQUIRED */}
            <div className={`border-2 rounded-lg p-4 ${hasPhoto ? 'border-[color:var(--accent-0)] bg-[color:var(--surface-2)]' : 'border-red-400 bg-[color:var(--surface-2)]'}`}>
                <label className="block text-sm font-medium text-[color:var(--text-1)] mb-2 text-center">
                    📸 Foto del Visitante <span className="text-red-500">*</span>
                </label>
                {!hasPhoto && (
                    <p className="text-xs text-red-400 text-center mb-2">La foto es obligatoria para registrar el acceso</p>
                )}
                <PhotoCapture
                    onCapture={onPhotoCapture}
                    onRetake={onPhotoRetake}
                    initialImage={photoUrl}
                />
            </div>

            <div className="flex gap-3 mt-4">
                <button
                    type="button"
                    onClick={onPrev}
                    className="flex-1 btn-ghost flex items-center justify-center gap-2 text-sm"
                >
                    <ArrowLeft size={16} /> Atrás
                </button>
                <button
                    type="submit"
                    disabled={loading || !canSubmit}
                    className="flex-[2] btn-tech disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-sm"
                >
                    {loading ? (
                        <>
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            Registrando...
                        </>
                    ) : (
                        <>
                            <Check size={18} />
                            REGISTRAR ACCESO
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default VisitDetailsStep;
