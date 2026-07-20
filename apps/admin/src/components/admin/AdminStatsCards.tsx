import React from 'react';

interface AdminStatsCardsProps {
    totalVisits: number;
    activeVisits: number;
}

const AdminStatsCards: React.FC<AdminStatsCardsProps> = ({ totalVisits, activeVisits }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="panel-tech p-6 rounded-lg border-l-2 border-[color:var(--accent-0)]">
            <h3 className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-[0.2em]">Visitas Totales</h3>
            <p className="text-3xl font-bold text-[color:var(--text-1)]">{totalVisits}</p>
        </div>
        <div className="panel-tech p-6 rounded-lg border-l-2 border-[color:var(--accent-1)]">
            <h3 className="text-[color:var(--text-3)] text-xs font-semibold uppercase tracking-[0.2em]">Activas Ahora</h3>
            <p className="text-3xl font-bold text-[color:var(--text-1)]">{activeVisits}</p>
        </div>
    </div>
);

export default AdminStatsCards;
