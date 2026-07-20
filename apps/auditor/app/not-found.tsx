'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Catch-all for unknown routes. Mirrors the original SPA behavior of
 * redirecting any unmatched path to the dashboard.
 */
export default function NotFound() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/');
    }, [router]);
    return null;
}
