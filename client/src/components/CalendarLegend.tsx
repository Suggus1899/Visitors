import React from 'react';

interface LegendItem {
    color: string;
    label: string;
}

const LEGEND_ITEMS: LegendItem[] = [
    { color: 'bg-sky-400', label: 'Reunión' },
    { color: 'bg-emerald-400', label: 'Entrega' },
    { color: 'bg-amber-400', label: 'Mantenimiento' },
    { color: 'bg-red-400', label: 'Emergencia' },
    { color: 'bg-[color:var(--accent-0)]', label: 'General' },
    { color: 'bg-[color:var(--border-1)]', label: 'Finalizada' },
];

interface CalendarLegendProps {
    className?: string;
}

const CalendarLegend: React.FC<CalendarLegendProps> = ({ className = '' }) => {
    return (
        <div className={`flex flex-wrap gap-3 p-3 bg-[color:var(--surface-2)] rounded-lg border border-[color:var(--border-1)] ${className}`}>
            <span className="text-sm font-medium text-[color:var(--text-3)] mr-2">Leyenda:</span>
            {LEGEND_ITEMS.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-full ${item.color}`} />
                    <span className="text-xs text-[color:var(--text-2)]">{item.label}</span>
                </div>
            ))}
        </div>
    );
};

export default CalendarLegend;
