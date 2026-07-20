import { useState } from 'react';
import {
    FileText,
    Download,
    Calendar,
    Loader2,
    BarChart3,
    ShieldCheck,
    Users,
    KeyRound,
    GitCompare,
} from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useGenerateReportMutation } from '../hooks/useReportQueries';
import { PageHeader } from './common/PageHeader';
import { downloadBlob, todayISO, daysAgoISO } from '../utils/helpers';
import toast from 'react-hot-toast';
import type { ReportType, ReportFormat } from '../types';

const REPORT_TYPES: {
    type: ReportType;
    label: string;
    description: string;
    icon: typeof FileText;
}[] = [
    {
        type: 'audit_summary',
        label: 'Audit Summary Report',
        description: 'Comprehensive overview of all audit activity within a date range',
        icon: FileText,
    },
    {
        type: 'monthly_compliance',
        label: 'Monthly Compliance Report',
        description: 'GDPR / Ley 25.326 compliance status for a specific month',
        icon: ShieldCheck,
    },
    {
        type: 'visitor_activity',
        label: 'Visitor Activity Report',
        description: 'Visitor movements and activity within a date range',
        icon: Users,
    },
    {
        type: 'access_report',
        label: 'Access Report',
        description: 'System access events (logins, logouts, failed attempts)',
        icon: KeyRound,
    },
    {
        type: 'comparison',
        label: 'Comparison Report',
        description: 'Month-over-month comparison of audit metrics',
        icon: GitCompare,
    },
];

export const ReportsPage = () => {
    const { currentTenant } = useTenant();
    const tenantSlug = currentTenant?.slug ?? null;

    const [startDate, setStartDate] = useState(daysAgoISO(30));
    const [endDate, setEndDate] = useState(todayISO());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [generatingType, setGeneratingType] = useState<ReportType | null>(null);

    const generateMutation = useGenerateReportMutation();

    const handleGenerate = async (type: ReportType, format: ReportFormat) => {
        if (!tenantSlug) return;
        setGeneratingType(type);
        try {
            const blob = await generateMutation.mutateAsync({
                tenantSlug,
                payload: {
                    type,
                    format,
                    startDate,
                    endDate,
                    month,
                    year,
                },
            });
            const ext = format === 'pdf' ? 'pdf' : 'csv';
            downloadBlob(blob, `${type}_${new Date().toISOString().split('T')[0]}.${ext}`);
            toast.success(`${format.toUpperCase()} report generated`);
        } catch {
            toast.error('Failed to generate report');
        } finally {
            setGeneratingType(null);
        }
    };

    const needsDateRange = (type: ReportType): boolean => type !== 'monthly_compliance' && type !== 'comparison';
    const needsMonthYear = (type: ReportType): boolean => type === 'monthly_compliance' || type === 'comparison';

    return (
        <div className="space-y-6">
            <PageHeader
                title="Reports"
                subtitle="Generate and download audit, compliance, and activity reports"
                icon={FileText}
                readOnly={false}
            />

            {/* Date range / month-year selector */}
            <div className="panel-tech rounded-xl p-6">
                <h3 className="text-sm font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <Calendar size={16} /> Date Range
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="input-tech"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="input-tech"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Month
                        </label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="input-tech"
                        >
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                    {new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[color:var(--text-3)] uppercase tracking-wider mb-2">
                            Year
                        </label>
                        <input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="input-tech"
                            min={2020}
                            max={new Date().getFullYear() + 1}
                        />
                    </div>
                </div>
            </div>

            {/* Report cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REPORT_TYPES.map((report) => {
                    const Icon = report.icon;
                    const isGenerating = generatingType === report.type;
                    return (
                        <div key={report.type} className="panel-tech rounded-xl p-6">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="p-3 rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--border-1)]">
                                    <Icon className="text-[color:var(--accent-0)]" size={24} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-display uppercase tracking-[0.15em] text-sm text-[color:var(--text-1)]">
                                        {report.label}
                                    </h3>
                                    <p className="text-xs text-[color:var(--text-3)] mt-1">
                                        {report.description}
                                    </p>
                                    <div className="flex gap-2 mt-2 text-xs text-[color:var(--text-3)]">
                                        {needsDateRange(report.type) && (
                                            <span className="flex items-center gap-1">
                                                <Calendar size={12} /> {startDate} → {endDate}
                                            </span>
                                        )}
                                        {needsMonthYear(report.type) && (
                                            <span className="flex items-center gap-1">
                                                <BarChart3 size={12} /> {new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' })} {year}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleGenerate(report.type, 'pdf')}
                                    disabled={isGenerating}
                                    className="flex-1 btn-ghost py-2 text-sm gap-2 disabled:opacity-50"
                                >
                                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    PDF
                                </button>
                                <button
                                    onClick={() => handleGenerate(report.type, 'csv')}
                                    disabled={isGenerating}
                                    className="flex-1 btn-ghost py-2 text-sm gap-2 disabled:opacity-50"
                                >
                                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    CSV
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
