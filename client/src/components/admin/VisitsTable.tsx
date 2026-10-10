import { Input } from '../ui/input';
import { Button } from '../ui/button';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Visit } from '../../types';
import { 
    Download, 
    FileSpreadsheet, 
    Filter, 
    Search, 
    ChevronLeft, 
    ChevronRight, 
    ArrowUpDown, 
    ArrowUp, 
    ArrowDown
} from 'lucide-react';
import { VisitService } from '../../services/api.v1';
import toast from 'react-hot-toast';
import { sortReportVisits, visitReportRow, VISIT_STATUS_LABELS } from '../../utils/visitReport';
import { reportFileDate, formatReportDate } from '../../utils/reportFormatting';


import { VisitorDetailsModal } from '../visit/VisitorDetailsModal';

type SortField = 'visitor' | 'check_in' | 'check_out' | 'arrival_time' | 'entry_time' | 'exit_time' | 'reason' | 'status';
type SortDirection = 'asc' | 'desc';

interface Filters {
    status: '' | Visit['status'];
    startDate: string;
    endDate: string;
    search: string;
    company: string;
}

interface VisitsTableProps {
    visits: Visit[];
    sortedVisits: Visit[];
    totalVisitsCount: number;
    currentPage: number;
    totalPages: number;
    filters: Filters;
    sortField: SortField;
    sortDirection: SortDirection;
    username?: string;
    onFilterChange: (key: keyof Filters, value: string) => void;
    onSort: (field: SortField) => void;
    onPageChange: (page: number) => void;
}

const ITEMS_PER_PAGE = 10;

const SortIcon: React.FC<{ field: SortField; sortField: SortField; sortDirection: SortDirection }> = ({ field, sortField, sortDirection }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
};

SortIcon.displayName = 'SortIcon';

const VisitsTable: React.FC<VisitsTableProps> = ({
    sortedVisits, totalVisitsCount, currentPage, totalPages,
    filters, sortField, sortDirection, username,
    onFilterChange, onSort, onPageChange
}) => {
    const [isExporting, setIsExporting] = useState(false);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

    const exportReport = useCallback(async (kind: 'pdf' | 'excel') => {
        if (isExporting || controller.current) return;
        setIsExporting(true);
        try {
            controller.current = new AbortController();
            const records = sortReportVisits(await VisitService.getAllVisits({ ...filters }, { maxRecords: kind === 'pdf' ? 2000 : 20000, signal: controller.current.signal }), sortField, sortDirection);
            const { buildVisitsPDF, buildVisitsWorkbook } = await import('../../utils/visitExport');
            if (controller.current.signal.aborted) return;
            if (!records.length) { toast.error('No hay visitas que coincidan con los filtros.'); return; }
            const generatedAt = new Date();
            if (kind === 'pdf') {
                buildVisitsPDF(records, filters, username, generatedAt).save('reporte-visitas-' + reportFileDate(generatedAt) + '.pdf');
            } else {
                const buffer = await buildVisitsWorkbook(records, filters, username, generatedAt).xlsx.writeBuffer();
                const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
                const link = document.createElement('a');
                link.href = url; link.download = 'reporte-visitas-' + reportFileDate(generatedAt) + '.xlsx';
                document.body.appendChild(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            toast.success('Reporte exportado: ' + records.length + ' visitas.');
        } catch (error) {
            if (controller.current?.signal.aborted) { toast('Exportación cancelada.'); return; }
            toast.error(error instanceof Error ? error.message : 'No se pudo exportar el reporte. Inténtalo nuevamente.');
        } finally {
            controller.current = null;
            setIsExporting(false);
        }
    }, [isExporting, filters, sortField, sortDirection, username]);

    return (
        <div className="panel-tech rounded-lg overflow-hidden">
            {isExporting && <Button onClick={() => controller.current?.abort()}>Cancelar exportación</Button>}
            {/* Filters */}
            <div className="p-5 border-b border-[color:var(--border-1)]">
                <h3 className="text-lg font-display uppercase tracking-[0.2em] text-[color:var(--text-1)] flex items-center gap-2 mb-4">
                    <Filter size={20} className="text-[color:var(--accent-0)]" /> Filtros y Búsqueda
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <Input type="text" placeholder="Buscar (mínimo 3 caracteres)" className="input-tech text-sm" value={filters.search} onChange={e => onFilterChange('search', e.target.value)} />
                    <Input type="text" placeholder="Empresa" className="input-tech text-sm" value={filters.company} onChange={e => onFilterChange('company', e.target.value)} />
                    <select aria-label="Estado de las visitas" className="input-tech text-sm" value={filters.status} onChange={e => onFilterChange('status', e.target.value)}>
                        <option value="">Todos los estados</option>
                        <option value="waiting">En espera</option>
                        <option value="active">Activos</option>
                        <option value="intermittent">Salida temporal</option>
                        <option value="completed">Completados</option>
                    </select>
                    <Input aria-label="Fecha inicial de visitas" type="date" className="input-tech text-sm" value={filters.startDate} onChange={e => onFilterChange('startDate', e.target.value)} />
                    <Input aria-label="Fecha final de visitas" type="date" className="input-tech text-sm" value={filters.endDate} onChange={e => onFilterChange('endDate', e.target.value)} />
                </div>
            </div>

            {/* Export bar */}
            <div className="bg-[color:var(--surface-2)] p-4 border-b border-[color:var(--border-1)] flex flex-wrap gap-3 justify-between items-center">
                <span className="text-sm text-[color:var(--text-3)]">Mostrando {sortedVisits.length} de {totalVisitsCount} visitas · Se exportan todos los resultados</span>
                <div className="flex gap-2">
                    <Button onClick={() => exportReport('pdf')} disabled={isExporting || totalVisitsCount === 0} className="border border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 px-4 py-2 rounded flex items-center text-sm font-semibold transition-colors">
                        <Download className="mr-2" size={16} /> {isExporting ? 'Preparando…' : 'Exportar PDF'}
                    </Button>
                    <Button onClick={() => exportReport('excel')} disabled={isExporting || totalVisitsCount === 0} className="border border-emerald-400 text-emerald-300 hover:text-emerald-200 hover:border-emerald-300 px-4 py-2 rounded flex items-center text-sm font-semibold transition-colors">
                        <FileSpreadsheet className="mr-2" size={16} /> {isExporting ? 'Preparando…' : 'Exportar Excel'}
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[color:var(--surface-2)] text-[color:var(--text-3)] uppercase text-xs">
                            {([
                                'visitor', 'arrival_time', 'entry_time', 'exit_time', 'reason', 'status'
                            ] as SortField[]).map(field => (
                                <th key={field} className="p-4 border-b border-[color:var(--border-1)] cursor-pointer hover:bg-[color:var(--surface-1)] transition-colors" onClick={() => onSort(field)}>
                                    <div className="flex items-center gap-2">
                                        {field === 'visitor' ? 'Visitante'
                                            : field === 'arrival_time' ? 'Llegada'
                                            : field === 'entry_time' ? 'Entrada'
                                            : field === 'exit_time' ? 'Salida'
                                            : field === 'reason' ? 'Motivo'
                                            : 'Estado'}
                                        <SortIcon field={field} sortField={sortField} sortDirection={sortDirection} />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {sortedVisits.length > 0 ? sortedVisits.map((vis) => {
                            const ts = formatReportDate;
                            const row = visitReportRow(vis);
                            return (
                            <tr key={vis.id} onClick={() => setSelectedVisit(vis)} className="hover:bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] last:border-0 transition-colors cursor-pointer">
                                <td className="p-4">
                                    <div className="font-semibold text-[color:var(--text-1)]">{row.name}</div>
                                    <div className="text-xs text-[color:var(--text-3)]">{row.company} · {row.cedula}</div>
                                </td>
                                <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">{ts(row.arrival)}</td>
                                <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">{ts(row.entry)}</td>
                                <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">{ts(row.exit)}</td>
                                <td className="p-4 text-[color:var(--text-2)] text-sm max-w-[12rem] truncate">{row.reason}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${vis.status === 'active' ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]' : 'border-[color:var(--border-1)] text-[color:var(--text-3)]'}`}>
                                        {VISIT_STATUS_LABELS[vis.status]}
                                    </span>
                                </td>
                            </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-[color:var(--text-3)]">
                                    <Search size={32} className="mx-auto mb-2 opacity-30" />
                                    No se encontraron visitas con los filtros seleccionados
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="border-t border-[color:var(--border-1)] px-4 py-3 flex items-center justify-between bg-[color:var(--surface-2)]">
                    <div className="text-sm text-[color:var(--text-3)]">Página {currentPage} de {totalPages}</div>
                    <div className="flex gap-2">
                        <Button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="btn-ghost px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                            <ChevronLeft size={16} /> Anterior
                        </Button>
                        <div className="hidden sm:flex gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let page: number;
                                if (totalPages <= 5) page = i + 1;
                                else if (currentPage <= 3) page = i + 1;
                                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                                else page = currentPage - 2 + i;
                                return (
                                    <Button key={page} onClick={() => onPageChange(page)} className={`w-8 h-8 rounded text-sm ${currentPage === page ? 'bg-[color:var(--accent-0)] text-[#081116]' : 'hover:bg-[color:var(--surface-1)] text-[color:var(--text-2)]'}`}>
                                        {page}
                                    </Button>
                                );
                            })}
                        </div>
                        <Button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="btn-ghost px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                            Siguiente <ChevronRight size={16} />
                        </Button>
                    </div>
                </div>
            )}

            <VisitorDetailsModal
                visit={selectedVisit}
                isOpen={!!selectedVisit}
                onClose={() => setSelectedVisit(null)}
            />
        </div>
    );
};

export { ITEMS_PER_PAGE };
export type { SortField, SortDirection, Filters };
export default VisitsTable;
