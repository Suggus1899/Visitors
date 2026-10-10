import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthenticatedImage } from '../components/AuthenticatedImage';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { VisitorDetailsModal } from '../components/visit/VisitorDetailsModal';
import api, { VisitService } from '../services/api.v1';
import { API_URL } from '../config/env';
import type { Visit } from '../types';

const session = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: session }) }));
vi.mock('../services/api.v1', () => ({
    default: { get: vi.fn() },
    VisitService: { getEditHistory: vi.fn().mockResolvedValue([]), getEditHistoryByCedula: vi.fn().mockResolvedValue([]),
        getVisitorPhotoUrl: vi.fn().mockReturnValue(null), getVisitorIdPhotoUrl: vi.fn().mockReturnValue(null),
        getVisitorByCedula: vi.fn().mockResolvedValue({ first_name: 'Persona', last_name: 'Ficticia', company: 'Empresa ficticia', job_title: 'Proveedor', phone: '+584121234567', isBlocked: false }), verifyEditPassword: vi.fn(), updateVisitor: vi.fn() }
}));
const visit = { id: 12, visitor_cedula: 'V-12345678', status: 'completed', purpose: 'Entrega',
    Visitor: { first_name: 'Persona', last_name: 'Ficticia', company: 'Empresa ficticia', isBlocked: false } } as Visit;

beforeEach(() => {
    session.role = 'admin';
    vi.clearAllMocks();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn().mockReturnValue('blob:private'), revokeObjectURL: vi.fn() }));
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(['picture']) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('authenticated photographs', () => {
    it('notifies the existing fallback when a protected photograph cannot be loaded', async () => {
        vi.mocked(api.get).mockRejectedValueOnce(new Error('Not found'));
        const onError = vi.fn();
        render(<AuthenticatedImage src={API_URL + '/visitors/V-12345678/photo'} alt="Foto" onError={onError} />);
        await waitFor(() => expect(onError).toHaveBeenCalledOnce());
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('uses the authenticated Blob client and revokes URLs on replacement and unmount', async () => {
        const source = API_URL + '/visitors/V-12345678/photo';
        const view = render(<AuthenticatedImage src={source} alt="Foto" />);
        await waitFor(() => expect(screen.getByAltText('Foto')).toHaveAttribute('src', 'blob:private'));
        expect(api.get).toHaveBeenCalledWith('/visitors/V-12345678/photo', expect.objectContaining({ responseType: 'blob', signal: expect.any(AbortSignal) }));
        view.rerender(<AuthenticatedImage src={source + '?changed=1'} alt="Foto" />);
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
        view.unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('does not create a URL for a response arriving after logout/unmount', async () => {
        let resolve!: (value: { data: Blob }) => void;
        vi.mocked(api.get).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const view = render(<AuthenticatedImage src={API_URL + '/visitors/V-12345678/photo'} alt="Foto" />);
        const options = vi.mocked(api.get).mock.calls[0][1]!;
        view.unmount();
        expect(options.signal!.aborted).toBe(true);
        resolve({ data: new Blob(['late']) });
        await Promise.resolve();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('previews captured data locally and never sends credentials to an external image URL', () => {
        const view = render(<AuthenticatedImage src="data:image/png;base64,abc" alt="Foto" />);
        expect(screen.getByAltText('Foto')).toHaveAttribute('src', 'data:image/png;base64,abc');
        view.rerender(<AuthenticatedImage src="https://other.invalid/visitors/photo" alt="Foto" />);
        expect(screen.getByAltText('Foto')).not.toHaveAttribute('src');
        expect(api.get).not.toHaveBeenCalled();
    });
});

describe('shadcn dialogs and visitor edit callers', () => {
    it('supports Escape and clears notes after an external close', async () => {
        const cancel = vi.fn();
        const props = { isOpen: true, title: 'Cerrar visita', message: 'Confirmar salida', notesLabel: 'Notas', onCancel: cancel, onConfirm: vi.fn() };
        const view = render(<ConfirmDialog {...props} />);
        expect(screen.getByRole('dialog', { name: 'Cerrar visita' })).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('Notas'), 'Nota ficticia');
        await userEvent.keyboard('{Escape}');
        expect(cancel).toHaveBeenCalledOnce();
        view.rerender(<ConfirmDialog {...props} isOpen={false} />);
        view.rerender(<ConfirmDialog {...props} />);
        expect(screen.getByLabelText('Notas')).toHaveValue('');
    });

    it.each(['auditor', 'demo'])('hides visitor editing for %s', async role => {
        session.role = role;
        render(<VisitorDetailsModal visit={visit} isOpen onClose={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    });

    it('hides editing and photographic requests for anonymized historical events', () => {
        render(<VisitorDetailsModal visit={{ ...visit, visitor_cedula: null }} isOpen onClose={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
        expect(VisitService.getVisitorPhotoUrl).not.toHaveBeenCalled();
    });

    it('sends the password at save time and preserves a boolean blocking change', async () => {
        vi.mocked(VisitService.verifyEditPassword).mockResolvedValue(true);
        vi.mocked(VisitService.updateVisitor).mockResolvedValue(visit.Visitor!);
        render(<VisitorDetailsModal visit={visit} isOpen onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
        fireEvent.change(screen.getByLabelText('Contraseña de edición'), { target: { value: 'OnlyInMemory!18' } });
        fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
        await screen.findByRole('dialog', { name: 'Editar Visitante' });
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
        await waitFor(() => expect(VisitService.updateVisitor).toHaveBeenCalledWith(visit.visitor_cedula, expect.objectContaining({ editPassword: 'OnlyInMemory!18', isBlocked: true, visitId: visit.id, jobTitle: 'Proveedor', phone: '+584121234567' })));
        await screen.findByRole('button', { name: 'Editar' });
        fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
        expect(screen.getByLabelText('Contraseña de edición')).toHaveValue('');
    });

    it('allows an operator to edit personal data while hiding the blocking control', async () => {
        session.role = 'operador';
        vi.mocked(VisitService.verifyEditPassword).mockResolvedValue(true);
        render(<VisitorDetailsModal visit={visit} isOpen onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
        fireEvent.change(screen.getByLabelText('Contraseña de edición'), { target: { value: 'OnlyInMemory!18' } });
        fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
        const dialog = await screen.findByRole('dialog', { name: 'Editar Visitante' });
        expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    });
});
