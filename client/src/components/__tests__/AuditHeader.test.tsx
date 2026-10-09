import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AuditHeader from '../audit/AuditHeader';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'auditor' } }) }));
vi.mock('../ThemeToggle', () => ({ ThemeToggle: () => null }));

describe('AuditHeader accessibility', () => {
    it('names mobile actions and supports keyboard auto-refresh', async () => {
        const change = vi.fn();
        render(<MemoryRouter><AuditHeader autoRefresh={false} setAutoRefresh={change}
            handleExport={vi.fn()} handleLogout={vi.fn()} fetchData={vi.fn()} loading={false} /></MemoryRouter>);
        for (const name of ['Exportar auditoría', 'Actualizar auditoría', 'Cerrar sesión']) {
            expect(screen.getByRole('button', { name })).toBeEnabled();
        }
        const toggle = screen.getByRole('switch', { name: 'Actualización automática' });
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        toggle.focus();
        await userEvent.setup().keyboard('{Enter}');
        expect(change).toHaveBeenCalledWith(true);
    });
});
