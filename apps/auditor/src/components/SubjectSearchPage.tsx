import { useState } from 'react';
import {
    UserSearch,
    Search,
    Download,
    FileText,
    Edit3,
    Trash2,
    Ban,
    User,
    Building2,
    Phone,
    Mail,
    Clock,
    History,
    Loader2,
    ImageIcon,
} from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useSubjectDataQuery, useExportSubjectDataMutation, useCreateArcoMutation } from '../hooks/useArcoQueries';
import { PageHeader } from './common/PageHeader';
import { ErrorState } from './common/ErrorState';
import { EmptyState } from './common/EmptyState';
import { downloadBlob, formatDateTime, formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';
import type { ArcoRequestType, SubjectVisitHistoryItem, SubjectEditHistoryItem } from '../types';

export const SubjectSearchPage = () => {
    const { currentTenant } = useTenant();
    const tenantSlug = currentTenant?.slug ?? null;

    const [cedula, setCedula] = useState('');
    const [searchedCedula, setSearchedCedula] = useState<string | null>(null);

    const subjectQuery = useSubjectDataQuery(tenantSlug, searchedCedula);
    const exportMutation = useExportSubjectDataMutation();
    const createArcoMutation = useCreateArcoMutation();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!cedula.trim()) {
            toast.error('Please enter a cedula');
            return;
        }
        setSearchedCedula(cedula.trim());
    };

    const handleExport = async () => {
        if (!tenantSlug || !searchedCedula) return;
        try {
            const blob = await exportMutation.mutateAsync({
                tenantSlug,
                cedula: searchedCedula,
                format: 'json',
            });
            downloadBlob(blob, `subject_data_${searchedCedula}_${new Date().toISOString().split('T')[0]}.json`);
            toast.success('Subject data exported');
        } catch {
            toast.error('Failed to export subject data');
        }
    };

    const handleInitiateArco = async (type: ArcoRequestType) => {
        if (!tenantSlug || !searchedCedula) return;
        const subject = subjectQuery.data;
        const reasonMap: Record<ArcoRequestType, string> = {
            access: 'Right of access requested by auditor',
            rectification: 'Rectification initiated by auditor on behalf of subject',
            cancellation: 'Cancellation requested by auditor on behalf of subject',
            opposition: 'Opposition requested by auditor on behalf of subject',
        };
        try {
            await createArcoMutation.mutateAsync({
                tenantSlug,
                payload: {
                    requestType: type,
                    subjectCedula: searchedCedula,
                    subjectName: subject ? `${subject.firstName} ${subject.lastName}`.trim() : undefined,
                    reason: reasonMap[type],
                },
            });
            toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} request created`);
        } catch {
            toast.error('Failed to create ARCO request');
        }
    };

    const subject = subjectQuery.data;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Subject Search"
                subtitle="Search and view all personal data held about a subject (ARCO right of access)"
                icon={UserSearch}
                readOnly={false}
            />

            {/* Search bar */}
            <div className="panel-tech rounded-xl p-6">
                <form onSubmit={handleSearch} className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 text-[color:var(--text-3)]" size={18} />
                        <input
                            type="text"
                            value={cedula}
                            onChange={(e) => setCedula(e.target.value)}
                            className="input-tech pl-10"
                            placeholder="Enter subject cedula (e.g. V-12345678)"
                        />
                    </div>
                    <button type="submit" className="btn-ghost px-6 py-2 gap-2" disabled={subjectQuery.isFetching}>
                        {subjectQuery.isFetching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        Search
                    </button>
                </form>
            </div>

            {/* Results */}
            {!searchedCedula && (
                <EmptyState
                    title="Search for a subject"
                    message="Enter a cedula above to view all personal data held about that subject."
                    icon={<UserSearch size={40} />}
                />
            )}

            {searchedCedula && subjectQuery.isLoading && (
                <div className="panel-tech rounded-xl p-12 flex items-center justify-center">
                    <Loader2 className="animate-spin text-[color:var(--accent-0)]" size={28} />
                </div>
            )}

            {searchedCedula && subjectQuery.isError && (
                <ErrorState
                    message="Failed to load subject data"
                    onRetry={() => subjectQuery.refetch()}
                />
            )}

            {searchedCedula && subject && !subjectQuery.isLoading && !subjectQuery.isError && (
                <div className="space-y-6">
                    {/* Action bar */}
                    <div className="panel-tech rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <User className="text-[color:var(--accent-0)]" size={20} />
                            <span className="font-medium text-[color:var(--text-1)]">
                                {subject.firstName} {subject.lastName}
                            </span>
                            <span className="text-xs text-[color:var(--text-3)] font-mono">
                                {subject.cedula}
                            </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={handleExport}
                                disabled={exportMutation.isPending}
                                className="btn-ghost px-3 py-2 text-sm gap-2"
                            >
                                <Download size={16} /> Export Data
                            </button>
                            <button
                                onClick={() => handleInitiateArco('rectification')}
                                disabled={createArcoMutation.isPending}
                                className="btn-ghost px-3 py-2 text-sm gap-2"
                            >
                                <Edit3 size={16} /> Rectification
                            </button>
                            <button
                                onClick={() => handleInitiateArco('cancellation')}
                                disabled={createArcoMutation.isPending}
                                className="btn-ghost px-3 py-2 text-sm gap-2"
                            >
                                <Trash2 size={16} /> Cancellation
                            </button>
                            <button
                                onClick={() => handleInitiateArco('opposition')}
                                disabled={createArcoMutation.isPending}
                                className="btn-ghost px-3 py-2 text-sm gap-2"
                            >
                                <Ban size={16} /> Opposition
                            </button>
                        </div>
                    </div>

                    {/* Personal info + photos */}
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,280px)_1fr] gap-6">
                        {/* Photos */}
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-2">
                                    Visitor Photo
                                </p>
                                {subject.photoUrl ? (
                                    <div className="aspect-square w-full rounded-xl overflow-hidden border border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                                        <img src={subject.photoUrl} alt="Visitor" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="aspect-square w-full rounded-xl bg-[color:var(--surface-2)] flex flex-col items-center justify-center border border-dashed border-[color:var(--border-1)]">
                                        <ImageIcon className="text-[color:var(--text-3)] mb-2" size={28} />
                                        <span className="text-[color:var(--text-3)] text-xs">No photo</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-2">
                                    ID Photo
                                </p>
                                {subject.idPhotoUrl ? (
                                    <div className="aspect-video w-full rounded-xl overflow-hidden border border-[color:var(--border-1)] bg-[color:var(--surface-2)]">
                                        <img src={subject.idPhotoUrl} alt="ID" className="w-full h-full object-contain" />
                                    </div>
                                ) : (
                                    <div className="aspect-video w-full rounded-xl bg-[color:var(--surface-2)] flex flex-col items-center justify-center border border-dashed border-[color:var(--border-1)]">
                                        <FileText className="text-[color:var(--text-3)] mb-2" size={28} />
                                        <span className="text-[color:var(--text-3)] text-xs">No ID photo</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Personal data */}
                        <div className="panel-tech rounded-xl p-6 space-y-4">
                            <h3 className="text-sm font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2">
                                Personal Information
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <InfoRow icon={User} label="First Name" value={subject.firstName} />
                                <InfoRow icon={User} label="Last Name" value={subject.lastName} />
                                <InfoRow icon={Building2} label="Company" value={subject.company} />
                                <InfoRow icon={Building2} label="Job Title" value={subject.jobTitle || '—'} />
                                <InfoRow icon={Mail} label="Email" value={subject.email || '—'} />
                                <InfoRow icon={Phone} label="Phone" value={subject.phone || '—'} />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[color:var(--border-1)]">
                                <InfoRow icon={Clock} label="Registered" value={subject.createdAt ? formatDate(subject.createdAt) : '—'} />
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Blocked</p>
                                    <span className={`text-sm font-medium ${subject.isBlocked ? 'text-red-300' : 'text-emerald-300'}`}>
                                        {subject.isBlocked ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>
                            {subject.observations && (
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)] mb-1">Observations</p>
                                    <p className="text-sm text-[color:var(--text-2)]">{subject.observations}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Visit history */}
                    <div className="panel-tech rounded-xl p-6">
                        <h3 className="text-sm font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2 mb-4 flex items-center gap-2">
                            <History size={16} /> Visit History ({subject.visitHistory.length})
                        </h3>
                        {subject.visitHistory.length === 0 ? (
                            <p className="text-sm text-[color:var(--text-3)] py-4 text-center">No visit history</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-[color:var(--text-2)]">
                                    <thead className="text-[color:var(--text-3)] font-semibold uppercase text-xs border-b border-[color:var(--border-1)]">
                                        <tr>
                                            <th className="px-3 py-2">Purpose</th>
                                            <th className="px-3 py-2">Check In</th>
                                            <th className="px-3 py-2">Check Out</th>
                                            <th className="px-3 py-2">Status</th>
                                            <th className="px-3 py-2">Department</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[color:var(--border-1)]">
                                        {subject.visitHistory.map((visit: SubjectVisitHistoryItem) => (
                                            <tr key={visit.id} className="hover:bg-[color:var(--surface-2)]">
                                                <td className="px-3 py-2">{visit.purpose}</td>
                                                <td className="px-3 py-2 text-xs text-[color:var(--text-3)]">{formatDateTime(visit.checkInTime)}</td>
                                                <td className="px-3 py-2 text-xs text-[color:var(--text-3)]">{visit.checkOutTime ? formatDateTime(visit.checkOutTime) : '—'}</td>
                                                <td className="px-3 py-2">
                                                    <span className="text-xs uppercase">{visit.status}</span>
                                                </td>
                                                <td className="px-3 py-2 text-xs">{visit.targetDepartment || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Edit history */}
                    <div className="panel-tech rounded-xl p-6">
                        <h3 className="text-sm font-bold text-[color:var(--accent-0)] uppercase tracking-[0.2em] border-b border-[color:var(--border-1)] pb-2 mb-4 flex items-center gap-2">
                            <Edit3 size={16} /> Edit History ({subject.editHistory.length})
                        </h3>
                        {subject.editHistory.length === 0 ? (
                            <p className="text-sm text-[color:var(--text-3)] py-4 text-center">No edit history</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-[color:var(--text-2)]">
                                    <thead className="text-[color:var(--text-3)] font-semibold uppercase text-xs border-b border-[color:var(--border-1)]">
                                        <tr>
                                            <th className="px-3 py-2">Field</th>
                                            <th className="px-3 py-2">Old Value</th>
                                            <th className="px-3 py-2">New Value</th>
                                            <th className="px-3 py-2">Edited By</th>
                                            <th className="px-3 py-2">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[color:var(--border-1)]">
                                        {subject.editHistory.map((edit: SubjectEditHistoryItem) => (
                                            <tr key={edit.id} className="hover:bg-[color:var(--surface-2)]">
                                                <td className="px-3 py-2 font-medium">{edit.field}</td>
                                                <td className="px-3 py-2 text-xs text-red-300">{edit.oldValue || '—'}</td>
                                                <td className="px-3 py-2 text-xs text-emerald-300">{edit.newValue || '—'}</td>
                                                <td className="px-3 py-2 text-xs">{edit.editedBy}</td>
                                                <td className="px-3 py-2 text-xs text-[color:var(--text-3)]">{formatDateTime(edit.editedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const InfoRow = ({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof User;
    label: string;
    value: string;
}) => (
    <div className="flex items-start gap-3">
        <Icon size={15} className="text-[color:var(--accent-0)] mt-0.5 flex-shrink-0" />
        <div>
            <p className="text-xs uppercase tracking-wider text-[color:var(--text-3)]">{label}</p>
            <p className="text-sm font-medium text-[color:var(--text-1)]">{value}</p>
        </div>
    </div>
);
