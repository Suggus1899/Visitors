import React from 'react';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Users from 'lucide-react/dist/esm/icons/users';
import Car from 'lucide-react/dist/esm/icons/car';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';

export interface Companion {
    name: string;
    cedula: string;
}

interface VehicleInfoStepProps {
    formData: {
        has_companion: boolean;
        companions: Companion[];
        has_vehicle: boolean;
        vehicle_brand: string;
        vehicle_model: string;
        vehicle_plate: string;
    };
    onFormDataChange: (field: string, value: string | boolean | Companion[]) => void;
    canProceed: boolean;
    onNext: () => void;
    onPrev: () => void;
    getInputClass: (valid: boolean | null) => string;
}

const VehicleInfoStep: React.FC<VehicleInfoStepProps> = ({
    formData, onFormDataChange, canProceed, onNext, onPrev, getInputClass
}) => {

    const updateCompanion = (index: number, field: keyof Companion, value: string) => {
        const updated = formData.companions.map((c, i) =>
            i === index ? { ...c, [field]: value } : c
        );
        onFormDataChange('companions', updated);
    };

    const addCompanion = () => {
        onFormDataChange('companions', [...formData.companions, { name: '', cedula: '' }]);
    };

    const removeCompanion = (index: number) => {
        const updated = formData.companions.filter((_, i) => i !== index);
        onFormDataChange('companions', updated);
    };

    return (
        <div className="space-y-6 animate-slideUp">

            {/* Acompañante Section */}
            <div className="p-4 rounded-xl border border-[color:var(--border-0)] bg-[color:var(--surface-2)] shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[color:var(--text-1)] font-semibold flex items-center gap-2">
                        <Users className="text-[color:var(--accent-0)]" size={18} />
                        ¿Viene con Acompañante?
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={formData.has_companion}
                            onChange={(e) => onFormDataChange('has_companion', e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-[color:var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--accent-0)]"></div>
                    </label>
                </div>

                {formData.has_companion && (
                    <div className="space-y-4 pt-2 border-t border-[color:var(--border-0)] animate-fadeIn">

                        {formData.companions.map((companion, index) => (
                            <div key={index} className="space-y-3 p-3 rounded-lg bg-[color:var(--surface-1)] border border-[color:var(--border-0)]">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-[color:var(--accent-0)] uppercase tracking-widest">
                                        Acompañante {index + 1}
                                    </span>
                                    {formData.companions.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeCompanion(index)}
                                            className="text-red-400 hover:text-red-500 transition-colors p-1 rounded"
                                            title="Eliminar acompañante"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                        Nombre <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={companion.name}
                                        onChange={(e) => updateCompanion(index, 'name', e.target.value)}
                                        placeholder="Ej: Juan Pérez"
                                        className={getInputClass(companion.name.trim().length > 2 ? true : companion.name.length === 0 ? null : false)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                        Cédula (Opcional)
                                    </label>
                                    <input
                                        type="text"
                                        value={companion.cedula}
                                        onChange={(e) => updateCompanion(index, 'cedula', e.target.value.replace(/\D/g, ''))}
                                        placeholder="Ej: 12345678"
                                        className={getInputClass(null)}
                                    />
                                </div>
                            </div>
                        ))}

                        <button
                            type="button"
                            onClick={addCompanion}
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border-2 border-dashed border-[color:var(--accent-0)] text-[color:var(--accent-0)] text-sm font-semibold hover:bg-[color:var(--accent-0)]/10 transition-colors"
                        >
                            <Plus size={16} /> Agregar Acompañante
                        </button>
                    </div>
                )}
            </div>

            {/* Vehículo Section */}
            <div className="p-4 rounded-xl border border-[color:var(--border-0)] bg-[color:var(--surface-2)] shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[color:var(--text-1)] font-semibold flex items-center gap-2">
                        <Car className="text-[color:var(--accent-0)]" size={18} />
                        ¿Ingresa con Vehículo?
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={formData.has_vehicle}
                            onChange={(e) => onFormDataChange('has_vehicle', e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-[color:var(--surface-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--accent-0)]"></div>
                    </label>
                </div>

                {formData.has_vehicle && (
                    <div className="space-y-4 pt-2 border-t border-[color:var(--border-0)] animate-fadeIn">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                    Marca <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.vehicle_brand}
                                    onChange={(e) => onFormDataChange('vehicle_brand', e.target.value)}
                                    placeholder="Ej: Toyota"
                                    className={getInputClass(formData.vehicle_brand.trim().length > 1 ? true : formData.vehicle_brand.length === 0 ? null : false)}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                    Modelo
                                </label>
                                <input
                                    type="text"
                                    value={formData.vehicle_model}
                                    onChange={(e) => onFormDataChange('vehicle_model', e.target.value)}
                                    placeholder="Ej: Corolla"
                                    className={getInputClass(null)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                Placa <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.vehicle_plate}
                                onChange={(e) => onFormDataChange('vehicle_plate', e.target.value.toUpperCase())}
                                placeholder="Ej: AB123CD"
                                className={getInputClass(formData.vehicle_plate.trim().length > 3 ? true : formData.vehicle_plate.length === 0 ? null : false)}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-4 pt-4 mt-6 border-t border-[color:var(--border-0)]">
                <button
                    type="button"
                    onClick={onPrev}
                    className="flex-1 btn-ghost flex items-center justify-center gap-2"
                >
                    <ArrowLeft size={16} /> Atrás
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!canProceed}
                    className="flex-1 btn-tech flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Continuar <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
};

export default VehicleInfoStep;
