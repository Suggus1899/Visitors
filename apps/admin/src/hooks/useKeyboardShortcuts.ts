'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface UseKeyboardShortcutsOptions {
    onShowShortcuts: () => void;
}

const ROUTE_MAP: Record<string, string> = {
    d: '/',
    v: '/visitors',
    i: '/visits',
    c: '/calendar',
    r: '/reports',
    s: '/statistics',
    b: '/backups',
    a: '/activity-logs',
    t: '/settings',
};

/**
 * Global keyboard shortcuts hook.
 *
 * Supports "g" prefix navigation (press g, then a letter to navigate)
 * and "?" to open the shortcuts help modal.
 */
export const useKeyboardShortcuts = ({ onShowShortcuts }: UseKeyboardShortcutsOptions) => {
    const router = useRouter();

    useEffect(() => {
        let waitingForG = false;
        let gTimeout: number | null = null;

        const handleKey = (e: KeyboardEvent) => {
            // Ignore if typing in an input/textarea/select
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
                return;
            }

            // "?" opens shortcuts modal
            if (e.key === '?' && !waitingForG) {
                e.preventDefault();
                onShowShortcuts();
                return;
            }

            // "g" starts a navigation sequence
            if (e.key === 'g' && !waitingForG) {
                waitingForG = true;
                gTimeout = window.setTimeout(() => {
                    waitingForG = false;
                }, 1000);
                return;
            }

            // If waiting for second key after "g"
            if (waitingForG) {
                waitingForG = false;
                if (gTimeout) window.clearTimeout(gTimeout);

                const route = ROUTE_MAP[e.key.toLowerCase()];
                if (route) {
                    e.preventDefault();
                    router.push(route);
                }
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('keydown', handleKey);
            if (gTimeout) window.clearTimeout(gTimeout);
        };
    }, [router, onShowShortcuts]);
};
