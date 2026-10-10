import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AuditHeader from '../audit/AuditHeader';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'auditor' } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../ThemeToggle', () => ({ ThemeToggle: () => null }));

describe('AuditHeader accessibility', () => {
    it('names mobile actions and supports keyboard auto-refresh', async () => {
        const change = vi.fn();
        render(<AuditHeader autoRefresh={false} setAutoRefresh={change}
            handleExport={vi.fn()} handleLogout={vi.fn()} fetchData={vi.fn()} loading={false} />);
        for (const name of ['Exportar auditoría', 'Actualizar auditoría', 'Cerrar sesión']) {
            expect(screen.getByRole('button', { name })).toBeEnabled();
        }
        const toggle = screen.getByRole('switch', { name: 'Actualización automática' });
        expect(toggle).not.toBeChecked();
        toggle.focus();
        await userEvent.setup().keyboard(' ');
        expect(change).toHaveBeenCalledWith(true);
    });
});
