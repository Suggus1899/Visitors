import { Input } from '../ui/input';
import Search from 'lucide-react/dist/esm/icons/search';
import Calendar from 'lucide-react/dist/esm/icons/calendar';

interface AuditFiltersProps {
    actions: string[];
    searchQuery: string;
    setSearchQuery: (val: string) => void;
    filterAction: string;
    setFilterAction: (val: string) => void;
    filterStartDate: string;
    setFilterStartDate: (val: string) => void;
    filterEndDate: string;
    setFilterEndDate: (val: string) => void;
    filterUsername: string;
    setFilterUsername: (val: string) => void;
}

const AuditFilters = ({
    actions,
    searchQuery, setSearchQuery,
    filterAction, setFilterAction,
    filterStartDate, setFilterStartDate,
    filterEndDate, setFilterEndDate,
    filterUsername, setFilterUsername
}: AuditFiltersProps) => {
    return (
        <div className="p-4 border-b border-[color:var(--border-1)] bg-[color:var(--surface-2)] flex flex-wrap gap-3 items-center">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-[color:var(--text-3)]" size={18} />
                <Input
                    type="text"
                    placeholder="Buscar detalles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-tech pl-10 w-64"
                />
            </div>
            
            <select
                aria-label="Acción de auditoría"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="input-tech px-3 py-2"
            >
                <option value="">Todas las acciones</option>
                {actions.map(action => <option key={action} value={action}>{action}</option>)}
            </select>

            <div className="flex items-center gap-2 bg-[color:var(--surface-0)] border border-[color:var(--border-1)] rounded-lg px-2">
                <Calendar size={18} className="text-[color:var(--text-3)]" />
                <Input
                    type="date" 
                    aria-label="Fecha inicial de auditoría"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                />
                <span className="text-[color:var(--text-3)]">-</span>
                <Input
                    type="date" 
                    aria-label="Fecha final de auditoría"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                />
            </div>

            <Input
                type="text"
                placeholder="Usuario..."
                value={filterUsername}
                onChange={(e) => setFilterUsername(e.target.value)}
                className="input-tech w-40"
            />
        </div>
    );
};

export default AuditFilters;
