import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import api from '../services/api.v1';
import { API_URL } from '../config/env';

export function AuthenticatedImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    const element = useRef<HTMLImageElement>(null);
    const [image, setImage] = useState<{ source: string; url: string } | null>(null);
    const localImage = src?.startsWith('data:image/') || src?.startsWith('blob:');
    useEffect(() => {
        if (!src || localImage || !src.startsWith(API_URL + '/visitors/')) return;
        const controller = new AbortController();
        let objectUrl: string | undefined;
        api.get<Blob>(src, { responseType: 'blob', signal: controller.signal }).then(response => {
            if (controller.signal.aborted) return;
            objectUrl = URL.createObjectURL(response.data);
            setImage({ source: src, url: objectUrl });
        }).catch(() => {
            if (controller.signal.aborted) return;
            setImage(null);
            element.current?.dispatchEvent(new Event('error'));
        });
        return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [src, localImage]);
    return <img {...props} ref={element} src={localImage ? src : image && image.source === src ? image.url : undefined} />;
}
