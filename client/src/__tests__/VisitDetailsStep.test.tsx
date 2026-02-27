import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisitDetailsStep from '../../components/visit/VisitDetailsStep';

// Mock PhotoCapture — it uses webcam APIs unavailable in jsdom
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onCapture }: { onCapture: (img: string) => void }) => (
    <div>
      <button onClick={() => onCapture('data:image/png;base64,abc')}>Capturar Foto</button>
    </div>
  ),
}));

const baseProps = {
  reason: '',
  photoUrl: '',
  loading: false,
  canSubmit: false,
  onReasonChange: vi.fn(),
  onPhotoCapture: vi.fn(),
  onPhotoRetake: vi.fn(),
  onPrev: vi.fn(),
  getInputClass: (_v: boolean | null) => 'input-tech',
};

describe('VisitDetailsStep', () => {
  it('renders the reason input', () => {
    render(<VisitDetailsStep {...baseProps} />);
    expect(screen.getByPlaceholderText(/Reunión, Entrega/)).toBeInTheDocument();
  });

  it('calls onReasonChange when reason input changes', () => {
    const onReasonChange = vi.fn();
    render(<VisitDetailsStep {...baseProps} onReasonChange={onReasonChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Reunión, Entrega/), { target: { value: 'Reunión' } });
    expect(onReasonChange).toHaveBeenCalledWith('Reunión');
  });

  it('shows required photo message when photoUrl is empty', () => {
    render(<VisitDetailsStep {...baseProps} photoUrl="" />);
    expect(screen.getByText(/foto es obligatoria/)).toBeInTheDocument();
  });

  it('does NOT show required message when photo is provided', () => {
    render(<VisitDetailsStep {...baseProps} photoUrl="data:image/png;base64,abc" />);
    expect(screen.queryByText(/foto es obligatoria/)).not.toBeInTheDocument();
  });

  it('disables submit button when canSubmit is false', () => {
    render(<VisitDetailsStep {...baseProps} canSubmit={false} />);
    expect(screen.getByText(/REGISTRAR ACCESO/)).toBeDisabled();
  });

  it('enables submit button when canSubmit is true', () => {
    render(<VisitDetailsStep {...baseProps} canSubmit={true} />);
    expect(screen.getByText(/REGISTRAR ACCESO/)).not.toBeDisabled();
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

  it('calls onPhotoCapture when PhotoCapture fires a capture', () => {
    const onPhotoCapture = vi.fn();
    render(<VisitDetailsStep {...baseProps} onPhotoCapture={onPhotoCapture} />);
    fireEvent.click(screen.getByText('Capturar Foto'));
    expect(onPhotoCapture).toHaveBeenCalledWith('data:image/png;base64,abc');
  });
});
