import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
    message?: string;
    onRetry?: () => void;
}

/**
 * Full-card error state with optional retry button.
 */
export const ErrorState = ({ message = 'Failed to load data', onRetry }: ErrorStateProps) => {
    return (
        <div className="panel-tech rounded-xl p-12 flex flex-col items-center justify-center text-center">
            <AlertCircle size={40} className="text-[color:var(--status-danger)] mb-4" />
            <p className="text-[color:var(--text-2)] mb-1">{message}</p>
            <p className="text-xs text-[color:var(--text-3)] mb-4">
                Please try again or contact support if the problem persists.
            </p>
            {onRetry && (
                <button onClick={onRetry} className="btn-ghost px-4 py-2 gap-2">
                    <RefreshCw size={16} /> Retry
                </button>
            )}
        </div>
    );
};
