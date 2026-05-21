import React, { useState, useCallback, useMemo } from 'react';
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
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

type SortField = 'visitor' | 'check_in' | 'check_out' | 'arrival_time' | 'entry_time' | 'exit_time' | 'reason' | 'status';
type SortDirection = 'asc' | 'desc';

interface Filters {
    status: '' | 'active' | 'completed';
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

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (columns: string[], data: unknown[], options?: unknown) => jsPDF;
    }
}

const ITEMS_PER_PAGE = 10;

const SortIcon: React.FC<{ field: SortField; sortField: SortField; sortDirection: SortDirection }> = ({ field, sortField, sortDirection }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
};

SortIcon.displayName = 'SortIcon';

const VisitsTable: React.FC<VisitsTableProps> = ({
    visits, sortedVisits, totalVisitsCount, currentPage, totalPages,
    filters, sortField, sortDirection, username,
    onFilterChange, onSort, onPageChange
}) => {
    const [isExporting, setIsExporting] = useState(false);

    const formatDateTime = useCallback((dateTime?: string | null): string => {
        if (!dateTime) return '-';
        try {
            return new Date(dateTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return '-';
        }
    }, []);

    // Memoized filtered and sorted data
    const tableData = useMemo(() => {
        return sortedVisits.map(visit => ({
            ...visit,
            visitorName: `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''}`.trim(),
            company: visit.Visitor?.company || '',
            reason: visit.reason || visit.purpose || '',
            arrivalTime: formatDateTime(visit.arrival_time),
            entryTime: formatDateTime(visit.entry_time || visit.check_in || visit.check_in_time),
            exitTime: formatDateTime(visit.exit_time || visit.check_out || visit.check_out_time),
            statusText: visit.status === 'active' ? 'Activo' : 'Completado',
            statusColor: visit.status === 'active' ? 'text-green-400' : 'text-blue-400'
        }));
    }, [sortedVisits, formatDateTime]);

    // Optimized PDF export
    const exportPDF = useCallback(async () => {
        if (isExporting) return;
        
        setIsExporting(true);
        try {
            const doc = new jsPDF();
            
            // Header
            doc.setFillColor(45, 212, 191);
            doc.rect(0, 0, 220, 25, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18).setFont('helvetica', 'bold');
            doc.text('Industrias de Alimentos el Trébol - Reporte de Visitas', 14, 17);
            
            // Metadata
            doc.setTextColor(31, 41, 55);
            doc.setFontSize(10).setFont('helvetica', 'normal');
            doc.text(`Generado por: ${username || 'Usuario'} el ${new Date().toLocaleString()}`, 14, 35);
            doc.text(`Total visitas (filtrado): ${visits.length}`, 14, 42);
            
            // Table data
            const pdfTableData = tableData.map(visit => [
                visit.visitorName,
                visit.company,
                visit.reason,
                visit.arrivalTime,
                visit.entryTime,
                visit.exitTime,
                visit.statusText
            ]);
            
            // Table headers
            const headers = [
                'Visitante', 'Empresa', 'Motivo', 'Llegada', 'Entrada', 'Salida', 'Estado'
            ];
            
            // Generate table
            autoTable(doc, {
                head: [headers],
                body: pdfTableData,
                startY: 50,
                styles: { font: 'helvetica', fontSize: 8 },
                headStyles: { fillColor: [45, 212, 191], textColor: 255 },
                alternateRowStyles: { fillColor: [245, 245, 245] }
            });
            
            // Save PDF
            doc.save(`reporte-visitas-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error exporting PDF:', error);
        } finally {
            setIsExporting(false);
        }
    }, [isExporting, username, visits, tableData]);

    // Optimized Excel export
    const exportExcel = useCallback(async () => {
        if (isExporting) return;
        
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Reporte de Visitas');
            
            // Set columns
            worksheet.columns = [
                { header: 'Visitante', key: 'visitorName', width: 25 },
                { header: 'Empresa', key: 'company', width: 20 },
                { header: 'Motivo', key: 'reason', width: 20 },
                { header: 'Llegada', key: 'arrivalTime', width: 18 },
                { header: 'Entrada', key: 'entryTime', width: 18 },
                { header: 'Salida', key: 'exitTime', width: 18 },
                { header: 'Estado', key: 'statusText', width: 12 }
            ];
            
            // Add data
            worksheet.addRows(tableData);
            
            // Style header row
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2DD4BF' }
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.height = 20;
            
            // Style data rows
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    row.alignment = { vertical: 'middle', wrapText: true };
                    row.height = 20;
                    
                    // Alternate row colors
                    if (rowNumber % 2 === 0) {
                        row.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF5F5F5' }
                        };
                    }
                }
            });
            
            // Add borders
            worksheet.eachRow((row) => {
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            });
            
            // Generate buffer
            const buffer = await workbook.xlsx.writeBuffer();
            
            // Download file
            const blob = new Blob([buffer], { 
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reporte-visitas-${new Date().toISOString().split('T')[0]}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting Excel:', error);
        } finally {
            setIsExporting(false);
        }
    }, [isExporting, tableData]);

    // Optimized sort handler
    const handleSort = useCallback((field: SortField) => {
        onSort(field);
    }, [onSort]);

    // Optimized filter handlers
    const handleFilterChange = useCallback((key: keyof Filters, value: string) => {
        onFilterChange(key, value);
    }, [onFilterChange]);

    // Optimized pagination
    const handlePageChange = useCallback((page: number) => {
        onPageChange(page);
    }, [onPageChange]);

    // Memoized pagination info
    const paginationInfo = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
        const end = Math.min(currentPage * ITEMS_PER_PAGE, totalVisitsCount);
        return { start, end, total: totalVisitsCount };
    }, [currentPage, totalVisitsCount]);

    return (
        <div className="panel-tech rounded-lg overflow-hidden">
            {/* Filters */}
            <div className="p-5 border-b border-[color:var(--border-1)]">
                <h3 className="text-lg font-display uppercase tracking-[0.2em] text-[color:var(--text-1)] flex items-center gap-2 mb-4">
                    <Filter size={20} className="text-[color:var(--accent-0)]" /> Filtros y Búsqueda
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <input type="text" placeholder="Buscar (Nombre, Cédula...)" className="input-tech text-sm" value={filters.search} onChange={e => onFilterChange('search', e.target.value)} />
                    <input type="text" placeholder="Empresa" className="input-tech text-sm" value={filters.company} onChange={e => onFilterChange('company', e.target.value)} />
                    <select className="input-tech text-sm" value={filters.status} onChange={e => onFilterChange('status', e.target.value)}>
                        <option value="">Todos los estados</option>
                        <option value="active">Activos</option>
                        <option value="completed">Completados</option>
                    </select>
                    <input type="date" className="input-tech text-sm" value={filters.startDate} onChange={e => onFilterChange('startDate', e.target.value)} />
                    <input type="date" className="input-tech text-sm" value={filters.endDate} onChange={e => onFilterChange('endDate', e.target.value)} />
                </div>
            </div>

            {/* Export bar */}
            <div className="bg-[color:var(--surface-2)] p-4 border-b border-[color:var(--border-1)] flex justify-between items-center">
                <span className="text-sm text-[color:var(--text-3)]">Mostrando {sortedVisits.length} de {totalVisitsCount} visitas</span>
                <div className="flex gap-2">
                    <button onClick={exportPDF} className="border border-red-400 text-red-300 hover:text-red-200 hover:border-red-300 px-4 py-2 rounded flex items-center text-sm font-semibold transition-colors">
                        <Download className="mr-2" size={16} /> Exportar PDF
                    </button>
                    <button onClick={exportExcel} className="border border-emerald-400 text-emerald-300 hover:text-emerald-200 hover:border-emerald-300 px-4 py-2 rounded flex items-center text-sm font-semibold transition-colors">
                        <FileSpreadsheet className="mr-2" size={16} /> Exportar Excel
                    </button>
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
                            const ts = (dt?: string | null) => dt ? new Date(dt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                            return (
                            <tr key={vis.id} className="hover:bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] last:border-0 transition-colors">
                                <td className="p-4">
                                    <div className="font-semibold text-[color:var(--text-1)]">{`${vis.Visitor?.first_name || ''} ${vis.Visitor?.last_name || ''}`.trim()}</div>
                                    <div className="text-xs text-[color:var(--text-3)]">{vis.Visitor?.company || ''} · {vis.Visitor?.cedula || ''}</div>
                                </td>
                                <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">{ts(vis.arrival_time)}</td>
                                <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">{ts(vis.entry_time || vis.check_in || vis.check_in_time)}</td>
                                <td className="p-4 text-[color:var(--text-2)] font-mono text-xs">{ts(vis.exit_time || vis.check_out || vis.check_out_time)}</td>
                                <td className="p-4 text-[color:var(--text-2)] text-sm max-w-[12rem] truncate">{vis.reason || vis.purpose}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${vis.status === 'active' ? 'border-[color:var(--accent-0)] text-[color:var(--accent-0)]' : 'border-[color:var(--border-1)] text-[color:var(--text-3)]'}`}>
                                        {vis.status === 'active' ? 'ACTIVO' : 'COMPLETADO'}
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
                        <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="btn-ghost px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                            <ChevronLeft size={16} /> Anterior
                        </button>
                        <div className="hidden sm:flex gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let page: number;
                                if (totalPages <= 5) page = i + 1;
                                else if (currentPage <= 3) page = i + 1;
                                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                                else page = currentPage - 2 + i;
                                return (
                                    <button key={page} onClick={() => onPageChange(page)} className={`w-8 h-8 rounded text-sm ${currentPage === page ? 'bg-[color:var(--accent-0)] text-[#081116]' : 'hover:bg-[color:var(--surface-1)] text-[color:var(--text-2)]'}`}>
                                        {page}
                                    </button>
                                );
                            })}
                        </div>
                        <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="btn-ghost px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                            Siguiente <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export { ITEMS_PER_PAGE };
export type { SortField, SortDirection, Filters };
export default VisitsTable;
