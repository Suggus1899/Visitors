import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../config/env';
import AuthService from '../services/AuthService';
import { visitQueryKeys } from './useVisitQueries';

interface UseVisitEventsOptions {
    enabled?: boolean;
    reconnectDelayMs?: number;
    maxReconnectAttempts?: number;
}

export const useVisitEvents = (options?: UseVisitEventsOptions) => {
    const queryClient = useQueryClient();
    const [isConnected, setIsConnected] = useState(false);
    const [isUsingFallbackPolling, setIsUsingFallbackPolling] = useState(false);

    useEffect(() => {
        if (options?.enabled === false) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let attempts = 0;
        const connect = async () => {
            try {
                let token = AuthService.getAccessToken();
                if (!token) throw new Error('Sesión no disponible');
                const open = (accessToken: string) => fetch(`${API_URL}/events/visits`, {
                    headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
                });
                let response = await open(token);
                if (response.status === 401) {
                    await response.body?.cancel();
                    token = await AuthService.refreshAccessToken();
                    if (controller.signal.aborted) return;
                    response = await open(token);
                }
                if (response.status === 403) {
                    const payload = await response.json();
                    if (payload.error?.code === 'PASSWORD_CHANGE_REQUIRED') {
                        window.dispatchEvent(new CustomEvent('password-change-required', { detail: { message: payload.error.message } }));
                    }
                }
                if (!response.ok || !response.body) throw new Error('Conexión de eventos no disponible');
                setIsConnected(true);
                setIsUsingFallbackPolling(false);
                attempts = 0;
                // A reconnect can have missed events while offline.
                queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
                queryClient.invalidateQueries({ queryKey: visitQueryKeys.visitors });
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                try {
                    while (!controller.signal.aborted) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        if (buffer.length > 65536) throw new Error('Evento demasiado grande');
                        const frames = buffer.split(/\r?\n\r?\n/);
                        buffer = frames.pop() || '';
                        for (const frame of frames) {
                            const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
                            if (!data) continue;
                            try {
                                const payload = JSON.parse(data);
                                if (typeof payload.type === 'string' && payload.type.startsWith('visit:')) {
                                    queryClient.invalidateQueries({ queryKey: visitQueryKeys.all });
                                    queryClient.invalidateQueries({ queryKey: visitQueryKeys.visitors });
                                }
                            } catch { /* An invalid frame does not discard the following events. */ }
                        }
                    }
                } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
            } catch { /* The fallback keeps operational lists current during an outage. */ }
            if (controller.signal.aborted) return;
            setIsConnected(false);
            if (++attempts >= (options?.maxReconnectAttempts ?? 5)) {
                setIsUsingFallbackPolling(true);
                return;
            }
            timer = setTimeout(connect, options?.reconnectDelayMs ?? 3000);
        };
        const stop = () => { controller.abort(); clearTimeout(timer); };
        window.addEventListener('auth:logout', stop);
        void connect();
        return () => { stop(); window.removeEventListener('auth:logout', stop); };
    }, [options?.enabled, options?.maxReconnectAttempts, options?.reconnectDelayMs, queryClient]);

    return { isConnected, isUsingFallbackPolling };
};
