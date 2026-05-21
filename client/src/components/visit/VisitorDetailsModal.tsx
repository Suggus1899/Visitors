
import { X, Building2, UserCircle2, Briefcase, FileText, Clock, UserCheck, Car, Users } from 'lucide-react';
import type { Visit } from '../../types';
import { useMemo, useState, useEffect } from 'react';
import { sanitizeInput, sanitizeHTML } from '../../utils/sanitizer';

interface VisitorDetailsModalProps {
  visit: Visit | null;
  isOpen: boolean;
  onClose: () => void;
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

export function VisitorDetailsModal({ visit, isOpen, onClose }: VisitorDetailsModalProps) {
  const [photoError, setPhotoError] = useState(false);
  const [idPhotoError, setIdPhotoError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPhotoError(false);
      setIdPhotoError(false);
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
  const sanitizedNotes = useMemo(() => sanitizeHTML(visit?.notes || ''), [visit]);

  if (!isOpen || !visit) return null;

  const checkInDate = visit.check_in || visit.check_in_time || '';
  const formattedDate = checkInDate ? new Date(checkInDate).toLocaleString('es-VE', {
    dateStyle: 'medium', timeStyle: 'short'
  }) : '—';

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
            <UserCircle2 className="text-[color:var(--accent-0)]" size={22} />
            <div>
              <h2 className="text-base font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">
                Detalles de la Visita
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
                {visit.Visitor?.photo_url && !photoError ? (
                  <div className="aspect-square w-full sm:w-56 rounded-xl overflow-hidden border border-[color:var(--border-1)] bg-[color:var(--surface-2)] shadow-inner">
                    <img
                      src={visit.Visitor.photo_url}
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
                {visit.Visitor?.id_photo_url && !idPhotoError ? (
                  <div className="aspect-video w-full rounded-xl overflow-hidden border border-[color:var(--border-1)] bg-[color:var(--surface-2)] shadow-inner">
                    <img
                      src={visit.Visitor.id_photo_url}
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

              {/* Visitor Data */}
              <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] space-y-4">
                <h3 className="text-[10px] font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2">
                  Datos del Visitante
                </h3>

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
              </div>

              {/* Visit Data */}
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
                  value={(visit.check_in || visit.check_in_time || visit.arrival_time) ? new Date(visit.check_in || visit.check_in_time || visit.arrival_time!).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
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
                {(visit.area || visit.action || visit.department) && (
                  <div className="grid grid-cols-3 gap-3 pt-1 border-t border-[color:var(--border-1)]">
                    {visit.area && <InfoRow label="Área" value={visit.area} />}
                    {visit.action && <InfoRow label="Acción" value={visit.action} />}
                    {visit.department && <InfoRow label="Dpto." value={visit.department} />}
                  </div>
                )}

                {visit.notes && (
                  <div className="pt-1 border-t border-[color:var(--border-1)]">
                    <span className="text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.18em] block mb-1">
                      Notas adicionales
                    </span>
                    <p
                      className="text-sm text-[color:var(--text-2)] bg-[color:var(--surface-3)] p-3 rounded-lg border border-[color:var(--border-1)] italic leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizedNotes }}
                    />
                  </div>
                )}
              </div>

              {/* Companion / Vehicle (if present) */}
              {(visit.companionName || visit.vehiclePlate) && (
                <div className="bg-[color:var(--surface-2)] rounded-xl p-4 border border-[color:var(--border-0)] space-y-4">
                  <h3 className="text-[10px] font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2">
                    Acompañante / Vehículo
                  </h3>
                  {visit.companionName && (
                    <IconRow icon={Users} label="Acompañante" value={`${visit.companionName}${visit.companionCedula ? ` · ${visit.companionCedula}` : ''}`} />
                  )}
                  {visit.vehiclePlate && (
                    <IconRow icon={Car} label="Vehículo" value={`${visit.vehicleBrand || ''} ${visit.vehicleModel || ''} · ${visit.vehiclePlate}`.trim()} />
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[color:var(--border-1)] flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="btn-ghost px-6"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
