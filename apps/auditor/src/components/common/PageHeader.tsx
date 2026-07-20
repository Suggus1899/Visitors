import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Lock } from 'lucide-react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    actions?: ReactNode;
    readOnly?: boolean;
}

/**
 * Reusable page header with title, optional icon, action buttons,
 * and a read-only indicator for the auditor role.
 */
export const PageHeader = ({
    title,
    subtitle,
    icon: Icon,
    actions,
    readOnly = true,
}: PageHeaderProps) => {
    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center panel-tech p-6 rounded-xl gap-4">
            <div>
                <h1 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] flex items-center gap-2">
                    {Icon && <Icon className="text-[color:var(--accent-0)]" size={24} />}
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-[color:var(--text-3)] mt-1">{subtitle}</p>
                )}
            </div>
            <div className="flex gap-3 items-center flex-wrap">
                {readOnly && (
                    <span className="flex items-center gap-1.5 text-xs text-[color:var(--text-3)] bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-full px-3 py-1.5">
                        <Lock size={12} /> Read-only access
                    </span>
                )}
                {actions}
            </div>
        </div>
    );
};
