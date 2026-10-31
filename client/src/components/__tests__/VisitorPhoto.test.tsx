import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VisitorPhoto } from '../VisitorPhoto';

vi.mock('../AuthenticatedImage', () => ({
    AuthenticatedImage: ({ onError, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ''} onError={onError} />,
}));

describe('VisitorPhoto', () => {
    it('uses a local initial when the authenticated image fails', () => {
        const { container } = render(<VisitorPhoto src="/api/v1/visitors/fixture/photo" alt="Visitante ficticio" name="Ficticio Prueba" />);
        fireEvent.error(screen.getByRole('img', { name: 'Visitante ficticio' }));
        expect(screen.getByRole('img', { name: 'Visitante ficticio, sin fotografía' })).toHaveTextContent('F');
        expect(container.querySelector('[src^="http"]')).toBeNull();
    });

    it('shows the local initial when no photo is available', () => {
        render(<VisitorPhoto alt="Visitante ficticio" name="Ficticio Prueba" />);
        expect(screen.getByRole('img', { name: 'Visitante ficticio, sin fotografía' })).toHaveTextContent('F');
    });

    it('tries a new photo source after the previous source failed', () => {
        const { rerender } = render(<VisitorPhoto src="/api/v1/visitors/fixture/photo-old" alt="Visitante ficticio" name="Ficticio Prueba" />);
        fireEvent.error(screen.getByRole('img', { name: 'Visitante ficticio' }));
        rerender(<VisitorPhoto src="/api/v1/visitors/fixture/photo-new" alt="Visitante ficticio" name="Ficticio Prueba" />);
        expect(screen.getByRole('img', { name: 'Visitante ficticio' })).toHaveAttribute('src', '/api/v1/visitors/fixture/photo-new');
    });
});
