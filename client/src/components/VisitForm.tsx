import React, { useState, useEffect } from 'react';
import { VisitService } from '../services/api.v1';
import { Visitor } from '../types';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import { AxiosError } from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import VisitorHistoryModal from './VisitorHistoryModal';
import { BlockVisitorAlert } from './BlockVisitorAlert';
import { useSoundFeedback } from '../hooks/useSoundFeedback';
import { useVisitorQuery, useUpdateVisitorMutation } from '../hooks/useVisitQueries';
import WizardProgress from './visit/WizardProgress';
import VisitorLookupStep from './visit/VisitorLookupStep';
import VisitorInfoStep from './visit/VisitorInfoStep';
import VisitDetailsStep from './visit/VisitDetailsStep';
import VehicleInfoStep, { Companion } from './visit/VehicleInfoStep';

interface VisitFormProps {
    onVisitAdded: () => void;
}

interface ValidationState {
    cedula: boolean | null;
    first_name: boolean | null;
    last_name: boolean | null;
    company: boolean | null;
    phone: boolean | null;
}

const INITIAL_FORM_DATA = {
    first_name: '',
    last_name: '',
    company: '',
    job_title: '',
    phone: '',
    photo_url: '',
    id_photo_url: '',
    reason: '',

    // New mandatory Step 4 fields
    target_department: '',
    host_person: '',

    // Pase de Entrada
    has_companion: false,
    companions: [{ name: '', cedula: '' }] as Companion[],
    has_vehicle: false,
    vehicle_brand: '',
    vehicle_model: '',
    vehicle_plate: '',
    department: '',
    consent_accepted: false
};

const INITIAL_VALIDATION: ValidationState = {
    cedula: null, first_name: null, last_name: null,
    company: null, phone: null
};

const VisitForm: React.FC<VisitFormProps> = ({ onVisitAdded }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [cedula, setCedula] = useState('');
    const [cedulaError, setCedulaError] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [phoneCode, setPhoneCode] = useState('+58');
    const [formData, setFormData] = useState(INITIAL_FORM_DATA);
    const [loading, setLoading] = useState(false);
    const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [validation, setValidation] = useState<ValidationState>(INITIAL_VALIDATION);
    const [showBlockedAlert, setShowBlockedAlert] = useState(false);
    const [blockedReason, setBlockedReason] = useState('');
    const { playSuccess, playError } = useSoundFeedback();

    // Estado para tracking de datos originales del visitante (para detectar cambios)
    const [originalVisitorData, setOriginalVisitorData] = useState<Visitor | null>(null);
    const [hasVisitorDataChanged, setHasVisitorDataChanged] = useState(false);
    
    // Mutation para actualizar visitante
    const updateVisitorMutation = useUpdateVisitorMutation();

    // Query visitor with history when cedula changes (con prefijo V-)
    const fullCedula = cedula.length >= 7 ? `V-${cedula}` : null;
    const { data: visitorData, isLoading: isLoadingVisitor, refetch: refetchVisitor } = useVisitorQuery(fullCedula, true);

    // Fetch company suggestions once
    useEffect(() => {
        VisitService.getCompanies()
            .then(companies => setCompanySuggestions(companies || []))
            .catch(() => { /* Silently fail - not critical */ });
    }, []);

    const handleCedulaChange = (value: string) => {
        const numericValue = value.replace(/\D/g, '');
        setCedula(numericValue);
        if (numericValue.length === 0) {
            setValidation(v => ({ ...v, cedula: null })); setCedulaError('');
        } else if (numericValue.length < 7 || numericValue.length > 8) {
            setValidation(v => ({ ...v, cedula: false })); setCedulaError('La cédula debe tener 7-8 dígitos');
        } else {
            setValidation(v => ({ ...v, cedula: true })); setCedulaError('');
        }
    };

    const validateField = (name: string, value: string) => {
        switch (name) {
            case 'first_name':
            case 'last_name':
                setValidation(v => ({ ...v, [name]: value.trim().length >= 2 ? true : value.length === 0 ? null : false }));
                break;
            case 'company':
                setValidation(v => ({ ...v, company: value.trim().length >= 2 ? true : value.length === 0 ? null : false }));
                break;
            case 'phone':
                setValidation(v => ({ ...v, phone: value.length === 0 ? null : value.length >= 7 }));
                break;
        }
    };

    const handleSearch = async () => {
        if (!cedula || cedula.length < 7) {
            toast.error('Ingrese una cédula válida (7-8 dígitos)');
            return;
        }
        
        setLoading(true);
        
        try {
            // Forzar recarga de datos del visitante
            const result = await refetchVisitor();
            const freshData = result.data;
            
            if (freshData) {
                // Cargar datos del visitante encontrado
                const visitor = freshData as Visitor;
                
                // Guardar datos originales para detectar cambios
                setOriginalVisitorData(visitor);
                setHasVisitorDataChanged(false);
                
                setFormData(prev => ({
                    ...prev,
                    first_name: visitor.first_name || '',
                    last_name: visitor.last_name || '',
                    company: visitor.company,
                    job_title: visitor.job_title || '',
                    phone: visitor.phone || '',
                    photo_url: visitor.photo_url || '',
                    id_photo_url: visitor.id_photo_url || ''
                }));
                setValidation({ cedula: true, first_name: !!visitor.first_name, last_name: !!visitor.last_name, company: !!visitor.company, phone: null });
                
                // Si hay historial, cargar datos de la visita previa
                if ('history' in freshData && freshData.history && freshData.history.length > 0) {
                    const lastVisit = freshData.history[0];
                    setFormData(prev => ({
                        ...prev,
                        reason: lastVisit.purpose || prev.reason,
                        target_department: lastVisit.targetDepartment || prev.target_department,
                        department: lastVisit.targetDepartment || prev.department,
                        // Cargar datos del vehículo si existen
                        has_vehicle: !!lastVisit.vehiclePlate || prev.has_vehicle,
                        vehicle_brand: lastVisit.vehicleBrand || prev.vehicle_brand,
                        vehicle_model: lastVisit.vehicleModel || prev.vehicle_model,
                        vehicle_plate: lastVisit.vehiclePlate || prev.vehicle_plate,
                        // Cargar fotos si existen
                        photo_url: lastVisit.photo_url || prev.photo_url,
                        id_photo_url: lastVisit.id_photo_url || prev.id_photo_url,
                    }));
                    toast.success('Visitante encontrado con datos de visita previa');
                } else {
                    toast.success('Visitante encontrado');
                }
            } else {
                toast.error('Visitante no encontrado');
            }
        } catch {
            toast.error('Error al buscar visitante');
        } finally {
            setLoading(false);
        }
    };

    const handleLoadFromPreviousVisit = async () => {
        if (!cedula || cedula.length < 7) {
            toast.error('Ingrese una cédula válida primero');
            return;
        }
        
        setLoading(true);
        
        try {
            // Forzar recarga de datos del visitante
            const result = await refetchVisitor();
            const freshData = result.data;
            
            if (freshData && 'history' in freshData && freshData.history && freshData.history.length > 0) {
                // Obtener la visita más reciente
                const lastVisit = freshData.history[0];
                
                // Cargar datos de la visita previa al formulario
                setFormData(prev => ({
                    ...prev,
                    reason: lastVisit.purpose || prev.reason,
                    target_department: lastVisit.targetDepartment || prev.target_department,
                    department: lastVisit.targetDepartment || prev.department,
                    // Cargar datos del vehículo si existen
                    has_vehicle: !!lastVisit.vehiclePlate || prev.has_vehicle,
                    vehicle_brand: lastVisit.vehicleBrand || prev.vehicle_brand,
                    vehicle_model: lastVisit.vehicleModel || prev.vehicle_model,
                    vehicle_plate: lastVisit.vehiclePlate || prev.vehicle_plate,
                    // Cargar fotos si existen
                    photo_url: lastVisit.photo_url || prev.photo_url,
                    id_photo_url: lastVisit.id_photo_url || prev.id_photo_url,
                }));
                
                toast.success('Datos de visita previa cargados');
            }
            
            // Abrir el modal de historial
            setShowHistory(true);
        } catch {
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (status: 'active' | 'waiting') => {
        if (!formData.first_name || !formData.last_name || !cedula || !formData.reason.trim()) {
            toast.error('Complete los campos obligatorios'); return;
        }
        setLoading(true);
        try {
            // Si los datos del visitante cambiaron, actualizar primero
            if (hasVisitorDataChanged && originalVisitorData) {
                try {
                    // Detectar si la foto es base64 nueva o URL existente
                    const isNewPhoto = formData.photo_url.startsWith('data:');
                    const isNewIdPhoto = formData.id_photo_url.startsWith('data:');
                    await updateVisitorMutation.mutateAsync({
                        cedula: `V-${cedula}`,
                        data: {
                            first_name: formData.first_name,
                            last_name: formData.last_name,
                            company: formData.company,
                            job_title: formData.job_title,
                            phone: formData.phone,
                            ...(isNewPhoto && { photoBase64: formData.photo_url }),
                            ...(isNewIdPhoto && { idPhotoBase64: formData.id_photo_url }),
                        }
                    });
                    toast.success('Datos del visitante actualizados');
                } catch {
                    toast.error('Error al actualizar datos del visitante, pero continuará el registro');
                }
            }

            const fullPhone = formData.phone ? `${phoneCode}${formData.phone}` : '';

            // Serialize companions list into the single-value backend fields
            const activeCompanions = formData.has_companion
                ? formData.companions.filter(c => c.name.trim().length > 0)
                : [];
            const companionName  = activeCompanions.map(c => c.name.trim()).join(', ') || undefined;
            const companionCedula = activeCompanions.map(c => c.cedula.trim()).filter(Boolean).join(', ') || undefined;

            await VisitService.checkIn({
                visitorCedula: `V-${cedula}`,
                consent: {
                    accepted: formData.consent_accepted,
                    policyVersion: '1.0',
                    acceptedAt: new Date().toISOString()
                },
                visitorData: { firstName: formData.first_name, lastName: formData.last_name, company: formData.company, jobTitle: formData.job_title, phone: fullPhone, photoBase64: formData.photo_url, idPhotoBase64: formData.id_photo_url },
                purpose: formData.reason.trim(),
                personToVisit: formData.host_person || formData.department || 'Recepcion',
                targetDepartment: formData.target_department,
                hostPerson: formData.host_person,
                notes: '',
                status,
                companionName,
                companionCedula,
                vehicleBrand: formData.has_vehicle ? formData.vehicle_brand : undefined,
                vehicleModel: formData.has_vehicle ? formData.vehicle_model : undefined,
                vehiclePlate: formData.has_vehicle ? formData.vehicle_plate : undefined,
                department: formData.target_department || formData.department
            });
            playSuccess();
            
            if (status === 'waiting') {
                toast.success('¡Visita puesta en espera! Se mantendrá en la lista de pendientes.');
                // No reiniciar el formulario, solo notificar al padre y mantener datos
                onVisitAdded();
                // Volver al paso 1 pero mantener la cédula para continuar si es necesario
                setCurrentStep(1);
            } else {
                toast.success('¡Entrada registrada correctamente!');
                onVisitAdded();
                // Reiniciar completamente para nueva visita
                setCedula('');
                setCurrentStep(1);
                setFormData(INITIAL_FORM_DATA);
                setValidation(INITIAL_VALIDATION);
            }
        } catch (err: unknown) {
            const error = err as AxiosError<{ message?: string; error?: { message: string } }>;
            playError();
            const errorData = error.response?.data;
            const backendMessage = errorData?.error?.message || errorData?.message;
            toast.error(backendMessage || 'Error al registrar la visita. Intente nuevamente.');
            setLoading(false);
        }
    };

    const getInputClass = (valid: boolean | null) =>
        `input-tech ${valid === null ? 'border-[color:var(--border-1)]' : (valid ? 'border-[color:var(--accent-0)] ring-2 ring-[color:var(--accent-0)]/20' : 'border-red-400 ring-2 ring-red-500/20')}`;

    const canProceedStep1 = validation.cedula === true && validation.first_name === true && validation.last_name === true;
    const canProceedStep2 = validation.company === true;
    
    // Step 3 validation: if has_companion, every companion must have a name
    const canProceedStep3 =
        (!formData.has_companion || formData.companions.every(c => c.name.trim().length > 2)) &&
        (!formData.has_vehicle || (formData.vehicle_plate.length > 2 && formData.vehicle_brand.length > 2));
    
    // Step 4 (Photos, Department, Host & Consent)
    const canSubmit = canProceedStep1 && canProceedStep2 && canProceedStep3
        && formData.photo_url.length > 0
        && formData.id_photo_url.length > 0
        && formData.target_department.trim().length > 0
        && formData.host_person.trim().length > 0
        && formData.reason.trim().length > 0
        && formData.consent_accepted === true;

    // Show blocked alert if visitor is blocked
    useEffect(() => {
        if (visitorData && 'isBlocked' in visitorData && visitorData.isBlocked) {
            setShowBlockedAlert(true);
            setBlockedReason(visitorData.observations || '');
            playError();
        } else {
            setShowBlockedAlert(false);
            setBlockedReason('');
        }
    }, [visitorData, playError]);

    // Detectar cambios en los datos del visitante comparando con originales
    useEffect(() => {
        if (!originalVisitorData) {
            setHasVisitorDataChanged(false);
            return;
        }

        const hasChanged = 
            formData.first_name !== (originalVisitorData.first_name || '') ||
            formData.last_name !== (originalVisitorData.last_name || '') ||
            formData.company !== (originalVisitorData.company || '') ||
            formData.job_title !== (originalVisitorData.job_title || '') ||
            formData.phone !== (originalVisitorData.phone || '') ||
            formData.photo_url !== (originalVisitorData.photo_url || '') ||
            formData.id_photo_url !== (originalVisitorData.id_photo_url || '');

        setHasVisitorDataChanged(hasChanged);
    }, [formData, originalVisitorData]);

    return (
        <div className="panel-tech p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-[color:var(--accent-0)]" />
            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 3000,
                    style: { background: 'var(--surface-1)', color: 'var(--text-1)', borderRadius: '10px', border: '1px solid var(--border-1)' },
                    success: { iconTheme: { primary: '#4dd7ff', secondary: '#081116' } },
                    error: { iconTheme: { primary: '#ff6b6b', secondary: '#0b0f12' } }
                }}
            />

            {showBlockedAlert && (
                <div className="mb-4 animate-slideUp">
                    <BlockVisitorAlert
                        observations={blockedReason}
                        onDismiss={() => setShowBlockedAlert(false)}
                    />
                </div>
            )}

            {/* Show visitor history summary if visitor exists */}
            {visitorData && !showBlockedAlert && 'history' in visitorData && visitorData.history && visitorData.history.length > 0 && (
                <div className="mb-4 p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)] animate-slideUp">
                    <p className="text-xs text-[color:var(--text-2)] mb-2">
                        Historial: <strong className="text-[color:var(--text-1)]">{visitorData.history.length}</strong> visita{visitorData.history.length !== 1 ? 's' : ''} previa{visitorData.history.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {visitorData.history.slice(0, 3).map((visit, idx) => (
                            <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-[color:var(--surface-1)] text-[color:var(--text-3)]">
                                {visit.purpose} · {new Date(visit.checkInTime).toLocaleDateString()}
                            </span>
                        ))}
                        {visitorData.history.length > 3 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[color:var(--surface-1)] text-[color:var(--text-3)]">
                                +{visitorData.history.length - 3} más
                            </span>
                        )}
                    </div>
                </div>
            )}

            <VisitorHistoryModal
                cedula={cedula}
                visitorName={`${formData.first_name} ${formData.last_name}`.trim() || 'Visitante'}
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                company={formData.company}
                photoUrl={formData.photo_url || undefined}
            />

            <h2 className="text-lg font-display uppercase tracking-[0.2em] mb-4 flex items-center text-[color:var(--text-1)]">
                <UserPlus className="mr-2 text-[color:var(--accent-0)]" /> Registrar Entrada
            </h2>

            <WizardProgress currentStep={currentStep} />

            <form onSubmit={(e) => e.preventDefault()}>
                {currentStep === 1 && (
                    <VisitorLookupStep
                        cedula={cedula}
                        cedulaError={cedulaError}
                        formData={formData}
                        validation={validation}
                        loading={loading || isLoadingVisitor}
                        canProceed={canProceedStep1}
                        onCedulaChange={handleCedulaChange}
                        onSearch={handleSearch}
                        onFormDataChange={(field, value) => {
                            setFormData(prev => ({ ...prev, [field]: value }));
                            validateField(field, value);
                        }}
                        onShowHistory={handleLoadFromPreviousVisit}
                        onNext={() => setCurrentStep(s => Math.min(s + 1, 3))}
                        getInputClass={getInputClass}
                    />
                )}
                {currentStep === 2 && (
                    <VisitorInfoStep
                        formData={formData}
                        phoneCode={phoneCode}
                        companySuggestions={companySuggestions}
                        showSuggestions={showSuggestions}
                        validation={validation}
                        canProceed={canProceedStep2}
                        onCompanyChange={(value) => {
                            setFormData(prev => ({ ...prev, company: value }));
                            validateField('company', value);
                            setShowSuggestions(value.length > 0);
                        }}
                        onCompanyFocus={() => setShowSuggestions(formData.company.length > 0)}
                        onCompanyBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        onSelectCompany={(company) => {
                            setFormData(prev => ({ ...prev, company }));
                            setValidation(v => ({ ...v, company: true }));
                            setShowSuggestions(false);
                        }}
                        onFormDataChange={(field, value) => {
                            setFormData(prev => ({ ...prev, [field]: value }));
                            validateField(field, value);
                        }}
                        onPhoneCodeChange={setPhoneCode}
                        onNext={() => setCurrentStep(s => Math.min(s + 1, 4))}
                        onPrev={() => setCurrentStep(s => Math.max(s - 1, 1))}
                        getInputClass={getInputClass}
                    />
                )}
                {currentStep === 3 && (
                    <VehicleInfoStep
                        formData={formData}
                        onFormDataChange={(field, value) => setFormData(prev => ({ ...prev, [field]: value }))}
                        canProceed={canProceedStep3}
                        onNext={() => setCurrentStep(s => Math.min(s + 1, 4))}
                        onPrev={() => setCurrentStep(s => Math.max(s - 1, 1))}
                        getInputClass={getInputClass}
                    />
                )}
                {currentStep === 4 && (
                    <VisitDetailsStep
                        formData={formData}
                        loading={loading}
                        canSubmit={canSubmit}
                        onFormDataChange={(field, value) => setFormData(prev => ({ ...prev, [field]: value }))}
                        onPhotoCapture={(img) => setFormData(prev => ({ ...prev, photo_url: img }))}
                        onPhotoRetake={() => setFormData(prev => ({ ...prev, photo_url: '' }))}
                        onIdPhotoCapture={(img) => setFormData(prev => ({ ...prev, id_photo_url: img }))}
                        onIdPhotoRetake={() => setFormData(prev => ({ ...prev, id_photo_url: '' }))}
                        onPrev={() => setCurrentStep(s => Math.max(s - 1, 1))}
                        onSaveStatus={handleSubmit}
                        getInputClass={getInputClass}
                    />
                )}
            </form>
        </div>
    );
};

export default VisitForm;
