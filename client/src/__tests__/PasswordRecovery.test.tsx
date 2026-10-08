import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPassword from '../components/ForgotPassword';
import ResetPassword from '../components/ResetPassword';
import api from '../services/api.v1';

vi.mock('../services/api.v1', () => ({ default: { post: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('password recovery screens', () => {
    it.each(['existing-account', 'unknown-account'])('uses the same generic message for %s', async username => {
        vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true } });
        render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
        fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: username } });
        fireEvent.click(screen.getByRole('button', { name: 'ENVIAR ENLACE' }));
        expect(await screen.findByText(/Si la cuenta tiene correo registrado/)).toBeInTheDocument();
        expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { username });
        expect(screen.queryByText(/consola|simulado/i)).not.toBeInTheDocument();
    });

    it('prefills the link token and shows a server rejection without navigating away', async () => {
        vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: { message: 'Token expirado' } } } });
        render(<MemoryRouter initialEntries={['/reset-password?token=fictitious-token']}><ResetPassword /></MemoryRouter>);
        expect(screen.getByLabelText('Token de seguridad')).toHaveValue('fictitious-token');
        fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewFictitious!18' } });
        fireEvent.click(screen.getByRole('button', { name: 'CAMBIAR CONTRASEÑA' }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Token expirado'));
        expect(api.post).toHaveBeenCalledWith('/auth/reset-password', { token: 'fictitious-token', newPassword: 'NewFictitious!18' });
    });
});
