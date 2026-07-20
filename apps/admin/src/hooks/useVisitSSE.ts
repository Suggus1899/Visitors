'use client';

/**
 * SSE hook for real-time visit events.
 *
 * Connects to the same-origin `/api/v1/events/stream` endpoint. With Next.js
 * rewrites, EventSource sends the httpOnly `lm_access_token` cookie
 * automatically — no `?token=` query param is needed (the backend
 * `verifySseToken` reads the cookie first).
 *
 * On each visit lifecycle event (check-in, check-out, admit, intermittent)
 * it invalidates the relevant React Query queries and shows a toast.
 */

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useInvalidateAllAdmin } from '../services/useAdminQueries';
import { useTenant } from '../context/TenantContext';

interface VisitEvent {
    type: string;
    timestamp: string;
    visitId?: number;
    visitorName?: string;
    tenantSlug?: string;
}

interface UseVisitSSEOptions {
    enabled?: boolean;
    reconnectDelayMs?: number;
    maxReconnectAttempts?: number;
}

export const useVisitSSE = (options?: UseVisitSSEOptions) => {
    const invalidateAll = useInvalidateAllAdmin();
    const { selectedSlug } = useTenant();
    const [isConnected, setIsConnected] = useState(false);

    const reconnectAttemptRef = useRef(0);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const enabled = options?.enabled ?? true;
        const reconnectDelayMs = options?.reconnectDelayMs ?? 5000;
        const maxReconnectAttempts = options?.maxReconnectAttempts ?? 5;

        if (!enabled || !selectedSlug) return;

        const handleEvent = (payload: VisitEvent) => {
            // Invalidate all admin queries to refresh data
            invalidateAll();

            // Show toast based on event type
            const name = payload.visitorName || 'Visitante';
            switch (payload.type) {
                case 'visit:checkin':
                    toast.success(`${name} checked in`, { duration: 4000 });
                    break;
                case 'visit:checkout':
                    toast(`${name} checked out`, { icon: '👋', duration: 4000 });
                    break;
                case 'visit:admit':
                    toast(`${name} admitted`, { icon: '✅', duration: 4000 });
                    break;
                case 'visit:intermittent-exit':
                    toast(`${name} temporary exit`, { icon: '🚪', duration: 4000 });
                    break;
                case 'visit:intermittent-reentry':
                    toast.success(`${name} re-entered`, { duration: 4000 });
                    break;
                default:
                    // Unknown event type — just invalidate queries
                    break;
            }
        };

        const connect = () => {
            // Same-origin relative URL — Next rewrites proxy /api → backend,
            // and the httpOnly lm_access_token cookie is sent automatically.
            const url = '/api/v1/events/stream';
            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                reconnectAttemptRef.current = 0;
                setIsConnected(true);
            };

            eventSource.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data) as VisitEvent;
                    if (payload.type && payload.type.startsWith('visit:')) {
                        handleEvent(payload);
                    }
                } catch {
                    // Ignore malformed event payloads
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
                setIsConnected(false);

                reconnectAttemptRef.current += 1;

                if (reconnectAttemptRef.current >= maxReconnectAttempts) {
                    // Stop reconnecting — the app will rely on manual refresh / polling
                    return;
                }

                reconnectTimeoutRef.current = window.setTimeout(() => {
                    connect();
                }, reconnectDelayMs);
            };
        };

        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                window.clearTimeout(reconnectTimeoutRef.current);
            }
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
            setIsConnected(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options?.enabled, options?.maxReconnectAttempts, options?.reconnectDelayMs, selectedSlug, invalidateAll]);

    return { isConnected };
};
