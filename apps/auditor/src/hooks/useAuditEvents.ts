import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@logmaster/config';
import { AuthService } from '@logmaster/api';
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
 * TODO(backend): Wire to the real SSE endpoint once available:
 *   GET /events/audit?token=<accessToken>
 *
 * On each event, audit-related React Query caches are invalidated so
 * new logs appear live in the dashboard and logs table.
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

        const token = AuthService.getAccessToken();
        if (!token) {
            setIsConnected(false);
            return;
        }

        const connect = () => {
            // TODO(backend): replace with real audit SSE endpoint path.
            const url = `${API_URL}/events/audit?token=${encodeURIComponent(token)}`;
            const eventSource = new EventSource(url);
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
