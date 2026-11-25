import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Login from '../components/Login';
import AuthService from '../services/AuthService';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('../services/AuthService', () => ({ default: { login: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() }, Toaster: () => null }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const submit = (username: string, password: string) => {
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: username } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'INGRESAR' }));
};

describe('Login', () => {
    it.each([401, 404])('shows one generic message for HTTP %i so usernames are not disclosed', async status => {
        vi.mocked(AuthService.login).mockRejectedValueOnce({ response: { status } });
        render(<Login />);
        submit('operador', 'Incorrecta!123');
        expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.');
        expect(replace).not.toHaveBeenCalled();
    });

    it('asks for the missing field inline without calling the API', () => {
        render(<Login />);
        fireEvent.click(screen.getByRole('button', { name: 'INGRESAR' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu usuario.');
        expect(AuthService.login).not.toHaveBeenCalled();
    });

    it('routes each role to its landing page', async () => {
        vi.mocked(AuthService.login).mockResolvedValueOnce({ username: 'root', role: 'root', mustChangePassword: false } as never);
        render(<Login />);
        submit('root', 'Correcta!12345');
        await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/root'));
    });
});
