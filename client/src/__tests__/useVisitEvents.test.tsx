import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useVisitEvents } from '../hooks/useVisitEvents';
import AuthService from '../services/AuthService';

const fixtures = vi.hoisted(() => { const invalidate = vi.fn(); return { invalidate, client: { invalidateQueries: invalidate }, token: vi.fn(), refresh: vi.fn() }; });
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => fixtures.client }));
vi.mock('../services/AuthService', () => ({ default: { getAccessToken: fixtures.token, refreshAccessToken: fixtures.refresh } }));

let stream: ReadableStreamDefaultController<Uint8Array>;
const response = () => new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), { headers: { 'Content-Type': 'text/event-stream' } });
beforeEach(() => { vi.clearAllMocks(); fixtures.token.mockReturnValue('old-access-token'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('authenticated visit events', () => {
    it('uses a header, processes split frames and reconnects with the current token', async () => {
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response()));
        vi.stubGlobal('fetch', fetcher);
        const { result } = renderHook(() => useVisitEvents({ reconnectDelayMs: 1 }));
        await waitFor(() => expect(result.current.isConnected).toBe(true));
        expect(fetcher.mock.calls[0][0]).not.toContain('token=');
        expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer old-access-token');
        const encoder = new TextEncoder();
        const before = fixtures.invalidate.mock.calls.length;
        await act(async () => { stream.enqueue(encoder.encode('data: {"type":"visit:checked')); stream.enqueue(encoder.encode('-in"}\n\n')); });
        await waitFor(() => expect(fixtures.invalidate.mock.calls.length).toBeGreaterThan(before));
        expect(fixtures.invalidate).toHaveBeenCalledWith({ queryKey: ['visitors'] });
        vi.mocked(AuthService.getAccessToken).mockReturnValue('current-access-token');
        act(() => stream.close());
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer current-access-token');
    });

    it('refreshes an expired session once and aborts the stream on logout', async () => {
        fixtures.refresh.mockResolvedValue('renewed-access-token');
        const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockImplementation(() => Promise.resolve(response()));
        vi.stubGlobal('fetch', fetcher);
        renderHook(() => useVisitEvents());
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
        expect(fixtures.refresh).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer renewed-access-token');
        act(() => window.dispatchEvent(new Event('auth:logout')));
        expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
    });
});
