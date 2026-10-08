import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminStatsCards from '../components/admin/AdminStatsCards';

describe('AdminStatsCards', () => {
  it('renders the "Visitas Totales" label', () => {
    render(<AdminStatsCards totalVisits={0} activeVisits={0} />);
    expect(screen.getByText(/Visitas Totales/i)).toBeInTheDocument();
  });

  it('renders the "Activas Ahora" label', () => {
    render(<AdminStatsCards totalVisits={0} activeVisits={0} />);
    expect(screen.getByText(/Activas Ahora/i)).toBeInTheDocument();
  });

  it('displays the correct totalVisits value', () => {
    render(<AdminStatsCards totalVisits={142} activeVisits={0} />);
    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('displays the correct activeVisits value', () => {
    render(<AdminStatsCards totalVisits={0} activeVisits={7} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('displays both values at once', () => {
    render(<AdminStatsCards totalVisits={200} activeVisits={12} />);
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders 0 values correctly (no crash)', () => {
    render(<AdminStatsCards totalVisits={0} activeVisits={0} />);
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(2);
  });
});
