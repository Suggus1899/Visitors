import React from 'react';
import Check from 'lucide-react/dist/esm/icons/check';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import FileText from 'lucide-react/dist/esm/icons/file-text';

const STEPS = [
    { id: 1, title: 'Identificación', icon: UserPlus },
    { id: 2, title: 'Información', icon: Building2 },
    { id: 3, title: 'Extra', icon: FileText },
    { id: 4, title: 'Visita', icon: FileText }
];

interface WizardProgressProps {
    currentStep: number;
}

const WizardProgress: React.FC<WizardProgressProps> = ({ currentStep }) => {
    const progressPercent = ((currentStep - 1) / 2) * 100;

    return (
        <div className="mb-6">
            <div className="wizard-progress">
                <div className="wizard-progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="flex justify-between mt-3">
                {STEPS.map((step) => (
                    <div key={step.id} className="flex flex-col items-center">
                        <div
                            className={`step-indicator ${currentStep > step.id ? 'step-completed' :
                                currentStep === step.id ? 'step-active' : 'step-pending'
                                }`}
                        >
                            {currentStep > step.id ? <Check size={16} /> : step.id}
                        </div>
                        <span className={`text-[11px] uppercase tracking-[0.16em] mt-2 ${currentStep >= step.id ? 'text-[color:var(--text-1)] font-semibold' : 'text-[color:var(--text-3)]'}`}>
                            {step.title}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WizardProgress;
