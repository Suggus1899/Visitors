import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import api from '../../services/api.v1';
import SuperAdminDashboard from '../SuperAdminDashboard';

vi.mock('../../services/api.v1', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'root', username: 'fixture_root' }, logout: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('root account editing', () => {
    it('keeps the root role fixed while allowing an email update', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: 42, username: 'fixture_root', role: 'root', email: 'root@example.test', mustChangePassword: false }] } });
        vi.mocked(api.put).mockResolvedValue({ data: { success: true } });
        const user = userEvent.setup();
        render(<MemoryRouter><SuperAdminDashboard /></MemoryRouter>);
        await user.click(await screen.findByRole('button', { name: 'Editar' }));
        expect(screen.getByRole('combobox', { name: 'Rol' })).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveValue('root');
        await user.clear(screen.getByRole('textbox', { name: 'Correo electrónico' }));
        await user.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'changed@example.test');
        await user.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
        await waitFor(() => expect(api.put).toHaveBeenCalledOnce());
        const [path, body] = vi.mocked(api.put).mock.calls[0];
        expect(path).toBe('/superadmin/users/42');
        expect(JSON.parse(JSON.stringify(body))).toEqual({ username: 'fixture_root', email: 'changed@example.test' });
    });
});
