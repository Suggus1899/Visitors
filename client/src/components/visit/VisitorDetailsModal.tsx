
import { X, Building2, UserCircle2, Briefcase, FileText, Clock, UserCheck, Car, Users, Lock, Save, Pencil, History } from 'lucide-react';
import type { Visit } from '../../types';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { sanitizeInput } from '../../utils/sanitizer';
import { VisitService, type EditHistoryEntry } from '../../services/api.v1';
import toast from 'react-hot-toast';

interface VisitorDetailsModalProps {
  visit: Visit | null;
  isOpen: boolean;
  onClose: () => void;
  onVisitorUpdated?: () => void;
}

const InfoRow = ({ label, value }: { label: string; value: string | React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.18em]">{label}</span>
    <span className="text-sm font-medium text-[color:var(--text-1)]">{value}</span>
  </div>
);

const IconRow = ({
  icon: Icon,
  label,
  value,
  iconClass = 'text-[color:var(--accent-0)]',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconClass?: string;
}) => (
  <div className="flex items-start gap-3">
    <div className={`mt-0.5 flex-shrink-0 ${iconClass}`}>
      <Icon size={15} />
    </div>
    <InfoRow label={label} value={value} />
  </div>
);

const EditField = ({ label, name, value, onChange, type = 'text' }: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  type?: string;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.18em]">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(name, e.target.value)}
      className="input-tech px-3 py-2 rounded-lg text-sm text-[color:var(--text-1)] border border-[color:var(--border-1)] bg-[color:var(--surface-0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-0)]/20"
    />
  </div>
);

const FIELD_LABELS: Record<string, string> = {
  first_name: 'Nombre',
  last_name: 'Apellido',
  company: 'Empresa',
  job_title: 'Cargo',
  email: 'Email',
  phone: 'Teléfono',
  observations: 'Observaciones',
  isBlocked: 'Bloqueado',
};

export function VisitorDetailsModal({ visit, isOpen, onClose, onVisitorUpdated }: VisitorDetailsModalProps) {
  const [photoError, setPhotoError] = useState(false);
  const [idPhotoError, setIdPhotoError] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([]);
  const [editFormData, setEditFormData] = useState({
    first_name: '',
    last_name: '',
    company: '',
    job_title: '',
    email: '',
    phone: '',
    observations: '',
    isBlocked: false,
  });

  useEffect(() => {
    if (isOpen) {
      setPhotoError(false);
      setIdPhotoError(false);
      setIsEditMode(false);
      setShowPasswordPrompt(false);
      setEditPassword('');
    }
  }, [isOpen, visit]);

  // Load edit history when modal opens
  useEffect(() => {
    if (isOpen && visit) {
      // If we have a real visitId, use it; otherwise fetch by cedula (visitor profile view)
      if (visit.id && visit.id > 0) {
        VisitService.getEditHistory(visit.id)
          .then(setEditHistory)
          .catch(() => setEditHistory([]));
      } else if (visit.visitor_cedula) {
        VisitService.getEditHistoryByCedula(visit.visitor_cedula)
          .then(setEditHistory)
          .catch(() => setEditHistory([]));
      }
    }
  }, [isOpen, visit]);

  // Hooks must be called unconditionally before any early return
  const sanitizedFirstName = useMemo(() => sanitizeInput(visit?.Visitor?.first_name || ''), [visit]);
  const sanitizedLastName = useMemo(() => sanitizeInput(visit?.Visitor?.last_name || ''), [visit]);
  const sanitizedCompany = useMemo(() => sanitizeInput(visit?.Visitor?.company || 'Independiente'), [visit]);
  const sanitizedJobTitle = useMemo(() => sanitizeInput(visit?.Visitor?.job_title || 'N/A'), [visit]);
  const sanitizedCedula = useMemo(() => sanitizeInput(visit?.visitor_cedula || '—'), [visit]);
  const sanitizedPersonToVisit = useMemo(() => sanitizeInput(visit?.person_to_visit || ''), [visit]);
  const sanitizedPurpose = useMemo(() => sanitizeInput(visit?.purpose || ''), [visit]);

  // Build photo URLs dynamically from cédula — photos are stored as BLOB in DB,
  // so photo_url/id_photo_url fields are always null. We use the BLOB endpoints.
  const cedulaForPhotos = visit?.visitor_cedula || visit?.Visitor?.cedula || '';
  const visitorPhotoUrl = useMemo(() => {
    if (!cedulaForPhotos) return null;
    if (visit?.Visitor?.photo_url) return visit.Visitor.photo_url;
    return VisitService.getVisitorPhotoUrl(cedulaForPhotos);
  }, [cedulaForPhotos, visit]);
  const visitorIdPhotoUrl = useMemo(() => {
    if (!cedulaForPhotos) return null;
    if (visit?.Visitor?.id_photo_url) return visit.Visitor.id_photo_url;
    return VisitService.getVisitorIdPhotoUrl(cedulaForPhotos);
  }, [cedulaForPhotos, visit]);

  const handleEditClick = useCallback(() => {
    setShowPasswordPrompt(true);
    setEditPassword('');
  }, []);

  const handleVerifyPassword = useCallback(async () => {
    if (!editPassword) {
      toast.error('Ingrese la contraseña de edición');
      return;
    }
    setVerifyingPassword(true);
    try {
      const valid = await VisitService.verifyEditPassword(editPassword);
      if (valid) {
        // Populate form with current visitor data
        setEditFormData({
          first_name: visit?.Visitor?.first_name || '',
          last_name: visit?.Visitor?.last_name || '',
          company: visit?.Visitor?.company || '',
          job_title: visit?.Visitor?.job_title || '',
          email: visit?.Visitor?.email || '',
          phone: visit?.Visitor?.phone || '',
          observations: visit?.Visitor?.observations || '',
          isBlocked: visit?.Visitor?.isBlocked || false,
        });
        setIsEditMode(true);
        setShowPasswordPrompt(false);
        setEditPassword('');
        toast.success('Contraseña validada — modo edición activado');
      } else {
        toast.error('Contraseña incorrecta');
      }
    } catch {
      toast.error('Error al validar la contraseña');
    } finally {
      setVerifyingPassword(false);
    }
  }, [editPassword, visit]);

  const handleEditFieldChange = useCallback((name: string, value: string) => {
    setEditFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!visit?.visitor_cedula) return;
    setSaving(true);
    try {
      await VisitService.updateVisitor(visit.visitor_cedula, {
        firstName: editFormData.first_name,
        lastName: editFormData.last_name,
        company: editFormData.company,
        jobTitle: editFormData.job_title,
        email: editFormData.email,
        phone: editFormData.phone,
        observations: editFormData.observations,
        isBlocked: editFormData.isBlocked,
        visitId: visit.id,
      });
      toast.success('Cambios guardados correctamente');
      setIsEditMode(false);
      // Reload edit history
      if (visit.id && visit.id > 0) {
        const history = await VisitService.getEditHistory(visit.id);
        setEditHistory(history);
      } else if (visit.visitor_cedula) {
        const history = await VisitService.getEditHistoryByCedula(visit.visitor_cedula);
        setEditHistory(history);
      }
      // Notify parent to refresh data
      onVisitorUpdated?.();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Error al guardar los cambios';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [visit, editFormData, onVisitorUpdated]);

  const handleCancelEdit = useCallback(() => {
    setIsEditMode(false);
  }, []);

  if (!isOpen || !visit) return null;

  const statusLabel = visit.status === 'active' ? 'Activa' : visit.status === 'waiting' ? 'En Espera' : 'Completada';
  const statusColor = visit.status === 'active'
    ? 'text-[color:var(--status-success)] bg-[color:var(--status-success)]/10 border-[color:var(--status-success)]/30'
    : visit.status === 'waiting'
    ? 'text-[color:var(--status-warning)] bg-[color:var(--status-warning)]/10 border-[color:var(--status-warning)]/30'
    : 'text-[color:var(--text-3)] bg-[color:var(--surface-3)] border-[color:var(--border-1)]';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="panel-tech rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative">

        {/* Accent bar top */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)]" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-1)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <UserCircle2 className="text-[color:var(--accent-0)] size={22}" />
            <div>
              <h2 className="text-base font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">
                {isEditMode ? 'Editar Visitante' : 'Detalles de la Visita'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold uppercase tracking-[0.18em] border px-2 py-1 rounded-full ${statusColor}`}>
              {statusLabel}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-[color:var(--text-3)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoRow label="Visitante" value={`${sanitizedFirstName} ${sanitizedLastName}`.trim() || '—'} />
            <InfoRow label="Documento" value={sanitizedCedula} />
            <InfoRow label="Estado" value={statusLabel} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[minmax(250px,320px)_1fr] gap-6">

            {/* LEFT: Photos */}
            <div className="space-y-5">
              {/* Visitor photo */}
              <div>
                <p className="text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.18em] mb-2">
                  Fotografía del Visitante
                </p>
                {visitorPhotoUrl && !photoError ? (
                  <div className="aspect-square w-full sm:w-56 rounded-xl overflow-hidden border border-[color:var(--border-1)] bg-[color:var(--surface-2)] shadow-inner">
                    <img
                      src={visitorPhotoUrl}
                      alt={`Foto de ${sanitizedFirstName}`}
                      className="w-full h-full object-cover"
                      onError={() => setPhotoError(true)}
                    />
                  </div>
                ) : (
                  <div className="aspect-square w-full sm:w-56 rounded-xl bg-[color:var(--surface-2)] flex flex-col items-center justify-center border border-dashed border-[color:var(--border-1)]">
                    <UserCircle2 className="text-[color:var(--text-3)] mb-2" size={32} />
                    <span className="text-[color:var(--text-3)] text-xs uppercase tracking-wider">Sin foto</span>
                  </div>
                )}
              </div>

              {/* ID photo */}
              <div>
                <p className="text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.18em] mb-2">
                  Identificación (Cédula / Carnet)
                </p>
                <p className="text-xs font-mono text-[color:var(--text-2)] mb-2">C.I. {sanitizedCedula}</p>
                {visitorIdPhotoUrl && !idPhotoError ? (
                  <div className="aspect-video w-full rounded-xl overflow-hidden border border-[color:var(--border-1)] bg-[color:var(--surface-2)] shadow-inner">
                    <img
                      src={visitorIdPhotoUrl}
                      alt={`ID de ${sanitizedFirstName}`}
                      className="w-full h-full object-contain"
                      onError={() => setIdPhotoError(true)}
                    />
                  </div>
                ) : (
                  <div className="aspect-video w-full rounded-xl bg-[color:var(--surface-2)] flex flex-col items-center justify-center border border-dashed border-[color:var(--border-1)]">
                    <FileText className="text-[color:var(--text-3)] mb-2" size={28} />
                    <span className="text-[color:var(--text-3)] text-xs uppercase tracking-wider">Sin identificación</span>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Info */}
            <div className="space-y-6">

              {/* Visitor Data — View or Edit mode */}
              <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] space-y-4">
                <h3 className="text-[10px] font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2">
                  Datos del Visitante
                </h3>

                {isEditMode ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <EditField label="Nombre" name="first_name" value={editFormData.first_name} onChange={handleEditFieldChange} />
                      <EditField label="Apellido" name="last_name" value={editFormData.last_name} onChange={handleEditFieldChange} />
                    </div>
                    <EditField label="Empresa" name="company" value={editFormData.company} onChange={handleEditFieldChange} />
                    <div className="grid grid-cols-2 gap-3">
                      <EditField label="Cargo" name="job_title" value={editFormData.job_title} onChange={handleEditFieldChange} />
                      <EditField label="Teléfono" name="phone" value={editFormData.phone} onChange={handleEditFieldChange} />
                    </div>
                    <EditField label="Email" name="email" value={editFormData.email} onChange={handleEditFieldChange} type="email" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.18em]">Observaciones</span>
                      <textarea
                        value={editFormData.observations}
                        onChange={(e) => handleEditFieldChange('observations', e.target.value)}
                        rows={2}
                        className="input-tech px-3 py-2 rounded-lg text-sm text-[color:var(--text-1)] border border-[color:var(--border-1)] bg-[color:var(--surface-0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-0)]/20"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editFormData.isBlocked}
                        onChange={(e) => handleEditFieldChange('isBlocked', e.target.checked ? 'true' : 'false')}
                        className="rounded"
                      />
                      <span className="text-sm text-[color:var(--text-1)]">Bloquear visitante</span>
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.18em]">Nombre Completo</span>
                      <span className="text-lg font-semibold text-[color:var(--text-1)]">
                        {sanitizedFirstName} {sanitizedLastName}
                      </span>
                    </div>

                    <InfoRow label="Documento (Cédula)" value={sanitizedCedula} />

                    <div className="grid grid-cols-2 gap-4">
                      <IconRow icon={Building2} label="Empresa" value={sanitizedCompany} />
                      <IconRow icon={Briefcase} label="Cargo" value={sanitizedJobTitle} />
                    </div>
                  </>
                )}
              </div>

              {/* Visit Data — always read-only */}
              <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] space-y-4">
                <h3 className="text-[10px] font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2">
                  Detalles de la Visita
                </h3>

                <IconRow
                  icon={UserCheck}
                  label="Persona / Departamento a Visitar"
                  value={sanitizedPersonToVisit || '—'}
                  iconClass="text-[color:var(--status-success)]"
                />
                <IconRow
                  icon={Clock}
                  label="Hora de Llegada"
                  value={visit.arrival_time ? new Date(visit.arrival_time).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : visit.check_in_time ? new Date(visit.check_in_time).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                  iconClass="text-blue-400"
                />
                <IconRow
                  icon={Clock}
                  label="Hora de Entrada"
                  value={visit.entry_time ? new Date(visit.entry_time).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Pendiente'}
                  iconClass="text-emerald-400"
                />
                <IconRow
                  icon={Clock}
                  label="Hora de Salida"
                  value={(visit.exit_time || visit.check_out_time || visit.check_out) ? new Date(visit.exit_time || visit.check_out_time || visit.check_out!).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Pendiente'}
                  iconClass="text-amber-400"
                />
                <IconRow
                  icon={FileText}
                  label="Motivo de Visita"
                  value={sanitizedPurpose || '—'}
                  iconClass="text-[color:var(--text-3)]"
                />

                {/* Area / Action / Department */}
                {(visit.target_department || visit.action || visit.department) && (
                  <div className="grid grid-cols-3 gap-3 pt-1 border-t border-[color:var(--border-1)]">
                    {visit.target_department && <InfoRow label="Área" value={visit.target_department} />}
                    {visit.action && <InfoRow label="Acción" value={visit.action} />}
                    {visit.department && <InfoRow label="Dpto." value={visit.department} />}
                  </div>
                )}

              </div>

              {/* Companion */}
              <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] space-y-4">
                <h3 className="text-[10px] font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2">
                  Acompañante
                </h3>
                {visit.companionName ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--text-1)]">{visit.companionName}{visit.companionCedula ? ` · ${visit.companionCedula}` : ''}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 opacity-50">
                    <Users size={15} className="text-[color:var(--text-3)]" />
                    <span className="text-xs font-medium text-[color:var(--text-3)]">Sin acompañante</span>
                  </div>
                )}
              </div>

              {/* Vehicle */}
              <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] space-y-4">
                <h3 className="text-[10px] font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2">
                  Vehículo
                </h3>
                {visit.vehiclePlate ? (
                  <IconRow icon={Car} label="Vehículo" value={`${visit.vehicleBrand || ''} ${visit.vehicleModel || ''} · ${visit.vehiclePlate}`.trim()} />
                ) : (
                  <div className="flex items-center gap-2 opacity-50">
                    <Car size={15} className="text-[color:var(--text-3)]" />
                    <span className="text-xs font-medium text-[color:var(--text-3)]">Sin vehículo</span>
                  </div>
                )}
              </div>

              {/* Edit History Section */}
              <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] space-y-4">
                <h3 className="text-[10px] font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2 flex items-center gap-2">
                  <History size={14} />
                  Ediciones
                </h3>
                {editHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[color:var(--text-3)] border-b border-[color:var(--border-1)]">
                          <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Campo</th>
                          <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Valor Viejo</th>
                          <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Valor Nuevo</th>
                          <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Editado por</th>
                          <th className="text-left py-2 px-2 font-semibold uppercase tracking-wider">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editHistory.map((entry) => (
                          <tr key={entry.id} className="border-b border-[color:var(--border-0)] hover:bg-[color:var(--surface-1)]/50">
                            <td className="py-2 px-2 font-medium text-[color:var(--text-1)]">
                              {FIELD_LABELS[entry.field] || entry.field}
                            </td>
                            <td className="py-2 px-2 text-[color:var(--text-3)]">
                              {entry.oldValue || '—'}
                            </td>
                            <td className="py-2 px-2 text-[color:var(--text-1)]">
                              {entry.newValue || '—'}
                            </td>
                            <td className="py-2 px-2 text-[color:var(--text-2)]">
                              {entry.editedByUsername}
                            </td>
                            <td className="py-2 px-2 text-[color:var(--text-3)]">
                              {new Date(entry.editedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 opacity-50">
                    <History size={15} className="text-[color:var(--text-3)]" />
                    <span className="text-xs font-medium text-[color:var(--text-3)]">Sin ediciones registradas</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[color:var(--border-1)] flex justify-between items-center flex-shrink-0">
          {isEditMode ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="btn-ghost px-6"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="btn-primary px-6 flex items-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleEditClick}
                className="btn-primary px-6 flex items-center gap-2"
              >
                <Pencil size={16} />
                Editar
              </button>
              <button
                onClick={onClose}
                className="btn-ghost px-6"
              >
                Cerrar
              </button>
            </>
          )}
        </div>

      </div>

      {/* Password Prompt Overlay */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="panel-tech rounded-2xl w-full max-w-md p-6 relative">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)] rounded-t-2xl" />
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-[color:var(--accent-0)]/10">
                <Lock className="text-[color:var(--accent-0)]" size={20} />
              </div>
              <div>
                <h3 className="text-base font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">
                  Contraseña de Edición
                </h3>
                <p className="text-xs text-[color:var(--text-3)] mt-0.5">
                  Ingrese la contraseña para editar los datos del visitante
                </p>
              </div>
            </div>
            <input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPassword(); }}
              placeholder="••••••••"
              autoFocus
              className="input-tech w-full px-4 py-3 rounded-lg text-sm text-[color:var(--text-1)] border border-[color:var(--border-1)] bg-[color:var(--surface-0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-0)]/20"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowPasswordPrompt(false); setEditPassword(''); }}
                className="btn-ghost px-5"
                disabled={verifyingPassword}
              >
                Cancelar
              </button>
              <button
                onClick={handleVerifyPassword}
                disabled={verifyingPassword}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {verifyingPassword ? 'Validando...' : 'Validar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
