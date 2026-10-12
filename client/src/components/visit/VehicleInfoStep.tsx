import { Input } from '../ui/input';
import { Button } from '../ui/button';
import React from 'react';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Car from 'lucide-react/dist/esm/icons/car';

interface VehicleInfoStepProps {
    formData: {
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
}) => (
    <div className="space-y-6 animate-slideUp">
        <p role="note" className="rounded-lg border border-[color:var(--border-0)] bg-[color:var(--surface-2)] p-3 text-sm text-[color:var(--text-2)]">
            Cada acompañante debe registrarse por separado, con sus propios datos, consentimiento y visita.
        </p>

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
                        aria-label="Ingresa con vehículo"
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
                            <Input
                                type="text"
                                value={formData.vehicle_brand}
                                aria-label="Marca del vehículo"
                                onChange={(e) => onFormDataChange('vehicle_brand', e.target.value)}
                                placeholder="Ej: Toyota"
                                className={getInputClass(formData.vehicle_brand.trim().length > 1 ? true : formData.vehicle_brand.length === 0 ? null : false)}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">
                                Modelo
                            </label>
                            <Input
                                type="text"
                                value={formData.vehicle_model}
                                aria-label="Modelo del vehículo"
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
                        <Input
                            type="text"
                            value={formData.vehicle_plate}
                            aria-label="Placa del vehículo"
                            onChange={(e) => onFormDataChange('vehicle_plate', e.target.value.toUpperCase())}
                            placeholder="Ej: AB123CD"
                            className={getInputClass(formData.vehicle_plate.trim().length > 3 ? true : formData.vehicle_plate.length === 0 ? null : false)}
                        />
                    </div>
                </div>
            )}
        </div>

        <div className="flex gap-4 pt-4 mt-6 border-t border-[color:var(--border-0)]">
            <Button type="button" onClick={onPrev} className="flex-1 btn-ghost flex items-center justify-center gap-2">
                <ArrowLeft size={16} /> Atrás
            </Button>
            <Button
                type="button"
                onClick={onNext}
                disabled={!canProceed}
                className="flex-1 btn-tech flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Continuar <ArrowRight size={16} />
            </Button>
        </div>
    </div>
);

export default VehicleInfoStep;
