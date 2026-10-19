import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PhotoCapture from '../PhotoCapture';

vi.mock('react-webcam', async () => {
  const React = await import('react');
  const Webcam = React.forwardRef<HTMLVideoElement, React.ComponentProps<'video'>>((props, ref) => <video ref={ref} {...props} />);
  Webcam.displayName = 'Webcam';
  return { default: Webcam };
});

describe('photo capture accessibility', () => {
  it('opens the camera from the keyboard', async () => {
    const user = userEvent.setup();
    render(<PhotoCapture onCapture={vi.fn()} onRetake={vi.fn()} />);
    const openCamera = screen.getByRole('button', { name: 'Usar cámara' });
    openCamera.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Capturar (3s)' })).toBeInTheDocument();
  });
});
