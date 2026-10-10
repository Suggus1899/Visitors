import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useVisitEvents } from '../hooks/useVisitEvents';

const fixtures = vi.hoisted(() => { const invalidate = vi.fn(); return { invalidate, client: { invalidateQueries: invalidate }, refresh: vi.fn() }; });
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => fixtures.client }));
vi.mock('../services/AuthService', () => ({ default: { refreshAccessToken: fixtures.refresh } }));

let stream: ReadableStreamDefaultController<Uint8Array>;
const response = () => new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), { headers: { 'Content-Type': 'text/event-stream' } });
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('authenticated visit events', () => {
    it('uses same-origin cookies, processes split frames and reconnects', async () => {
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response()));
        vi.stubGlobal('fetch', fetcher);
        const { result } = renderHook(() => useVisitEvents({ reconnectDelayMs: 1 }));
        await waitFor(() => expect(result.current.isConnected).toBe(true));
        expect(fetcher.mock.calls[0][0]).not.toContain('token=');
        expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin');
        expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
        const encoder = new TextEncoder();
        const before = fixtures.invalidate.mock.calls.length;
        await act(async () => { stream.enqueue(encoder.encode('data: {"type":"visit:checked')); stream.enqueue(encoder.encode('-in"}\n\n')); });
        await waitFor(() => expect(fixtures.invalidate.mock.calls.length).toBeGreaterThan(before));
        expect(fixtures.invalidate).toHaveBeenCalledWith({ queryKey: ['visitors'] });
        act(() => stream.close());
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(fetcher.mock.calls[1][1].credentials).toBe('same-origin');
    });

    it('refreshes an expired session once and aborts the stream on logout', async () => {
        fixtures.refresh.mockResolvedValue(undefined);
        const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockImplementation(() => Promise.resolve(response()));
        vi.stubGlobal('fetch', fetcher);
        renderHook(() => useVisitEvents());
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(fixtures.refresh).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[1][1].credentials).toBe('same-origin');
        expect(fetcher.mock.calls[1][1].headers).toBeUndefined();
        act(() => window.dispatchEvent(new Event('auth:logout')));
        expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
    });
});
