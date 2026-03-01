
import { X, Building2, UserCircle2, Briefcase, FileText, Clock, UserCheck } from 'lucide-react';
import type { Visit } from '../../types';
import { useMemo } from 'react';
import { sanitizeInput, sanitizeHTML } from '../../utils/sanitizer';

interface VisitorDetailsModalProps {
  visit: Visit | null;
  isOpen: boolean;
  onClose: () => void;
}

export function VisitorDetailsModal({ visit, isOpen, onClose }: VisitorDetailsModalProps) {
  if (!isOpen || !visit) return null;

  // Sanitize all user-generated content for XSS protection
  const sanitizedFirstName = useMemo(() => sanitizeInput(visit.Visitor?.first_name || ''), [visit.Visitor?.first_name]);
  const sanitizedLastName = useMemo(() => sanitizeInput(visit.Visitor?.last_name || ''), [visit.Visitor?.last_name]);
  const sanitizedCompany = useMemo(() => sanitizeInput(visit.Visitor?.company || 'Independiente'), [visit.Visitor?.company]);
  const sanitizedJobTitle = useMemo(() => sanitizeInput(visit.Visitor?.job_title || 'N/A'), [visit.Visitor?.job_title]);
  const sanitizedPersonToVisit = useMemo(() => sanitizeInput(visit.person_to_visit || ''), [visit.person_to_visit]);
  const sanitizedPurpose = useMemo(() => sanitizeInput(visit.purpose || ''), [visit.purpose]);
  const sanitizedNotes = useMemo(() => sanitizeHTML(visit.notes || ''), [visit.notes]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <UserCircle2 className="w-6 h-6 mr-2 text-blue-600" />
            Detalles de la Visita
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Left Column: Photos */}
            <div className="space-y-6">

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wider">Fotografía del Visitante</h3>
                {visit.Visitor?.photo_url ? (
                  <div className="aspect-square w-full sm:w-64 max-w-full rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-50 flex items-center justify-center">
                    <img
                      src={visit.Visitor.photo_url}
                      alt={`Foto de ${visit.Visitor?.first_name}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square w-full sm:w-64 rounded-lg bg-gray-100 flex items-center justify-center border border-dashed border-gray-300">
                    <span className="text-gray-400 text-sm">Sin foto</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wider">Identificación (Cédula/Carnet)</h3>
                {visit.Visitor?.id_photo_url ? (
                  <div className="aspect-video w-full rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-50 flex items-center justify-center">
                    <img
                      src={visit.Visitor.id_photo_url}
                      alt={`ID de ${visit.Visitor?.first_name}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="aspect-video w-full rounded-lg bg-gray-100 flex items-center justify-center border border-dashed border-gray-300">
                    <span className="text-gray-400 text-sm">Sin identificación</span>
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Info Details */}
            <div className="space-y-6">

              {/* Visitor Information block */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider border-b pb-2">Datos del Visitante</h3>
                <div className="space-y-4">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500">Nombre Completo</span>
                    <span className="font-semibold text-gray-900 text-lg">
                      {sanitizedFirstName} {sanitizedLastName}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500">Documento (Cédula)</span>
                    <span className="font-medium text-gray-900">{visit.visitor_cedula}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-start space-x-2">
                      <Building2 className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div>
                        <span className="text-xs text-gray-500 block">Empresa</span>
                        <span className="text-sm font-medium text-gray-900">{sanitizedCompany}</span>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Briefcase className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div>
                        <span className="text-xs text-gray-500 block">Cargo</span>
                        <span className="text-sm font-medium text-gray-900">{sanitizedJobTitle}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visit Information block */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider border-b pb-2 mt-8">Detalles de la Visita</h3>
                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <UserCheck className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-gray-500 block">Persona a Visitar</span>
                      <span className="text-sm font-medium text-gray-900">{sanitizedPersonToVisit}</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Clock className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-gray-500 block">Hora de Registro</span>
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(visit.check_in || visit.check_in_time || '').toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <FileText className="w-4 h-4 text-purple-500 mt-1 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-gray-500 block">Motivo de Visita</span>
                      <span className="text-sm font-medium text-gray-900 block mt-1 bg-gray-50 p-2 rounded border border-gray-100">
                        {sanitizedPurpose}
                      </span>
                    </div>
                  </div>

                  {visit.notes && (
                    <div className="mt-3">
                      <span className="text-xs text-gray-500 block mb-1">Notas adicionales</span>
                      <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded-md border border-yellow-100 italic" dangerouslySetInnerHTML={{ __html: sanitizedNotes }} />
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end rounded-b-xl">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium cursor-pointer"
          >
            Cerrar Detalles
          </button>
        </div>

      </div>
    </div>
  );
}
