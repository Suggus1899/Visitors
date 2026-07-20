import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full bg-[var(--surface-2)] p-4 text-[var(--text-3)]">
        {icon ?? <Inbox size={28} />}
      </div>
      <p className="font-medium text-[var(--text-1)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--text-3)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center"
    >
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-ghost text-sm text-red-400 border-red-500/30 hover:bg-red-500/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
