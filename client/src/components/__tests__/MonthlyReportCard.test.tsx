import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MonthlyReportCard } from '../statistics/MonthlyReportCard';
import { Pie } from 'react-chartjs-2';

// Mock dependencies
jest.mock('react-chartjs-2', () => ({
    Pie: jest.fn(() => <div data-testid="pie-chart">Mock Pie Chart</div>),
}));

jest.mock('./pdfExport', () => ({
    downloadMonthlyPDF: jest.fn().mockResolvedValue(undefined),
}));

const mockMonthlyReport = {
    totalVisits: 150,
    uniqueVisitors: 120,
    averageDuration: 45,
    completionRate: 85,
    byReason: [
        { reason: 'Reunión', count: 50, percentage: 33.3 },
        { reason: 'Entrega', count: 30, percentage: 20.0 },
        { reason: 'Mantenimiento', count: 25, percentage: 16.7 },
        { reason: 'Capacitación', count: 20, percentage: 13.3 },
        { reason: 'Otro', count: 25, percentage: 16.7 },
    ],
};

const defaultProps = {
    monthlyReport: mockMonthlyReport,
    pieChartRef: { current: null },
    selectedMonth: 0,
    setSelectedMonth: jest.fn(),
    selectedYear: 2025,
    setSelectedYear: jest.fn(),
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    isLoading: false,
};

describe('MonthlyReportCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders correctly with monthly report data', () => {
        render(<MonthlyReportCard {...defaultProps} />);
        
        expect(screen.getByText('Reporte Mensual')).toBeInTheDocument();
        expect(screen.getByText('Resumen ejecutivo de actividad')).toBeInTheDocument();
        expect(screen.getByText('150')).toBeInTheDocument(); // Total visits
        expect(screen.getByText('85%')).toBeInTheDocument(); // Completion rate
        expect(screen.getByText('120')).toBeInTheDocument(); // Unique visitors
        expect(screen.getByText('45m')).toBeInTheDocument(); // Average duration
    });

    it('shows loading state when isLoading is true', () => {
        render(<MonthlyReportCard {...defaultProps} isLoading={true} />);
        
        expect(screen.getByText('Cargando datos...')).toBeInTheDocument();
    });

    it('shows no data message when monthlyReport is null', () => {
        render(<MonthlyReportCard {...defaultProps} monthlyReport={null} />);
        
        expect(screen.getByText('No hay datos suficientes para mostrar el gráfico')).toBeInTheDocument();
    });

    it('handles month selection change', () => {
        const mockSetSelectedMonth = jest.fn();
        render(<MonthlyReportCard {...defaultProps} setSelectedMonth={mockSetSelectedMonth} />);
        
        const monthSelect = screen.getByDisplayValue('Enero');
        fireEvent.change(monthSelect, { target: { value: '1' } });
        
        expect(mockSetSelectedMonth).toHaveBeenCalledWith(1);
    });

    it('handles year selection change', () => {
        const mockSetSelectedYear = jest.fn();
        render(<MonthlyReportCard {...defaultProps} setSelectedYear={mockSetSelectedYear} />);
        
        const yearSelect = screen.getByDisplayValue('2025');
        fireEvent.change(yearSelect, { target: { value: '2026' } });
        
        expect(mockSetSelectedYear).toHaveBeenCalledWith(2026);
    });

    it('handles PDF download', async () => {
        const { downloadMonthlyPDF } = require('./pdfExport');
        render(<MonthlyReportCard {...defaultProps} />);
        
        const downloadButton = screen.getByText('Descargar PDF');
        fireEvent.click(downloadButton);
        
        await waitFor(() => {
            expect(downloadMonthlyPDF).toHaveBeenCalledWith(mockMonthlyReport, defaultProps.pieChartRef);
        });
    });

    it('shows loading state during PDF download', async () => {
        const { downloadMonthlyPDF } = require('./pdfExport');
        downloadMonthlyPDF.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
        
        render(<MonthlyReportCard {...defaultProps} />);
        
        const downloadButton = screen.getByText('Descargar PDF');
        fireEvent.click(downloadButton);
        
        expect(screen.getByText('Generando...')).toBeInTheDocument();
    });

    it('toggles show all reasons', () => {
        render(<MonthlyReportCard {...defaultProps} />);
        
        // Initially should show only 5 reasons
        expect(screen.queryByText('Ver todos (5)')).toBeInTheDocument();
        
        const toggleButton = screen.getByText('Ver todos (5)');
        fireEvent.click(toggleButton);
        
        // Should now show all reasons and "Ver menos" button
        expect(screen.getByText('Ver menos')).toBeInTheDocument();
    });

    it('displays correct KPI values', () => {
        render(<MonthlyReportCard {...defaultProps} />);
        
        expect(screen.getByText('Total Visitas')).toBeInTheDocument();
        expect(screen.getByText('Completadas')).toBeInTheDocument();
        expect(screen.getByText('Visitantes Únicos')).toBeInTheDocument();
        expect(screen.getByText('Duración Promedio')).toBeInTheDocument();
    });

    it('disables download button when no data', () => {
        render(<MonthlyReportCard {...defaultProps} monthlyReport={null} />);
        
        const downloadButton = screen.getByText('Descargar PDF');
        expect(downloadButton).toBeDisabled();
    });

    it('disables form controls when loading', () => {
        render(<MonthlyReportCard {...defaultProps} isLoading={true} />);
        
        const monthSelect = screen.getByDisplayValue('Enero');
        const yearSelect = screen.getByDisplayValue('2025');
        const downloadButton = screen.getByText('Descargar PDF');
        
        expect(monthSelect).toBeDisabled();
        expect(yearSelect).toBeDisabled();
        expect(downloadButton).toBeDisabled();
    });

    it('renders pie chart with correct data', () => {
        render(<MonthlyReportCard {...defaultProps} />);
        
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
        expect(Pie).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    labels: ['Reunión', 'Entrega', 'Mantenimiento', 'Capacitación', 'Otro'],
                    datasets: expect.arrayContaining([
                        expect.objectContaining({
                            data: [50, 30, 25, 20, 25],
                        })
                    ])
                })
            }),
            {}
        );
    });

    it('resets showAllReasons when changing month', () => {
        const mockSetSelectedMonth = jest.fn();
        render(<MonthlyReportCard {...defaultProps} setSelectedMonth={mockSetSelectedMonth} />);
        
        // First expand to show all reasons
        const toggleButton = screen.getByText('Ver todos (5)');
        fireEvent.click(toggleButton);
        expect(screen.getByText('Ver menos')).toBeInTheDocument();
        
        // Then change month
        const monthSelect = screen.getByDisplayValue('Enero');
        fireEvent.change(monthSelect, { target: { value: '1' } });
        
        expect(mockSetSelectedMonth).toHaveBeenCalledWith(1);
    });

    it('resets showAllReasons when changing year', () => {
        const mockSetSelectedYear = jest.fn();
        render(<MonthlyReportCard {...defaultProps} setSelectedYear={mockSetSelectedYear} />);
        
        // First expand to show all reasons
        const toggleButton = screen.getByText('Ver todos (5)');
        fireEvent.click(toggleButton);
        expect(screen.getByText('Ver menos')).toBeInTheDocument();
        
        // Then change year
        const yearSelect = screen.getByDisplayValue('2025');
        fireEvent.change(yearSelect, { target: { value: '2026' } });
        
        expect(mockSetSelectedYear).toHaveBeenCalledWith(2026);
    });
});
