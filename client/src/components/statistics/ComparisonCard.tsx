import TrendingUpIcon from 'lucide-react/dist/esm/icons/trending-up';
import { ComparisonStats } from '../../types';

interface ComparisonCardProps {
    comparison: ComparisonStats | null;
}

const ComparisonCard = ({ comparison }: ComparisonCardProps) => {
    if (!comparison) return null;

    return (
        <div className="panel-tech rounded-lg p-5 border-l-4 border-[color:var(--accent-0)]">
            <h3 className="font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4 flex items-center gap-2">
                <TrendingUpIcon size={20} className="text-[color:var(--accent-0)]" /> Comparativa vs Mes Anterior
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col">
                    <span className="text-sm text-[color:var(--text-3)]">Total Visitas (Mes Actual)</span>
                    <span className="text-2xl font-bold text-[color:var(--text-1)]">{comparison.summary.currentMonth}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-sm text-[color:var(--text-3)]">Total Visitas (Mes Anterior)</span>
                    <span className="text-2xl font-bold text-[color:var(--text-2)]">{comparison.summary.lastMonth}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-sm text-[color:var(--text-3)]">Crecimiento</span>
                    <span className={`text-2xl font-bold ${comparison.summary.growth >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {comparison.summary.growth > 0 ? '+' : ''}{comparison.summary.growth.toFixed(1)}%
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ComparisonCard;
