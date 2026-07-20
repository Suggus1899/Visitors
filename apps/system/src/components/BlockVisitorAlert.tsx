import { AlertTriangle, Ban } from 'lucide-react';

interface BlockVisitorAlertProps {
  observations?: string;
  onDismiss?: () => void;
}

export const BlockVisitorAlert = ({ observations, onDismiss }: BlockVisitorAlertProps) => {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <Ban className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h3 className="font-semibold text-red-800 dark:text-red-300">
              VISITANTE BLOQUEADO
            </h3>
          </div>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            Este visitante se encuentra en la lista negra y no puede ingresar.
          </p>
          {observations && (
            <div className="mt-3 rounded-md bg-red-100 p-3 dark:bg-red-900/40">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">
                Motivo:
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                {observations}
              </p>
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >
            <span className="sr-only">Cerrar</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
