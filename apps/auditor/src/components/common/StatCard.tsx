import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: number | string;
    icon: LucideIcon;
    iconColor?: string;
    subtitle?: string;
}

/**
 * KPI stat card with icon, value, and optional subtitle.
 */
export const StatCard = ({
    label,
    value,
    icon: Icon,
    iconColor = 'text-[color:var(--accent-0)]',
    subtitle,
}: StatCardProps) => {
    return (
        <div className="flex items-center justify-between panel-tech p-5 rounded-xl relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-[color:var(--surface-2)] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
            <div>
                <div className="text-[color:var(--text-3)] text-sm font-medium mb-1">{label}</div>
                <div className="text-3xl font-bold text-[color:var(--text-1)] relative z-10">
                    {value}
                </div>
                {subtitle && (
                    <div className="text-xs text-[color:var(--text-3)] mt-1 relative z-10">
                        {subtitle}
                    </div>
                )}
            </div>
            <Icon className={`${iconColor} relative z-10`} size={28} />
        </div>
    );
};
