import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordChangeModal } from '../PasswordChangeModal';
import { AuthAPI } from '../../services/api.v1';
import toast from 'react-hot-toast';

// Mock dependencies
vi.mock('../../services/api.v1', () => ({
    AuthAPI: {
        changePassword: vi.fn(),
    },
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
    success: vi.fn(),
    error: vi.fn(),
}));

const mockAuthAPI = vi.mocked(AuthAPI);
const mockToast = vi.mocked(toast);

describe('PasswordChangeModal', () => {
    const defaultProps = {
        show: true,
        onPasswordChanged: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render when show is false', () => {
        render(<PasswordChangeModal {...defaultProps} show={false} />);
        expect(screen.queryByText('Cambio de Contraseña Requerido')).not.toBeInTheDocument();
    });

    it('renders correctly when show is true', () => {
        render(<PasswordChangeModal {...defaultProps} />);
        
        expect(screen.getByText('Cambio de Contraseña Requerido')).toBeInTheDocument();
        expect(screen.getByText('Debes cambiar tu contraseña antes de continuar')).toBeInTheDocument();
        expect(screen.getByLabelText('Contraseña Actual')).toBeInTheDocument();
        expect(screen.getByLabelText('Nueva Contraseña')).toBeInTheDocument();
        expect(screen.getByLabelText('Confirmar Nueva Contraseña')).toBeInTheDocument();
        expect(screen.getByText('Cambiar Contraseña')).toBeInTheDocument();
    });

    it('shows all password requirements', () => {
        render(<PasswordChangeModal {...defaultProps} />);
        
        expect(screen.getByText('Requisitos de Contraseña:')).toBeInTheDocument();
        expect(screen.getByText('Mínimo 12 caracteres')).toBeInTheDocument();
        expect(screen.getByText('Máximo 128 caracteres')).toBeInTheDocument();
        expect(screen.getByText('Al menos una letra mayúscula')).toBeInTheDocument();
        expect(screen.getByText('Al menos una letra minúscula')).toBeInTheDocument();
        expect(screen.getByText('Al menos un número')).toBeInTheDocument();
        expect(screen.getByText('Al menos un carácter especial')).toBeInTheDocument();
    });

    it('validates empty current password', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeModal {...defaultProps} />);
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        expect(screen.getByText('La contraseña actual es requerida')).toBeInTheDocument();
    });

    it('validates empty new password', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeModal {...defaultProps} />);
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual');
        await user.type(currentPasswordInput, 'currentpass');
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        expect(screen.getByText('La nueva contraseña es requerida')).toBeInTheDocument();
    });

    it('validates password mismatch', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeModal {...defaultProps} />);
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual');
        const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
        const confirmPasswordInput = screen.getByLabelText('Confirmar Nueva Contraseña');
        
        await user.type(currentPasswordInput, 'currentpass');
        await user.type(newPasswordInput, 'NewPassword123!');
        await user.type(confirmPasswordInput, 'DifferentPassword123!');
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument();
    });

    it('validates password requirements', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeModal {...defaultProps} />);
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual');
        const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
        const confirmPasswordInput = screen.getByLabelText('Confirmar Nueva Contraseña');
        
        await user.type(currentPasswordInput, 'currentpass');
        await user.type(newPasswordInput, 'weak');
        await user.type(confirmPasswordInput, 'weak');
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        expect(screen.getByText('La nueva contraseña no cumple con todos los requisitos')).toBeInTheDocument();
    });

    it('shows password strength indicator', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeModal {...defaultProps} />);
        
        const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
        await user.type(newPasswordInput, 'StrongPassword123!');
        
        // Check if password requirements are marked as valid
        const checkIcons = screen.getAllByTestId('check-circle');
        expect(checkIcons.length).toBeGreaterThan(0);
    });

    it('toggles password visibility', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeModal {...defaultProps} />);
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual') as HTMLInputElement;
        const toggleButton = currentPasswordInput.nextElementSibling as HTMLButtonElement;
        
        expect(currentPasswordInput.type).toBe('password');
        
        await user.click(toggleButton);
        expect(currentPasswordInput.type).toBe('text');
        
        await user.click(toggleButton);
        expect(currentPasswordInput.type).toBe('password');
    });

    it('submits form successfully', async () => {
        const user = userEvent.setup();
        mockAuthAPI.changePassword.mockResolvedValue({ success: true });
        
        render(<PasswordChangeModal {...defaultProps} />);
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual');
        const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
        const confirmPasswordInput = screen.getByLabelText('Confirmar Nueva Contraseña');
        
        await user.type(currentPasswordInput, 'currentpass');
        await user.type(newPasswordInput, 'NewPassword123!');
        await user.type(confirmPasswordInput, 'NewPassword123!');
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        await waitFor(() => {
            expect(mockAuthAPI.changePassword).toHaveBeenCalledWith({
                currentPassword: 'currentpass',
                newPassword: 'NewPassword123!',
                confirmPassword: 'NewPassword123!',
            });
        });
        
        expect(mockToast.success).toHaveBeenCalledWith('¡Contraseña cambiada exitosamente!');
        expect(defaultProps.onPasswordChanged).toHaveBeenCalled();
    });

    it('handles API errors', async () => {
        const user = userEvent.setup();
        mockAuthAPI.changePassword.mockRejectedValue({
            response: {
                data: {
                    error: {
                        message: 'Contraseña actual incorrecta'
                    }
                }
            }
        });
        
        render(<PasswordChangeModal {...defaultProps} />);
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual');
        const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
        const confirmPasswordInput = screen.getByLabelText('Confirmar Nueva Contraseña');
        
        await user.type(currentPasswordInput, 'wrongpass');
        await user.type(newPasswordInput, 'NewPassword123!');
        await user.type(confirmPasswordInput, 'NewPassword123!');
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        await waitFor(() => {
            expect(screen.getByText('Contraseña actual incorrecta')).toBeInTheDocument();
        });
    });

    it('disables form during submission', async () => {
        const user = userEvent.setup();
        mockAuthAPI.changePassword.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
        
        render(<PasswordChangeModal {...defaultProps} />);
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual');
        const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
        const confirmPasswordInput = screen.getByLabelText('Confirmar Nueva Contraseña');
        
        await user.type(currentPasswordInput, 'currentpass');
        await user.type(newPasswordInput, 'NewPassword123!');
        await user.type(confirmPasswordInput, 'NewPassword123!');
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        expect(screen.getByText('Cambiando Contraseña...')).toBeInTheDocument();
        expect(screen.getByLabelText('Contraseña Actual')).toBeDisabled();
        expect(screen.getByLabelText('Nueva Contraseña')).toBeDisabled();
        expect(screen.getByLabelText('Confirmar Nueva Contraseña')).toBeDisabled();
    });

    it('clears errors when user starts typing', async () => {
        const user = userEvent.setup();
        render(<PasswordChangeModal {...defaultProps} />);
        
        const submitButton = screen.getByText('Cambiar Contraseña');
        await user.click(submitButton);
        
        expect(screen.getByText('La contraseña actual es requerida')).toBeInTheDocument();
        
        const currentPasswordInput = screen.getByLabelText('Contraseña Actual');
        await user.type(currentPasswordInput, 'currentpass');
        
        expect(screen.queryByText('La contraseña actual es requerida')).not.toBeInTheDocument();
    });

    it('shows info note', () => {
        render(<PasswordChangeModal {...defaultProps} />);
        
        expect(screen.getByText(/Nota:/)).toBeInTheDocument();
        expect(screen.getByText(/Esta ventana no se puede cerrar hasta que cambies tu contraseña/)).toBeInTheDocument();
    });
});
