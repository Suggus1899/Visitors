'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import api from '../services/api.v1';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';

type ArcoRequest = {
    id: number;
    requestType: string;
    subjectCedula?: string | null;
    requestedByName: string;
    contactEmail?: string | null;
    reason?: string | null;
    status: 'pending' | 'in_progress' | 'completed' | 'rejected';
    createdAt: string;
    resolutionNotes?: string | null;
};

type SubjectAccess = {
    visitor: { cedula?: string; firstName?: string; lastName?: string; company?: string; email?: string | null; phone?: string | null };
    visits: { id: number; status: string; purpose: string; personToVisit: string; checkInTime?: string | null; checkOutTime?: string | null }[];
};

const statusLabels: Record<ArcoRequest['status'], string> = {
    pending: 'Pendiente', in_progress: 'En proceso', completed: 'Completada', rejected: 'Rechazada',
};

export default function PrivacyDashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const role = user?.role;
    const canCreate = role === 'operador' || role === 'admin' || role === 'root';
    const canRead = role === 'admin' || role === 'root' || role === 'auditor';
    const canRectify = role === 'operador' || role === 'admin' || role === 'root';
    const canManage = role === 'admin' || role === 'root';
    const [requests, setRequests] = useState<ArcoRequest[]>([]);
    const [cedula, setCedula] = useState('');
    const [requestedByName, setRequestedByName] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [requestType, setRequestType] = useState<'access' | 'rectification' | 'cancellation' | 'opposition'>('access');
    const [reason, setReason] = useState('');
    const [profile, setProfile] = useState<SubjectAccess | null>(null);
    const [verificationConfirmed, setVerificationConfirmed] = useState(false);
    const [verificationMethod, setVerificationMethod] = useState('');
    const [editPassword, setEditPassword] = useState('');
    const [correction, setCorrection] = useState({ firstName: '', lastName: '', company: '', jobTitle: '', email: '', phone: '' });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const loadRequests = useCallback(async () => {
        if (!canRead) return;
        try {
            const response = await api.get('/privacy/arco-requests?page=1&limit=100');
            setRequests(response.data.data.requests || []);
            setError('');
        } catch {
            setError('No se pudieron cargar las solicitudes de privacidad.');
        }
    }, [canRead]);

    useEffect(() => { void loadRequests(); }, [loadRequests]);

    const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true); setError(''); setMessage('');
        try {
            await api.post('/privacy/arco-requests', { requestType, cedula, requestedByName, contactEmail, reason });
            setMessage('Solicitud registrada.');
            setReason('');
            if (canRead) await loadRequests();
        } catch (cause) {
            setError((cause as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'No se pudo registrar la solicitud.');
        } finally { setBusy(false); }
    };

    const lookupSubject = async () => {
        if (!cedula.trim()) return;
        setBusy(true); setError(''); setMessage(''); setProfile(null);
        try {
            const response = await api.get(`/privacy/subjects/${encodeURIComponent(cedula.trim())}`);
            setProfile(response.data.data);
        } catch (cause) {
            setError((cause as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'No se pudo consultar la información.');
        } finally { setBusy(false); }
    };

    const rectifySubject = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const fields = Object.fromEntries(Object.entries(correction).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
        if (!Object.keys(fields).length) { setError('Indica al menos un dato que deba rectificarse.'); return; }
        setBusy(true); setError(''); setMessage('');
        try {
            await api.patch(`/privacy/subjects/${encodeURIComponent(cedula.trim())}`, { editPassword, ...fields });
            setMessage('Datos rectificados y cambio auditado.');
            setCorrection({ firstName: '', lastName: '', company: '', jobTitle: '', email: '', phone: '' });
            if (canRead) await lookupSubject();
        } catch (cause) {
            setError((cause as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'No se pudieron rectificar los datos.');
        } finally { setEditPassword(''); setBusy(false); }
    };

    const cancelSubject = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!verificationConfirmed || !verificationMethod.trim()) return;
        setBusy(true); setError(''); setMessage('');
        try {
            await api.delete(`/privacy/subjects/${encodeURIComponent(cedula.trim())}`, { data: { identityVerified: true, verificationMethod: verificationMethod.trim() } });
            setMessage('Datos personales cancelados; los eventos se conservaron anonimizados.');
            setProfile(null); setVerificationConfirmed(false); setVerificationMethod('');
            await loadRequests();
        } catch (cause) {
            setError((cause as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'No se pudieron cancelar los datos personales.');
        } finally { setBusy(false); }
    };

    const updateStatus = async (item: ArcoRequest, status: ArcoRequest['status']) => {
        setBusy(true); setError(''); setMessage('');
        try {
            await api.patch(`/privacy/arco-requests/${item.id}/status`, { status });
            await loadRequests();
            setMessage(`Solicitud #${item.id}: ${statusLabels[status].toLowerCase()}.`);
        } catch {
            setError('No se pudo actualizar el estado de la solicitud.');
        } finally { setBusy(false); }
    };

    return (
        <main className="min-h-screen bg-[color:var(--bg-0)] px-4 py-8 text-[color:var(--text-1)]">
            <div className="mx-auto max-w-6xl space-y-6">
                <header className="flex flex-wrap items-center justify-between gap-3 panel-tech rounded-xl p-5">
                    <div><h1 className="text-2xl font-display uppercase tracking-[0.16em]">Privacidad y solicitudes ARCO</h1><p className="text-sm text-[color:var(--text-3)]">Acceso, rectificación, cancelación y oposición de datos personales.</p></div>
                    <Button onClick={() => router.back()} className="btn-ghost border border-[color:var(--border-1)] px-4 py-2">Volver</Button>
                </header>
                {message && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-200">{message}</p>}
                {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-200">{error}</p>}

                {canCreate && <section className="panel-tech rounded-xl p-5" aria-labelledby="arco-create-title">
                    <h2 id="arco-create-title" className="mb-4 text-lg font-semibold">Registrar solicitud</h2>
                    <form onSubmit={submitRequest} className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-1 text-sm">Cédula de la persona<input className="input-tech w-full" value={cedula} onChange={event => { setCedula(event.target.value); setProfile(null); setVerificationConfirmed(false); }} required /></label>
                        <label className="space-y-1 text-sm">Tipo de solicitud<select className="input-tech w-full" value={requestType} onChange={event => setRequestType(event.target.value as typeof requestType)}><option value="access">Acceso</option><option value="rectification">Rectificación</option><option value="cancellation">Cancelación</option><option value="opposition">Oposición</option></select></label>
                        <label className="space-y-1 text-sm">Nombre de quien solicita<input className="input-tech w-full" value={requestedByName} onChange={event => setRequestedByName(event.target.value)} maxLength={120} required /></label>
                        <label className="space-y-1 text-sm">Correo de contacto<input className="input-tech w-full" type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} maxLength={200} /></label>
                        <label className="space-y-1 text-sm md:col-span-2">Detalle de la solicitud<textarea className="input-tech w-full" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={3} /></label>
                        <div className="md:col-span-2"><Button type="submit" disabled={busy || !requestedByName.trim()} className="btn-tech px-4 py-2">Registrar solicitud</Button></div>
                    </form>
                </section>}

                {(canRead || canRectify || canManage) && <section className="panel-tech space-y-4 rounded-xl p-5" aria-labelledby="subject-actions-title">
                    <div><h2 id="subject-actions-title" className="text-lg font-semibold">Gestión de información personal</h2><p className="text-sm text-[color:var(--text-3)]">Las acciones dependen del rol y se validan también en el servidor.</p></div>
                    {(canRead || canManage) && <div className="flex flex-wrap gap-3"><Button onClick={() => void lookupSubject()} disabled={busy || !cedula.trim()} className="btn-ghost border border-[color:var(--border-1)] px-4 py-2">Consultar información e historial</Button></div>}
                    {profile && <div className="space-y-3 rounded-lg border border-[color:var(--border-1)] bg-[color:var(--surface-1)] p-4">
                        <h3 className="font-semibold">{profile.visitor.firstName} {profile.visitor.lastName} · {profile.visitor.company}</h3>
                        <p className="text-sm text-[color:var(--text-3)]">{profile.visitor.cedula} · {profile.visitor.email || 'Sin correo'} · {profile.visitor.phone || 'Sin teléfono'}</p>
                        <h4 className="font-medium">Historial de visitas</h4>
                        {profile.visits.length ? <ul className="space-y-2">{profile.visits.map(visit => <li key={visit.id} className="rounded border border-[color:var(--border-1)] p-2 text-sm">{visit.status} · {visit.purpose} · {visit.personToVisit}</li>)}</ul> : <p className="text-sm text-[color:var(--text-3)]">No hay visitas registradas.</p>}
                    </div>}

                    {canRectify && <details className="rounded-lg border border-[color:var(--border-1)] p-4">
                        <summary className="cursor-pointer font-medium">Rectificar datos del visitante</summary>
                        <form onSubmit={rectifySubject} className="mt-4 grid gap-3 md:grid-cols-2">
                            {(['firstName', 'lastName', 'company', 'jobTitle', 'email', 'phone'] as const).map(field => <label key={field} className="space-y-1 text-sm">{{ firstName: 'Nombres', lastName: 'Apellidos', company: 'Empresa', jobTitle: 'Cargo', email: 'Correo', phone: 'Teléfono' }[field]}<input className="input-tech w-full" type={field === 'email' ? 'email' : 'text'} value={correction[field]} onChange={event => setCorrection(prev => ({ ...prev, [field]: event.target.value }))} /></label>)}
                            <label className="space-y-1 text-sm md:col-span-2">Contraseña de edición<input className="input-tech w-full" type="password" autoComplete="off" value={editPassword} onChange={event => setEditPassword(event.target.value)} required /></label>
                            <div className="md:col-span-2"><Button type="submit" disabled={busy || !cedula.trim() || !editPassword} className="btn-tech px-4 py-2">Guardar rectificación</Button></div>
                        </form>
                    </details>}

                    {canManage && <details className="rounded-lg border border-red-500/30 p-4">
                        <summary className="cursor-pointer font-medium text-red-200">Cancelar datos personales</summary>
                        <form onSubmit={cancelSubject} className="mt-4 space-y-3">
                            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={verificationConfirmed} onChange={event => setVerificationConfirmed(event.target.checked)} required /><span>Confirmo que completé el procedimiento de verificación de identidad de la persona.</span></label>
                            <label className="block space-y-1 text-sm">Procedimiento aplicado<input className="input-tech w-full" value={verificationMethod} onChange={event => setVerificationMethod(event.target.value)} maxLength={100} required placeholder="Describe la evidencia consultada sin copiar datos personales" /></label>
                            <Button type="submit" disabled={busy || !cedula.trim() || !verificationConfirmed || !verificationMethod.trim()} className="border border-red-400 bg-red-500/10 px-4 py-2 text-red-200">Confirmar cancelación de datos</Button>
                        </form>
                    </details>}
                </section>}

                {canRead && <section className="panel-tech rounded-xl p-5" aria-labelledby="arco-list-title">
                    <div className="mb-4 flex items-center justify-between gap-3"><h2 id="arco-list-title" className="text-lg font-semibold">Solicitudes recibidas</h2><Button onClick={() => void loadRequests()} disabled={busy} className="btn-ghost border border-[color:var(--border-1)] px-3 py-1.5">Actualizar</Button></div>
                    {requests.length === 0 ? <p className="text-sm text-[color:var(--text-3)]">No hay solicitudes para mostrar.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Tipo</th><th className="p-2">Persona</th><th className="p-2">Solicitante</th><th className="p-2">Fecha</th><th className="p-2">Estado</th></tr></thead><tbody>{requests.map(item => <tr key={item.id} className="border-t border-[color:var(--border-1)]"><td className="p-2">{item.requestType}</td><td className="p-2">{item.subjectCedula || 'Anonimizado'}</td><td className="p-2">{item.requestedByName}</td><td className="p-2">{new Date(item.createdAt).toLocaleDateString('es-VE')}</td><td className="p-2">{canManage ? <select aria-label={`Estado de solicitud ${item.id}`} className="input-tech" value={item.status} disabled={busy} onChange={event => void updateStatus(item, event.target.value as ArcoRequest['status'])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : statusLabels[item.status]}</td></tr>)}</tbody></table></div>}
                </section>}
            </div>
        </main>
    );
}
