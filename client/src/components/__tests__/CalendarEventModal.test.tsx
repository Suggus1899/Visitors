import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CalendarEventModal from '../CalendarEventModal';
import type { Visit } from '../../types';

describe('CalendarEventModal', () => {
    it('names the dialog and closes it with Escape', async () => {
        const onClose = vi.fn();
        const visit = { id: 1, status: 'completed', purpose: 'Prueba', Visitor: { first_name: 'Visitante', last_name: 'Ficticio', company: 'Ficticia', cedula: 'V-98989999' } } as Visit;
        render(<CalendarEventModal visit={visit} isOpen onClose={onClose} />);
        expect(screen.getByRole('dialog', { name: 'Detalles de la Visita (Calendario)' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cerrar detalles del calendario' })).toBeInTheDocument();
        await userEvent.setup().keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledOnce();
    });
});
