import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
    title?: string;
    message?: string;
    icon?: ReactNode;
    action?: ReactNode;
}

/**
 * Empty state placeholder for tables and lists.
 */
export const EmptyState = ({
    title = 'No data found',
    message = 'There are no records to display.',
    icon,
    action,
}: EmptyStateProps) => {
    return (
        <div className="panel-tech rounded-xl p-12 flex flex-col items-center justify-center text-center">
            <div className="text-[color:var(--text-3)] mb-4">
                {icon ?? <Inbox size={40} />}
            </div>
            <p className="text-[color:var(--text-1)] font-medium mb-1">{title}</p>
            <p className="text-sm text-[color:var(--text-3)] mb-4">{message}</p>
            {action}
        </div>
    );
};
