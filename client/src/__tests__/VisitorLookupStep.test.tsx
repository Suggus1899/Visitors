import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisitorLookupStep from '../../components/visit/VisitorLookupStep';

const baseProps = {
  cedula: '',
  cedulaError: '',
  formData: { first_name: '', last_name: '' },
  validation: { cedula: null as boolean | null, first_name: null as boolean | null, last_name: null as boolean | null },
  loading: false,
  canProceed: false,
  onCedulaChange: vi.fn(),
  onSearch: vi.fn(),
  onFormDataChange: vi.fn(),
  onShowHistory: vi.fn(),
  onNext: vi.fn(),
  getInputClass: (valid: boolean | null) =>
    `input-tech ${valid === null ? '' : valid ? 'valid' : 'invalid'}`,
};

describe('VisitorLookupStep', () => {
  it('renders cedula input field', () => {
    render(<VisitorLookupStep {...baseProps} />);
    expect(screen.getByPlaceholderText('Ej: 12345678')).toBeInTheDocument();
  });

  it('renders first name and last name fields', () => {
    render(<VisitorLookupStep {...baseProps} />);
    expect(screen.getByPlaceholderText('Juan Carlos')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Pérez García')).toBeInTheDocument();
  });

  it('calls onCedulaChange when cedula input changes', () => {
    const onCedulaChange = vi.fn();
    render(<VisitorLookupStep {...baseProps} onCedulaChange={onCedulaChange} />);
    fireEvent.change(screen.getByPlaceholderText('Ej: 12345678'), { target: { value: '12345' } });
    expect(onCedulaChange).toHaveBeenCalledWith('12345');
  });

  it('calls onSearch when the search button is clicked', () => {
    const onSearch = vi.fn();
    render(<VisitorLookupStep {...baseProps} onSearch={onSearch} />);
    const searchBtn = screen.getByTitle('Buscar visitante');
    fireEvent.click(searchBtn);
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it('disables the Next button when canProceed is false', () => {
    render(<VisitorLookupStep {...baseProps} canProceed={false} />);
    const nextBtn = screen.getByText(/Siguiente/);
    expect(nextBtn).toBeDisabled();
  });

  it('enables the Next button when canProceed is true', () => {
    render(<VisitorLookupStep {...baseProps} canProceed={true} />);
    const nextBtn = screen.getByText(/Siguiente/);
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onNext when the Next button is clicked and canProceed is true', () => {
    const onNext = vi.fn();
    render(<VisitorLookupStep {...baseProps} canProceed={true} onNext={onNext} />);
    fireEvent.click(screen.getByText(/Siguiente/));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows cedula error message when cedulaError is set', () => {
    render(<VisitorLookupStep {...baseProps} cedulaError="La cédula debe tener 7-8 dígitos" />);
    expect(screen.getByText('La cédula debe tener 7-8 dígitos')).toBeInTheDocument();
  });

  it('does NOT show history button when cedula is not valid', () => {
    render(<VisitorLookupStep {...baseProps} validation={{ cedula: false, first_name: null, last_name: null }} />);
    expect(screen.queryByTitle('Ver historial de visitas')).not.toBeInTheDocument();
  });

  it('shows the history button when cedula is valid', () => {
    render(<VisitorLookupStep {...baseProps} validation={{ cedula: true, first_name: null, last_name: null }} />);
    expect(screen.getByTitle('Ver historial de visitas')).toBeInTheDocument();
  });

  it('calls onShowHistory when history button is clicked', () => {
    const onShowHistory = vi.fn();
    render(<VisitorLookupStep
      {...baseProps}
      validation={{ cedula: true, first_name: null, last_name: null }}
      onShowHistory={onShowHistory}
    />);
    fireEvent.click(screen.getByTitle('Ver historial de visitas'));
    expect(onShowHistory).toHaveBeenCalledOnce();
  });

  it('calls onFormDataChange when first name input changes', () => {
    const onFormDataChange = vi.fn();
    render(<VisitorLookupStep {...baseProps} onFormDataChange={onFormDataChange} />);
    fireEvent.change(screen.getByPlaceholderText('Juan Carlos'), { target: { value: 'Mario' } });
    expect(onFormDataChange).toHaveBeenCalledWith('first_name', 'Mario');
  });

  it('disables search button while loading', () => {
    render(<VisitorLookupStep {...baseProps} loading={true} />);
    expect(screen.getByTitle('Buscar visitante')).toBeDisabled();
  });
});
