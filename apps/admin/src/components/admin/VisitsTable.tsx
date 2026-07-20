import React, { useState, useCallback, useMemo } from 'react';
import { Visit } from '@logmaster/types';
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
import { VisitorDetailsModal } from '@logmaster/ui';

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
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

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

    // Professional PDF export with logo and improved styling
    const exportPDF = useCallback(async () => {
        if (isExporting) return;
        
        setIsExporting(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const brandColor: [number, number, number] = [45, 212, 191]; // #2DD4BF
            const darkText: [number, number, number] = [31, 41, 55]; // #1F2937
            
            // Header background
            doc.setFillColor(...brandColor);
            doc.rect(0, 0, pageWidth, 35, 'F');
            
            // Logo placeholder circle
            doc.setFillColor(255, 255, 255);
            doc.circle(20, 17.5, 8, 'F');
            doc.setTextColor(...brandColor);
            doc.setFontSize(10).setFont('helvetica', 'bold');
            doc.text('T', 18.5, 20);
            
            // Company title
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16).setFont('helvetica', 'bold');
            doc.text('Industrias de Alimentos el Trébol', 35, 16);
            
            // Subtitle
            doc.setFontSize(11).setFont('helvetica', 'normal');
            doc.text('Reporte de Control de Visitas', 35, 25);
            
            // Generation info box
            doc.setFillColor(248, 250, 252); // Light background
            doc.roundedRect(14, 42, pageWidth - 28, 22, 2, 2, 'F');
            
            doc.setTextColor(...darkText);
            doc.setFontSize(9).setFont('helvetica', 'normal');
            const dateStr = new Date().toLocaleString('es-ES', { 
                dateStyle: 'long', 
                timeStyle: 'short' 
            });
            doc.text(`Generado por: ${username || 'Sistema'}`, 18, 50);
            doc.text(`Fecha: ${dateStr}`, 18, 58);
            doc.text(`Total de registros: ${visits.length}`, pageWidth - 18, 50, { align: 'right' });
            
            // Filters info if applied
            let startY = 72;
            const filterTexts: string[] = [];
            if (filters.status) filterTexts.push(`Estado: ${filters.status === 'active' ? 'Activos' : 'Completados'}`);
            if (filters.startDate) filterTexts.push(`Desde: ${filters.startDate}`);
            if (filters.endDate) filterTexts.push(`Hasta: ${filters.endDate}`);
            if (filters.search) filterTexts.push(`Búsqueda: "${filters.search}"`);
            if (filters.company) filterTexts.push(`Empresa: "${filters.company}"`);
            
            if (filterTexts.length > 0) {
                doc.setFontSize(8).setFont('helvetica', 'italic');
                doc.setTextColor(107, 114, 128);
                doc.text(`Filtros aplicados: ${filterTexts.join(' | ')}`, 14, 70);
                startY = 78;
            }
            
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
            
            // Generate table with professional styling
            autoTable(doc, {
                head: [headers],
                body: pdfTableData,
                startY: startY,
                styles: { 
                    font: 'helvetica', 
                    fontSize: 8,
                    cellPadding: 3,
                    overflow: 'linebreak'
                },
                headStyles: { 
                    fillColor: brandColor, 
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                alternateRowStyles: { 
                    fillColor: [248, 250, 252] // Light gray
                },
                columnStyles: {
                    0: { cellWidth: 35 }, // Visitante
                    1: { cellWidth: 30 }, // Empresa
                    2: { cellWidth: 30 }, // Motivo
                    3: { cellWidth: 25, halign: 'center' }, // Llegada
                    4: { cellWidth: 25, halign: 'center' }, // Entrada
                    5: { cellWidth: 25, halign: 'center' }, // Salida
                    6: { cellWidth: 20, halign: 'center' }  // Estado
                },
                didDrawPage: (data) => {
                    // Footer on each page
                    const pageCount = doc.getNumberOfPages();
                    const currentPage = data.pageNumber || 1;
                    
                    // Footer line
                    doc.setDrawColor(229, 231, 235);
                    doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
                    
                    // Footer text
                    doc.setFontSize(8);
                    doc.setTextColor(156, 163, 175);
                    doc.setFont('helvetica', 'normal');
                    doc.text(
                        `Página ${currentPage} de ${pageCount} | Documento generado el ${dateStr}`,
                        pageWidth / 2,
                        pageHeight - 12,
                        { align: 'center' }
                    );
                }
            });
            
            // Save PDF
            doc.save(`reporte-visitas-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error exporting PDF:', error);
        } finally {
            setIsExporting(false);
        }
    }, [isExporting, username, visits, tableData, filters]);

    // Professional Excel export with title, filters, and summary
    const exportExcel = useCallback(async () => {
        if (isExporting) return;
        
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Reporte de Visitas');
            
            // Brand colors
            const brandColor = 'FF2DD4BF'; // #2DD4BF
            const darkText = 'FF1F2937'; // #1F2937
            const lightGray = 'FFF3F4F6'; // #F3F4F6
            
            // Title rows
            worksheet.mergeCells('A1:G1');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'Industrias de Alimentos el Trébol';
            titleCell.font = { bold: true, size: 16, color: { argb: brandColor } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            
            worksheet.mergeCells('A2:G2');
            const subtitleCell = worksheet.getCell('A2');
            subtitleCell.value = 'Reporte de Control de Visitas';
            subtitleCell.font = { size: 12, color: { argb: 'FF6B7280' } };
            subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            
            // Info row
            const dateStr = new Date().toLocaleString('es-ES', { 
                dateStyle: 'long', 
                timeStyle: 'short' 
            });
            worksheet.mergeCells('A3:G3');
            const infoCell = worksheet.getCell('A3');
            infoCell.value = `Generado por: ${username || 'Sistema'} | Fecha: ${dateStr} | Total: ${visits.length} registros`;
            infoCell.font = { size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
            infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
            
            // Filters row (if any)
            let dataStartRow = 5;
            const filterTexts: string[] = [];
            if (filters.status) filterTexts.push(`Estado: ${filters.status === 'active' ? 'Activos' : 'Completados'}`);
            if (filters.startDate) filterTexts.push(`Desde: ${filters.startDate}`);
            if (filters.endDate) filterTexts.push(`Hasta: ${filters.endDate}`);
            if (filters.search) filterTexts.push(`Búsqueda: "${filters.search}"`);
            if (filters.company) filterTexts.push(`Empresa: "${filters.company}"`);
            
            if (filterTexts.length > 0) {
                worksheet.mergeCells('A4:G4');
                const filterCell = worksheet.getCell('A4');
                filterCell.value = `Filtros: ${filterTexts.join(' | ')}`;
                filterCell.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
                filterCell.alignment = { horizontal: 'center', vertical: 'middle' };
                dataStartRow = 6;
            }
            
            // Set column headers row
            const headerRowNumber = dataStartRow;
            worksheet.getRow(headerRowNumber).values = [
                'Visitante', 'Empresa', 'Motivo', 'Llegada', 'Entrada', 'Salida', 'Estado'
            ];
            
            // Set column widths
            worksheet.columns = [
                { key: 'visitorName', width: 28 },
                { key: 'company', width: 22 },
                { key: 'reason', width: 22 },
                { key: 'arrivalTime', width: 18 },
                { key: 'entryTime', width: 18 },
                { key: 'exitTime', width: 18 },
                { key: 'statusText', width: 14 }
            ];
            
            // Style header row
            const headerRow = worksheet.getRow(headerRowNumber);
            headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: brandColor }
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.height = 25;
            
            // Add borders to header
            headerRow.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: brandColor } },
                    left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                    bottom: { style: 'thin', color: { argb: brandColor } },
                    right: { style: 'thin', color: { argb: 'FFFFFFFF' } }
                };
            });
            
            // Add data rows
            tableData.forEach((visit, index) => {
                const rowNumber = headerRowNumber + 1 + index;
                const row = worksheet.getRow(rowNumber);
                const { intermittent_logs: _logs, Visitor: _visitor, ...exportable } = visit;
                row.values = exportable as typeof row.values;
                row.alignment = { vertical: 'middle', wrapText: true };
                row.height = 22;
                
                // Alternate row colors
                if (index % 2 === 1) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: lightGray }
                    };
                }
                
                // Add borders to each cell
                row.eachCell((cell, colNumber) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };
                    
                    // Status conditional formatting
                    if (colNumber === 7) { // Estado column
                        const status = cell.value as string;
                        if (status === 'Activo') {
                            cell.font = { bold: true, color: { argb: 'FF10B981' } }; // Green
                            cell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFD1FAE5' } // Light green
                            };
                        } else if (status === 'Completado') {
                            cell.font = { bold: true, color: { argb: 'FF3B82F6' } }; // Blue
                            cell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFDBEAFE' } // Light blue
                            };
                        }
                    }
                });
            });
            
            // Add auto-filters to header row
            worksheet.autoFilter = {
                from: { row: headerRowNumber, column: 1 },
                to: { row: headerRowNumber, column: 7 }
            };
            
            // Freeze panes (freeze title and header)
            worksheet.views = [
                { state: 'frozen', ySplit: headerRowNumber }
            ];
            
            // Summary row at the bottom
            const summaryRowNumber = headerRowNumber + tableData.length + 2;
            const activeCount = tableData.filter(v => v.statusText === 'Activo').length;
            const completedCount = tableData.filter(v => v.statusText === 'Completado').length;
            
            worksheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
            const summaryCell = worksheet.getCell(`A${summaryRowNumber}`);
            summaryCell.value = `Resumen: ${visits.length} total | ${activeCount} activas | ${completedCount} completadas`;
            summaryCell.font = { bold: true, size: 10, color: { argb: darkText } };
            summaryCell.alignment = { horizontal: 'left', vertical: 'middle' };
            
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
    }, [isExporting, tableData, visits, filters, username]);

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
                            <tr key={vis.id} onClick={() => setSelectedVisit(vis)} className="hover:bg-[color:var(--surface-2)] border-b border-[color:var(--border-1)] last:border-0 transition-colors cursor-pointer">
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
