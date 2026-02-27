import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisitorInfoStep from '../../components/visit/VisitorInfoStep';

const baseProps = {
  formData: { company: '', job_title: '', email: '', phone: '' },
  phoneCode: '+58',
  companySuggestions: [],
  showSuggestions: false,
  validation: {
    company: null as boolean | null,
    email: null as boolean | null,
    phone: null as boolean | null,
  },
  canProceed: false,
  onCompanyChange: vi.fn(),
  onCompanyFocus: vi.fn(),
  onCompanyBlur: vi.fn(),
  onSelectCompany: vi.fn(),
  onFormDataChange: vi.fn(),
  onEmailChange: vi.fn(),
  onPhoneCodeChange: vi.fn(),
  onNext: vi.fn(),
  onPrev: vi.fn(),
  getInputClass: (_v: boolean | null) => 'input-tech',
};

describe('VisitorInfoStep', () => {
  it('renders company, job title, email, and phone fields', () => {
    render(<VisitorInfoStep {...baseProps} />);
    expect(screen.getByPlaceholderText('Nombre de la empresa')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ej: Gerente, Técnico, etc.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('email@empresa.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('4121234567')).toBeInTheDocument();
  });

  it('calls onCompanyChange when company input changes', () => {
    const onCompanyChange = vi.fn();
    render(<VisitorInfoStep {...baseProps} onCompanyChange={onCompanyChange} />);
    fireEvent.change(screen.getByPlaceholderText('Nombre de la empresa'), { target: { value: 'Acme' } });
    expect(onCompanyChange).toHaveBeenCalledWith('Acme');
  });

  it('calls onEmailChange when email input changes', () => {
    const onEmailChange = vi.fn();
    render(<VisitorInfoStep {...baseProps} onEmailChange={onEmailChange} />);
    fireEvent.change(screen.getByPlaceholderText('email@empresa.com'), { target: { value: 'test@test.com' } });
    expect(onEmailChange).toHaveBeenCalledWith('test@test.com');
  });

  it('calls onPhoneCodeChange when phone code select changes', () => {
    const onPhoneCodeChange = vi.fn();
    render(<VisitorInfoStep {...baseProps} onPhoneCodeChange={onPhoneCodeChange} />);
    fireEvent.change(screen.getByDisplayValue('+58'), { target: { value: '+1' } });
    expect(onPhoneCodeChange).toHaveBeenCalledWith('+1');
  });

  it('disables Next button when canProceed is false', () => {
    render(<VisitorInfoStep {...baseProps} canProceed={false} />);
    const nextBtns = screen.getAllByText(/Siguiente/);
    expect(nextBtns[0]).toBeDisabled();
  });

  it('enables Next button when canProceed is true', () => {
    render(<VisitorInfoStep {...baseProps} canProceed={true} />);
    const nextBtns = screen.getAllByText(/Siguiente/);
    expect(nextBtns[0]).not.toBeDisabled();
  });

  it('calls onNext when Next is clicked and canProceed is true', () => {
    const onNext = vi.fn();
    render(<VisitorInfoStep {...baseProps} canProceed={true} onNext={onNext} />);
    fireEvent.click(screen.getAllByText(/Siguiente/)[0]);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onPrev when Atrás button is clicked', () => {
    const onPrev = vi.fn();
    render(<VisitorInfoStep {...baseProps} onPrev={onPrev} />);
    fireEvent.click(screen.getByText(/Atrás/));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('shows company suggestions when showSuggestions is true and there are matches', () => {
    render(<VisitorInfoStep
      {...baseProps}
      formData={{ ...baseProps.formData, company: 'Acme' }}
      companySuggestions={['Acme Corp', 'Acme Ltd']}
      showSuggestions={true}
    />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
  });

  it('calls onSelectCompany when a suggestion is clicked', () => {
    const onSelectCompany = vi.fn();
    render(<VisitorInfoStep
      {...baseProps}
      formData={{ ...baseProps.formData, company: 'ac' }}
      companySuggestions={['Acme Corp']}
      showSuggestions={true}
      onSelectCompany={onSelectCompany}
    />);
    fireEvent.click(screen.getByText('Acme Corp'));
    expect(onSelectCompany).toHaveBeenCalledWith('Acme Corp');
  });

  it('does not show suggestions when showSuggestions is false', () => {
    render(<VisitorInfoStep
      {...baseProps}
      companySuggestions={['Acme Corp']}
      showSuggestions={false}
    />);
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });
});
