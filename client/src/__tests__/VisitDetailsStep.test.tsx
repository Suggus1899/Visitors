import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisitDetailsStep from '../components/visit/VisitDetailsStep';

// Mock PhotoCapture — it uses webcam APIs unavailable in jsdom
vi.mock('../components/PhotoCapture', () => ({
  default: ({ onCapture }: { onCapture: (img: string) => void }) => (
    <div>
      <button onClick={() => onCapture('data:image/png;base64,abc')}>Capturar Foto</button>
    </div>
  ),
}));

const baseProps = {
  formData: {
    target_department: '',
    host_person: '',
    area: '',
    department: '',
    reason: '',
    photo_url: '',
    id_photo_url: '',
    consent_accepted: false
  },
  loading: false,
  canSubmit: false,
  onFormDataChange: vi.fn(),
  onPhotoCapture: vi.fn(),
  onPhotoRetake: vi.fn(),
  onIdPhotoCapture: vi.fn(),
  onIdPhotoRetake: vi.fn(),
  onSaveStatus: vi.fn(),
  onPrev: vi.fn(),
  getInputClass: (_v: boolean | null) => 'input-tech',
};

describe('VisitDetailsStep', () => {
  it('renders the target_department input', () => {
    render(<VisitDetailsStep {...baseProps} />);
    expect(screen.getByPlaceholderText(/Recursos Humanos, Finanzas/i)).toBeInTheDocument();
  });

  it('renders the host_person input', () => {
    render(<VisitDetailsStep {...baseProps} />);
    expect(screen.getByPlaceholderText(/Ing\. Carlos Machado/i)).toBeInTheDocument();
  });

  it('renders the area input', () => {
    render(<VisitDetailsStep {...baseProps} />);
    expect(screen.getByPlaceholderText(/Oficina Principal, Almacén 2/i)).toBeInTheDocument();
  });

  it('calls onFormDataChange when target_department input changes', () => {
    const onFormDataChange = vi.fn();
    render(<VisitDetailsStep {...baseProps} onFormDataChange={onFormDataChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Recursos Humanos, Finanzas/i), { target: { value: 'Gerencia' } });
    expect(onFormDataChange).toHaveBeenCalledWith('target_department', 'Gerencia');
  });

  it('calls onFormDataChange when host_person input changes', () => {
    const onFormDataChange = vi.fn();
    render(<VisitDetailsStep {...baseProps} onFormDataChange={onFormDataChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Ing\. Carlos Machado/i), { target: { value: 'Carlos López' } });
    expect(onFormDataChange).toHaveBeenCalledWith('host_person', 'Carlos López');
  });

  it('calls onFormDataChange when reason input changes', () => {
    const onFormDataChange = vi.fn();
    render(<VisitDetailsStep {...baseProps} onFormDataChange={onFormDataChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Indique el motivo de la visita/i), { target: { value: 'Reunión comercial' } });
    expect(onFormDataChange).toHaveBeenCalledWith('reason', 'Reunión comercial');
  });

  it('shows required photo message when photo_url is empty', () => {
    render(<VisitDetailsStep {...baseProps} formData={{...baseProps.formData, photo_url: ''}} />);
    expect(screen.getByText(/foto del rostro es obligatoria/i)).toBeInTheDocument();
  });

  it('does NOT show required message when photo is provided', () => {
    render(<VisitDetailsStep {...baseProps} formData={{...baseProps.formData, photo_url: 'data:image/png;base64,abc'}} />);
    expect(screen.queryByText(/foto del rostro es obligatoria/i)).not.toBeInTheDocument();
  });

  it('disables submit button when canSubmit is false', () => {
    render(<VisitDetailsStep {...baseProps} canSubmit={false} />);
    expect(screen.getByText(/REGISTRAR ENTRADA/)).toBeDisabled();
  });

  it('enables submit button when canSubmit is true', () => {
    render(<VisitDetailsStep {...baseProps} canSubmit={true} />);
    expect(screen.getByText(/REGISTRAR ENTRADA/)).not.toBeDisabled();
  });

  it('disables submit button while loading even if canSubmit is true', () => {
    render(<VisitDetailsStep {...baseProps} canSubmit={true} loading={true} />);
    const btn = screen.getByText(/Registrando\.\.\./).closest('button');
    expect(btn).toBeDisabled();
  });

  it('shows "Registrando..." text while loading', () => {
    render(<VisitDetailsStep {...baseProps} loading={true} />);
    expect(screen.getByText(/Registrando\.\.\./)).toBeInTheDocument();
  });

  it('calls onPrev when Atrás is clicked', () => {
    const onPrev = vi.fn();
    render(<VisitDetailsStep {...baseProps} onPrev={onPrev} />);
    fireEvent.click(screen.getByText(/Atrás/));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('calls onPhotoCapture when first PhotoCapture fires a capture', () => {
    const onPhotoCapture = vi.fn();
    render(<VisitDetailsStep {...baseProps} onPhotoCapture={onPhotoCapture} />);
    fireEvent.click(screen.getAllByText('Capturar Foto')[0]);
    expect(onPhotoCapture).toHaveBeenCalledWith('data:image/png;base64,abc');
  });
});
