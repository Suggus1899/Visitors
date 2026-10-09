import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AuditFilters from '../audit/AuditFilters';

describe('AuditFilters', () => {
    it('uses actions supplied by the server and names date controls', async () => {
        const change = vi.fn();
        render(<AuditFilters actions={['LOGIN', 'VISIT_CHECKOUT']} searchQuery="" setSearchQuery={vi.fn()} filterAction="" setFilterAction={change} filterStartDate="" setFilterStartDate={vi.fn()} filterEndDate="" setFilterEndDate={vi.fn()} filterUsername="" setFilterUsername={vi.fn()} />);
        await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Acción de auditoría' }), 'VISIT_CHECKOUT');
        expect(change).toHaveBeenCalledWith('VISIT_CHECKOUT');
        expect(screen.getByLabelText('Fecha inicial de auditoría')).toBeInTheDocument();
        expect(screen.getByLabelText('Fecha final de auditoría')).toBeInTheDocument();
    });
});
