import { useState, type ImgHTMLAttributes } from 'react';
import { AuthenticatedImage } from './AuthenticatedImage';

type VisitorPhotoProps = Pick<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className'> & {
    src?: string;
    name: string;
};

export function VisitorPhoto({ src, alt, className, name }: VisitorPhotoProps) {
    const [failedSource, setFailedSource] = useState<string | null>(null);
    if (!src || failedSource === src) {
        return <div role="img" aria-label={`${alt || name}, sin fotografía`} className={`${className || ''} flex items-center justify-center font-bold text-xl text-[color:var(--text-2)]`}>
            {name.trim().charAt(0).toLocaleUpperCase() || '?'}
        </div>;
    }
    return <AuthenticatedImage src={src} alt={alt || name} className={className} onError={() => setFailedSource(src)} />;
}
