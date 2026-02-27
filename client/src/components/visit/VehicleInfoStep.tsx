import React from 'react';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Users from 'lucide-react/dist/esm/icons/users';
import Car from 'lucide-react/dist/esm/icons/car';

interface VehicleInfoStepProps {
    formData: {
        has_companion: boolean;
        companion_name: string;
        companion_cedula: string;
        has_vehicle: boolean;
        vehicle_brand: string;
        vehicle_model: string;
        vehicle_plate: string;
    };
    onFormDataChange: (field: string, value: string | boolean) => void;
    canProceed: boolean;
    onNext: () => void;
    onPrev: () => void;
    getInputClass: (valid: boolean | null) => string;
}

const VehicleInfoStep: React.FC<VehicleInfoStepProps> = ({
    formData, onFormDataChange, canProceed, onNext, onPrev, getInputClass
}) => {
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
                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                Nombre del Acompañante <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.companion_name}
                                onChange={(e) => onFormDataChange('companion_name', e.target.value)}
                                placeholder="Ej: Juan Pérez"
                                className={getInputClass(formData.companion_name.trim().length > 2 ? true : formData.companion_name.length === 0 ? null : false)}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                Cédula del Acompañante (Opcional)
                            </label>
                            <input
                                type="text"
                                value={formData.companion_cedula}
                                onChange={(e) => onFormDataChange('companion_cedula', e.target.value.replace(/\D/g, ''))}
                                placeholder="Ej: 12345678"
                                className={getInputClass(null)}
                            />
                        </div>
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
