import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auditQueryKeys } from './useAuditQueries';

interface AuditEvent {
    type: string;
    timestamp: string;
    logId?: number;
}

interface UseAuditEventsOptions {
    enabled?: boolean;
    reconnectDelayMs?: number;
    maxReconnectAttempts?: number;
}

/**
 * SSE subscription for real-time audit log events.
 *
 * The EventSource connects to the same-origin `/api/v1/events/stream` path,
 * which is proxied to the backend by the Next.js rewrite. The httpOnly
 * `lm_access_token` cookie is sent automatically by the browser (same-origin),
 * so no `?token=` query parameter is required. The backend `verifySseToken`
 * reads the cookie first.
 *
 * On each event, audit-related React Query caches are invalidated so new logs
 * appear live in the dashboard and logs table.
 */
export const useAuditEvents = (options?: UseAuditEventsOptions) => {
    const queryClient = useQueryClient();
    const [isConnected, setIsConnected] = useState(false);

    const reconnectAttemptRef = useRef(0);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const enabled = options?.enabled ?? true;
        const reconnectDelayMs = options?.reconnectDelayMs ?? 3000;
        const maxReconnectAttempts = options?.maxReconnectAttempts ?? 5;

        if (!enabled) return;

        const connect = () => {
            // Same-origin via Next rewrite; cookie sent automatically.
            const eventSource = new EventSource('/api/v1/events/stream');
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                reconnectAttemptRef.current = 0;
                setIsConnected(true);
            };

            eventSource.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data) as AuditEvent;
                    if (payload.type.startsWith('audit:')) {
                        queryClient.invalidateQueries({ queryKey: auditQueryKeys.all });
                    }
                } catch {
                    // Ignore malformed event payloads.
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
                setIsConnected(false);

                reconnectAttemptRef.current += 1;
                if (reconnectAttemptRef.current >= maxReconnectAttempts) {
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
        };
    }, [
        options?.enabled,
        options?.maxReconnectAttempts,
        options?.reconnectDelayMs,
        queryClient,
    ]);

    return { isConnected };
};
