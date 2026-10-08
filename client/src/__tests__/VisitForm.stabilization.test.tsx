import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VisitForm from '../components/VisitForm';
import { VisitService } from '../services/api.v1';
import { safeNotify } from '../utils/safeNotify';

const fixtures = vi.hoisted(() => ({
    visitor: { cedula: 'V-12345678', first_name: 'Persona', last_name: 'Ficticia', company: 'Empresa ficticia', job_title: 'Proveedor', phone: '+584121234567', isBlocked: false },
    save: vi.fn(), playError: vi.fn(), playSuccess: vi.fn()
}));
vi.mock('../hooks/useVisitQueries', () => ({
    useVisitorQuery: () => ({ data: fixtures.visitor, isLoading: false, refetch: async () => ({ data: fixtures.visitor }) }),
    useUpdateVisitorMutation: () => ({ mutateAsync: fixtures.save })
}));
vi.mock('../hooks/useSoundFeedback', () => ({ useSoundFeedback: () => ({ playError: fixtures.playError, playSuccess: fixtures.playSuccess }) }));
vi.mock('../components/PhotoCapture', () => ({ default: () => null }));
vi.mock('../components/VisitorHistoryModal', () => ({ default: () => null }));
vi.mock('../services/api.v1', () => ({ default: { get: vi.fn().mockRejectedValue(new Error('No photograph in this fixture')) }, VisitService: { getCompanies: vi.fn().mockResolvedValue([]), checkIn: vi.fn().mockResolvedValue({}) } }));
vi.mock('../utils/safeNotify', () => ({ safeNotify: { error: vi.fn(), success: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); fixtures.save.mockReset(); });
afterEach(cleanup);

async function editExistingVisitor() {
    render(<VisitForm onVisitAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByTitle('Buscar visitante'));
    await screen.findByDisplayValue('Persona');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByPlaceholderText('4121234567')).toHaveValue('4121234567');
    fireEvent.change(screen.getByDisplayValue('Proveedor'), { target: { value: 'Proveedor actualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Área o departamento' }), { target: { value: 'Operaciones' } });
    fireEvent.change(screen.getByPlaceholderText(/Ing. Carlos Machado/), { target: { value: 'Responsable ficticio' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Motivo de la visita' }), { target: { value: 'Entrega' } });
    fireEvent.click(screen.getByRole('checkbox'));
}

describe('existing visitor registration and protected edits', () => {
    it('requires an edit password and does not silently register unsaved changes', async () => {
        await editExistingVisitor();
        fireEvent.click(screen.getByRole('button', { name: 'REGISTRAR ENTRADA' }));
        await waitFor(() => expect(safeNotify.error).toHaveBeenCalled());
        expect(fixtures.save).not.toHaveBeenCalled();
        expect(VisitService.checkIn).not.toHaveBeenCalled();
    });

    it('stops registration when the protected visitor update fails', async () => {
        fixtures.save.mockRejectedValueOnce(new Error('Contraseña de edición incorrecta'));
        await editExistingVisitor();
        fireEvent.change(screen.getByLabelText('Contraseña de edición'), { target: { value: 'wrong-password' } });
        fireEvent.click(screen.getByRole('button', { name: 'REGISTRAR ENTRADA' }));
        await waitFor(() => expect(safeNotify.error).toHaveBeenCalledWith('Contraseña de edición incorrecta'));
        expect(VisitService.checkIn).not.toHaveBeenCalled();
    });

    it('saves with the password before check-in, keeps the phone prefix and clears the password', async () => {
        fixtures.save.mockResolvedValueOnce({});
        await editExistingVisitor();
        fireEvent.change(screen.getByLabelText('Contraseña de edición'), { target: { value: 'OnlyInMemory!18' } });
        fireEvent.click(screen.getByRole('button', { name: 'PONER EN ESPERA' }));
        await waitFor(() => expect(VisitService.checkIn).toHaveBeenCalled());
        expect(fixtures.save).toHaveBeenCalledWith(expect.objectContaining({ cedula: 'V-12345678', data: expect.objectContaining({ editPassword: 'OnlyInMemory!18', job_title: 'Proveedor actualizado', phone: '+584121234567' }) }));
        expect(fixtures.save.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(VisitService.checkIn).mock.invocationCallOrder[0]);
        expect(VisitService.checkIn).toHaveBeenCalledWith(expect.objectContaining({ visitorData: expect.objectContaining({ phone: '+584121234567', photoBase64: undefined }) }));
        fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
        fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        expect(screen.getByLabelText('Contraseña de edición')).toHaveValue('');
    });
});
