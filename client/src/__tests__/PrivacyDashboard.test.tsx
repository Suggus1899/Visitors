import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrivacyDashboard from '../components/PrivacyDashboard';

const fixture = vi.hoisted(() => ({ role: 'admin' as string, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: fixture.role, username: 'fixture' } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock('../services/api.v1', () => ({ default: { get: fixture.get, post: fixture.post, patch: fixture.patch, delete: fixture.delete } }));

beforeEach(() => {
    fixture.role = 'admin';
    vi.clearAllMocks();
    fixture.get.mockResolvedValue({ data: { data: { requests: [] } } });
    fixture.delete.mockResolvedValue({ data: { success: true } });
});
afterEach(() => cleanup());

describe('privacy role matrix', () => {
    it('keeps the auditor read-only while allowing request and subject review', async () => {
        fixture.role = 'auditor';
        fixture.get.mockResolvedValue({ data: { data: { requests: [{ id: 8, requestType: 'access', subjectCedula: 'V-00000001', requestedByName: 'Persona ficticia', status: 'pending', createdAt: '2026-10-01T12:00:00Z' }] } } });
        render(<PrivacyDashboard />);
        expect(await screen.findByText('Persona ficticia')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Consultar información e historial' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Registrar solicitud' })).not.toBeInTheDocument();
        expect(screen.queryByText('Rectificar datos del visitante')).not.toBeInTheDocument();
        expect(screen.queryByText('Cancelar datos personales')).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: /Estado de solicitud/ })).not.toBeInTheDocument();
        expect(fixture.patch).not.toHaveBeenCalled();
        expect(fixture.delete).not.toHaveBeenCalled();
    });

    it('does not load or expose privacy writes for demo sessions', () => {
        fixture.role = 'demo';
        render(<PrivacyDashboard />);
        expect(screen.queryByRole('button', { name: 'Registrar solicitud' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Confirmar cancelación de datos' })).not.toBeInTheDocument();
        expect(fixture.get).not.toHaveBeenCalled();
        expect(fixture.post).not.toHaveBeenCalled();
        expect(fixture.patch).not.toHaveBeenCalled();
        expect(fixture.delete).not.toHaveBeenCalled();
    });

    it('requires explicit identity confirmation and a procedure before personal-data cancellation', async () => {
        render(<PrivacyDashboard />);
        await screen.findByRole('heading', { name: 'Privacidad y solicitudes ARCO' });
        await userEvent.type(screen.getByLabelText('Cédula de la persona'), 'V-00000001');
        await userEvent.click(screen.getByText('Cancelar datos personales'));
        const submit = screen.getByRole('button', { name: 'Confirmar cancelación de datos' });
        expect(submit).toBeDisabled();
        await userEvent.type(screen.getByLabelText('Procedimiento aplicado'), 'Documento original');
        expect(submit).toBeDisabled();
        await userEvent.click(screen.getByRole('checkbox'));
        expect(submit).toBeEnabled();
        await userEvent.click(submit);
        await waitFor(() => expect(fixture.delete).toHaveBeenCalledWith('/privacy/subjects/V-00000001', {
            data: { identityVerified: true, verificationMethod: 'Documento original' },
        }));
        expect(fixture.patch).not.toHaveBeenCalled();
        expect(fixture.post).not.toHaveBeenCalled();
    });
});
