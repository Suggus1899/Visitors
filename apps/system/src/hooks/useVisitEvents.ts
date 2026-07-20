import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../config/env';
import { visitQueryKeys } from './useVisitQueries';

interface VisitEvent {
    type: string;
    timestamp: string;
    visitId?: number;
}

interface UseVisitEventsOptions {
    enabled?: boolean;
    reconnectDelayMs?: number;
    maxReconnectAttempts?: number;
}

export const useVisitEvents = (options?: UseVisitEventsOptions) => {
    const queryClient = useQueryClient();
    const [isConnected, setIsConnected] = useState(false);
    const [isUsingFallbackPolling, setIsUsingFallbackPolling] = useState(false);

    const reconnectAttemptRef = useRef(0);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const enabled = options?.enabled ?? true;
        const reconnectDelayMs = options?.reconnectDelayMs ?? 3000;
        const maxReconnectAttempts = options?.maxReconnectAttempts ?? 5;

        if (!enabled) {
            return;
        }

        // SSE auth is handled by the httpOnly `lm_access_token` cookie, which the
        // browser sends automatically on the same-origin relative URL via the
        // Next.js rewrite. No token query param is needed.
        const connect = () => {
            const url = `${API_URL}/events/visits`;
            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                reconnectAttemptRef.current = 0;
                setIsConnected(true);
                setIsUsingFallbackPolling(false);
            };

            eventSource.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data) as VisitEvent;
                    if (payload.type.startsWith('visit:')) {
                        queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
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
                    setIsUsingFallbackPolling(true);
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
    }, [options?.enabled, options?.maxReconnectAttempts, options?.reconnectDelayMs, queryClient]);

    return {
        isConnected,
        isUsingFallbackPolling,
    };
};
