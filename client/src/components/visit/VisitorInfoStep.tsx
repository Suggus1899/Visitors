import React from 'react';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import Phone from 'lucide-react/dist/esm/icons/phone';

const COUNTRY_CODES = [
    { code: '+58', country: 'VE', flag: '🇻🇪' },
    { code: '+1', country: 'US', flag: '🇺🇸' },
    { code: '+57', country: 'CO', flag: '🇨🇴' },
    { code: '+52', country: 'MX', flag: '🇲🇽' },
    { code: '+34', country: 'ES', flag: '🇪🇸' },
    { code: '+55', country: 'BR', flag: '🇧🇷' },
];

interface VisitorInfoStepProps {
    formData: {
        company: string;
        job_title: string;
        phone: string;
    };
    phoneCode: string;
    companySuggestions: string[];
    showSuggestions: boolean;
    validation: { company: boolean | null; phone: boolean | null };
    canProceed: boolean;
    onCompanyChange: (value: string) => void;
    onCompanyFocus: () => void;
    onCompanyBlur: () => void;
    onSelectCompany: (company: string) => void;
    onFormDataChange: (field: string, value: string) => void;
    onPhoneCodeChange: (code: string) => void;
    onNext: () => void;
    onPrev: () => void;
    getInputClass: (valid: boolean | null) => string;
}

const VisitorInfoStep: React.FC<VisitorInfoStepProps> = ({
    formData, phoneCode, companySuggestions, showSuggestions,
    validation, canProceed, onCompanyChange, onCompanyFocus,
    onCompanyBlur, onSelectCompany, onFormDataChange,
    onPhoneCodeChange, onNext, onPrev, getInputClass
}) => {
    const filteredSuggestions = companySuggestions
        .filter(c => c.toLowerCase().includes(formData.company.toLowerCase()))
        .slice(0, 5);

    return (
        <div className="space-y-4 animate-slideUp">
            {/* Company with autocomplete */}
            <div className="relative">
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">Empresa *</label>
                <div className="relative">
                    <Building2 className="absolute left-3 top-3 text-[color:var(--text-3)]" size={18} />
                    <input
                        type="text"
                        placeholder="Nombre de la empresa"
                        value={formData.company}
                        onChange={(e) => onCompanyChange(e.target.value)}
                        onFocus={onCompanyFocus}
                        onBlur={onCompanyBlur}
                        className={`${getInputClass(validation.company)} pl-10`}
                        required
                    />
                </div>
                {showSuggestions && filteredSuggestions.length > 0 && (
                    <ul className="absolute z-10 w-full bg-[color:var(--surface-1)] border border-[color:var(--border-1)] rounded-lg shadow-lg mt-1 max-h-40 overflow-auto animate-slideDown">
                        {filteredSuggestions.map((company, i) => (
                            <li
                                key={i}
                                onClick={() => onSelectCompany(company)}
                                className="px-4 py-2 hover:bg-[color:var(--surface-2)] cursor-pointer text-sm text-[color:var(--text-1)]"
                            >
                                {company}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">Cargo</label>
                <input
                    type="text"
                    placeholder="Ej: Gerente, Técnico, etc."
                    value={formData.job_title}
                    onChange={(e) => onFormDataChange('job_title', e.target.value)}
                    className={getInputClass(null)}
                />
            </div>

            {/* Phone */}
            <div>
                <label className="block text-[11px] font-semibold text-[color:var(--text-2)] mb-2 uppercase tracking-[0.2em]">Teléfono</label>
                <div className="flex items-center">
                    <select
                        value={phoneCode}
                        onChange={(e) => onPhoneCodeChange(e.target.value)}
                        className="w-28 p-3 border border-[color:var(--border-1)] rounded-l bg-[color:var(--surface-0)] text-sm font-medium focus:outline-none cursor-pointer text-[color:var(--text-1)]"
                    >
                        {COUNTRY_CODES.map(cc => (
                            <option key={cc.code} value={cc.code}>
                                {cc.flag} {cc.code}
                            </option>
                        ))}
                    </select>
                    <div className="relative flex-1">
                        <Phone className="absolute left-3 top-3 text-[color:var(--text-3)]" size={18} />
                        <input
                            type="tel"
                            placeholder="4121234567"
                            value={formData.phone}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                onFormDataChange('phone', val);
                            }}
                            className={`${getInputClass(validation.phone)} pl-10 rounded-l-none`}
                        />
                    </div>
                </div>
            </div>

            <div className="flex gap-3">
                <button type="button" onClick={onPrev} className="flex-1 btn-ghost flex items-center justify-center gap-2">
                    <ArrowLeft size={18} /> Atrás
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!canProceed}
                    className="flex-1 btn-tech disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    Siguiente <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
};

export default VisitorInfoStep;
