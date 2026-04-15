import React from 'react';
import { Bar } from 'react-chartjs-2';
import Download from 'lucide-react/dist/esm/icons/download';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import { ChartOptions, ChartData } from 'chart.js';
import { downloadChartPDF } from './pdfExport';

interface ReasonData { reason: string; count: number; }

interface ChartsRowProps {
    weekChartRef: React.RefObject<any>;
    dayChartRef: React.RefObject<any>;
    dayOfWeekChartRef: React.RefObject<any>;
    weekChartData: ChartData<'bar'>;
    perDayChartData: ChartData<'bar'>;
    dayOfWeekChartData: ChartData<'bar'>;
    chartOptions: ChartOptions<'bar'>;
    topReasons: ReasonData[];
    visitsByWeek: any[];
    visitsPerDay: any[];
    visitsByDayOfWeek: any[];
}

const ChartsRow = ({
    weekChartRef,
    dayChartRef,
    dayOfWeekChartRef,
    weekChartData,
    perDayChartData,
    dayOfWeekChartData,
    chartOptions,
    topReasons,
    visitsByWeek,
    visitsPerDay,
    visitsByDayOfWeek
}: ChartsRowProps) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="panel-tech rounded-lg p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-[color:var(--text-1)]">Visitantes por semana</h3>
                    <button onClick={() => downloadChartPDF(weekChartRef, 'visitantes_semana', 'Visitantes por Semana', { labels: visitsByWeek.map(d => d.label), values: visitsByWeek.map(d => d.count) }, topReasons)} className="btn-ghost px-2 py-2" title="Descargar PDF">
                        <Download size={18} />
                    </button>
                </div>
                <div className="h-48"><Bar ref={weekChartRef} data={weekChartData} options={chartOptions} /></div>
                <div className="flex items-center mt-3 p-2 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded text-xs text-[color:var(--text-3)]">
                    <AlertTriangle size={14} className="mr-2" />Semanas parciales incluidas.
                </div>
            </div>

            <div className="panel-tech rounded-lg p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-[color:var(--text-1)]">Visitantes por día</h3>
                    <button onClick={() => downloadChartPDF(dayChartRef, 'visitantes_dia', 'Visitantes por Día', { labels: visitsPerDay.map(d => new Date(d.date).toLocaleDateString('es-ES')), values: visitsPerDay.map(d => d.count) }, topReasons)} className="btn-ghost px-2 py-2" title="Descargar PDF">
                        <Download size={18} />
                    </button>
                </div>
                <div className="h-48"><Bar ref={dayChartRef} data={perDayChartData} options={chartOptions} /></div>
            </div>

            <div className="panel-tech rounded-lg p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-[color:var(--text-1)]">Por día de semana</h3>
                    <button onClick={() => downloadChartPDF(dayOfWeekChartRef, 'visitantes_dia_semana', 'Por Día de la Semana', { labels: visitsByDayOfWeek.map(d => d.dayName), values: visitsByDayOfWeek.map(d => d.count) }, topReasons)} className="btn-ghost px-2 py-2" title="Descargar PDF">
                        <Download size={18} />
                    </button>
                </div>
                <div className="h-48"><Bar ref={dayOfWeekChartRef} data={dayOfWeekChartData} options={chartOptions} /></div>
            </div>
        </div>
    );
};

export default ChartsRow;
