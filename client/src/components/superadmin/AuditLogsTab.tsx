import { AuditLog } from './types';

interface AuditLogsTabProps {
  auditLogs: AuditLog[];
}

const AuditLogsTab = ({ auditLogs }: AuditLogsTabProps) => {
  return (
    <div className="bg-[color:var(--surface-1)] rounded-lg border border-[color:var(--border-1)]">
      <div className="p-4 border-b border-[color:var(--border-1)]">
        <h2 className="text-lg font-semibold text-[color:var(--text-1)]">Logs de Auditoría</h2>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full">
          <thead className="bg-[color:var(--surface-2)] sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Fecha</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Usuario</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Acción</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Entidad</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--text-2)]">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border-1)]">
            {auditLogs.map((log) => (
              <tr key={log.id} className="hover:bg-[color:var(--surface-2)]">
                <td className="px-4 py-3 text-sm text-[color:var(--text-2)]">
                  {new Date(log.createdAt).toLocaleString('es-ES')}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-[color:var(--text-1)]">{log.username}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[color:var(--text-2)]">
                  {log.entityType} #{log.entityId}
                </td>
                <td className="px-4 py-3 text-sm text-[color:var(--text-2)] max-w-md truncate">
                  {log.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {auditLogs.length === 0 && (
          <div className="text-center py-8 text-[color:var(--text-3)]">
            No hay logs de auditoría
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogsTab;
