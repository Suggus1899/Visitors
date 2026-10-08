import Search from 'lucide-react/dist/esm/icons/search';
import Calendar from 'lucide-react/dist/esm/icons/calendar';

interface AuditFiltersProps {
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
                <input
                    type="text"
                    placeholder="Buscar detalles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-tech pl-10 w-64"
                />
            </div>
            
            <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="input-tech px-3 py-2"
            >
                <option value="">Todas las acciones</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="CHECKOUT">CHECKOUT</option>
                <option value="BACKUP">BACKUP</option>
            </select>

            <div className="flex items-center gap-2 bg-[color:var(--surface-0)] border border-[color:var(--border-1)] rounded-lg px-2">
                <Calendar size={18} className="text-[color:var(--text-3)]" />
                <input 
                    type="date" 
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                />
                <span className="text-[color:var(--text-3)]">-</span>
                <input 
                    type="date" 
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="py-2 outline-none text-[color:var(--text-2)] text-sm bg-transparent"
                />
            </div>

            <input
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
