import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import api from '../services/api.v1';
import { API_URL } from '../config/env';

export function AuthenticatedImage({ src, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    const element = useRef<HTMLImageElement>(null);
    const [image, setImage] = useState<{ source: string; url: string } | null>(null);
    const source = typeof src === 'string' ? src : undefined;
    const localImage = source?.startsWith('data:image/') || source?.startsWith('blob:');
    useEffect(() => {
        if (!source || localImage || !source.startsWith(API_URL + '/visitors/')) return;
        const controller = new AbortController();
        let objectUrl: string | undefined;
        api.get<Blob>(source.slice(API_URL.length), { responseType: 'blob', signal: controller.signal }).then(response => {
            if (controller.signal.aborted) return;
            objectUrl = URL.createObjectURL(response.data);
            setImage({ source, url: objectUrl });
        }).catch(() => {
            if (controller.signal.aborted) return;
            setImage(null);
            element.current?.dispatchEvent(new Event('error'));
        });
        return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [source, localImage]);
    return <img {...props} alt={alt} ref={element} src={localImage ? source : image && image.source === source ? image.url : undefined} />;
}
