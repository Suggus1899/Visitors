import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WaitingVisits from '../components/WaitingVisits';
import type { Visit } from '../types';

const fixture = vi.hoisted(() => ({ role: 'operador' as string, cancel: vi.fn(), admit: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: fixture.role } }) }));
vi.mock('../hooks/useVisitQueries', () => ({
    useWaitingVisitsQuery: () => ({ data: [{ id: 21, status: 'waiting', visitor_cedula: 'V-00000021', purpose: 'Entrega ficticia', check_in_time: '2026-10-01T12:00:00Z', Visitor: { first_name: 'Visitante', last_name: 'Ficticio', company: 'Empresa ficticia', cedula: 'V-00000021' } } as Visit], isLoading: false, isError: false }),
    useAdmitVisitorMutation: () => ({ mutateAsync: fixture.admit }),
    useCancelWaitingVisitMutation: () => ({ mutateAsync: fixture.cancel }),
    useInvalidateVisitQueries: () => vi.fn(),
}));
vi.mock('../services/api.v1', () => ({ VisitService: { getVisitorPhotoUrl: () => null } }));
vi.mock('../components/AuthenticatedImage', () => ({ AuthenticatedImage: () => null }));
vi.mock('../components/visit/VisitorDetailsModal', () => ({ VisitorDetailsModal: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: fixture.success, error: fixture.error } }));

beforeEach(() => {
    fixture.role = 'operador';
    vi.clearAllMocks();
    fixture.cancel.mockResolvedValue({});
});
afterEach(() => cleanup());

describe('cancellation of waiting visits', () => {
    it('lets an operator submit a required reason and refreshes through the mutation', async () => {
        render(<WaitingVisits onVisitAdmitted={vi.fn()} />);
        await userEvent.click(screen.getByRole('button', { name: 'CANCELAR VISITA' }));
        const submit = screen.getByRole('button', { name: 'Confirmar cancelación' });
        expect(submit).toBeDisabled();
        await userEvent.type(screen.getByLabelText('Motivo de cancelación'), 'El anfitrión suspendió la visita');
        expect(submit).toBeEnabled();
        await userEvent.click(submit);
        await waitFor(() => expect(fixture.cancel).toHaveBeenCalledWith({ id: 21, reason: 'El anfitrión suspendió la visita' }));
        expect(fixture.success).toHaveBeenCalledWith('Visita cancelada');
    });

    it.each(['auditor', 'demo'])('hides cancellation controls for %s', role => {
        fixture.role = role;
        render(<WaitingVisits onVisitAdmitted={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'CANCELAR VISITA' })).not.toBeInTheDocument();
        expect(fixture.cancel).not.toHaveBeenCalled();
    });
});
