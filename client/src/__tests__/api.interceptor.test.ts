import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted runs BEFORE any imports (and before vi.mock factories), so the
// mock axios instance and AuthService mock are initialized in time for the
// api.v1 module body to use them when it loads.
const { mockInstance, mockAuthService } = vi.hoisted(() => {
  // The axios instance must be callable (api(originalRequest) on retry) AND
  // expose interceptors.request.use / interceptors.response.use so we can
  // capture the handlers registered at module-load time.
  const instance = Object.assign(vi.fn(), {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  });

  const authService = {
    getAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
    logout: vi.fn(),
  };

  return { mockInstance: instance, mockAuthService: authService };
});

// --- Mock AuthService (loaded via dynamic import inside api.v1) ---
vi.mock('../services/AuthService', () => ({
  default: mockAuthService,
}));

// --- Mock axios: create() returns our callable mock instance ---
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockInstance),
  },
}));

// Import api.v1 AFTER mocks are registered so interceptors bind to our mock.
// Side-effect import: ensures the module body (interceptor registration) runs
// even though we don't use the exported `api` directly — we drive the
// captured interceptor handlers and the mock axios instance instead.
import { VisitService } from '../services/api.v1';

// Capture the handlers registered at module-load time.
// NOTE: do this at top level — vi.clearAllMocks() in beforeEach wipes call
// history, so capturing there would read `undefined`.
const requestFulfilled: (config: { headers: Record<string, string> }) => Promise<{ headers: Record<string, string> }> =
  mockInstance.interceptors.request.use.mock.calls[0][0];
const responseRejected: (error: unknown) => Promise<unknown> =
  mockInstance.interceptors.response.use.mock.calls[0][1];

describe('api.v1 interceptors', () => {
  const pageResponse = (ids: number[], total: number) => ({ data: { success: true,
    data: { visits: ids.map(id => ({ id, visitorCedula: 'V-00123456', purpose: 'Prueba', checkInTime: '2026-10-08T12:00:00Z',
      status: 'completed', visitorCompany: id % 2 ? 'EMPRESA PRUEBA' : 'Otra empresa' })) }, meta: { total } } });

  it('loads every API page before applying the company filter', async () => {
    mockInstance.get.mockResolvedValueOnce(pageResponse(Array.from({ length: 100 }, (_, i) => i + 1), 103))
      .mockResolvedValueOnce(pageResponse([101, 102, 103], 103));
    const visits = await VisitService.getAllVisits({ company: 'empresa prueba', status: 'completed', page: 7 });
    expect(visits).toHaveLength(52);
    expect(visits[visits.length - 1]?.id).toBe(103);
    expect(mockInstance.get.mock.calls.map(([url]) => new URLSearchParams(url.split('?')[1]).get('page'))).toEqual(['1', '2']);
    expect(mockInstance.get.mock.calls.every(([url]) => url.includes('limit=100') && url.includes('status=completed'))).toBe(true);
  });

  it.each([2000, 20000])('rejects an oversized export before downloading further pages: %d', async maximum => {
    mockInstance.get.mockResolvedValueOnce(pageResponse([1], maximum + 1));
    await expect(VisitService.getAllVisits({}, { maxRecords: maximum })).rejects.toThrow('Selecciona filtros');
    expect(mockInstance.get).toHaveBeenCalledOnce();
  });

  it('does not start a cancelled export', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(VisitService.getAllVisits({}, { signal: controller.signal })).rejects.toThrow('cancelada');
    expect(mockInstance.get).not.toHaveBeenCalled();
  });

  it.each([
    { ids: [101], total: 104 }, { ids: [], total: 103 }, { ids: [100, 101, 102], total: 103 }, { ids: [101, 101, 102], total: 103 },
  ])('rejects changed or incomplete export pages: %j', async ({ ids, total }) => {
    mockInstance.get.mockResolvedValueOnce(pageResponse(Array.from({ length: 100 }, (_, i) => i + 1), 103))
      .mockResolvedValueOnce(pageResponse(ids, total));
    await expect(VisitService.getAllVisits()).rejects.toThrow('Los registros cambiaron');
  });

  it('expands date filters to include the entire Venezuelan day', async () => {
    mockInstance.get.mockResolvedValueOnce(pageResponse([], 0));
    await VisitService.getVisits({ startDate: '2026-10-08', endDate: '2026-10-08', status: '' });
    const params = new URLSearchParams(mockInstance.get.mock.calls[0][0].split('?')[1]);
    expect(params.get('startDate')).toBe('2026-10-08T00:00:00.000-04:00');
    expect(params.get('endDate')).toBe('2026-10-08T23:59:59.999-04:00');
    expect(params.has('status')).toBe(false);
  });

  it('maps daily statistics and preserves the full last day in chart reports', async () => {
    mockInstance.get.mockResolvedValueOnce({ data: { success: true, data: { recentActivity: [{ date: '2026-10-31', count: 3 }] } } });
    const stats = await VisitService.getStats('2026-10-01', '2026-10-31');
    expect(stats.visitsPerDay).toEqual([{ date: '2026-10-31', count: 3 }]);
    const params = new URLSearchParams(mockInstance.get.mock.calls[0][0].split('?')[1]);
    expect(params.get('endDate')).toBe('2026-10-31T23:59:59.999-04:00');
  });

  it('maps the monthly API summary and purpose into the report card contract', async () => {
    mockInstance.get.mockResolvedValueOnce({ data: { success: true, data: {
      summary: { totalVisits: 3, uniqueVisitors: 2, averageDuration: 45, completionRate: 67 },
      byReason: [{ purpose: 'Entrega', count: 3, percentage: 100 }],
    } } });
    expect(await VisitService.getMonthlyReport(9, 2026)).toEqual({
      totalVisits: 3, uniqueVisitors: 2, averageDuration: 45, completionRate: 67,
      byReason: [{ purpose: 'Entrega', reason: 'Entrega', count: 3, percentage: 100 }],
    });
  });
  let originalLocationDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    // Clear per-test call history/instances, but keep implementations.
    // The captured handler references above remain valid.
    vi.clearAllMocks();

    // Stub window.location so we can assert redirect without jsdom navigation noise
    originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore the real window.location descriptor
    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor);
    }
  });

  describe('request interceptor', () => {
    it('should add Authorization header when an access token exists', async () => {
      mockAuthService.getAccessToken.mockReturnValue('access-token-123');

      const config = { headers: {} as Record<string, string> };
      const result = await requestFulfilled(config);

      expect(mockAuthService.getAccessToken).toHaveBeenCalled();
      expect(result.headers.Authorization).toBe('Bearer access-token-123');
    });

    it('should not add Authorization header when there is no access token', async () => {
      mockAuthService.getAccessToken.mockReturnValue(null);

      const config = { headers: {} as Record<string, string> };
      const result = await requestFulfilled(config);

      expect(mockAuthService.getAccessToken).toHaveBeenCalled();
      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('response interceptor - 401 handling', () => {
    it('should refresh the access token and retry the original request on 401', async () => {
      mockAuthService.refreshAccessToken.mockResolvedValue('new-access-token');
      // api(originalRequest) -> mockInstance(...) resolves with a retried response
      mockInstance.mockResolvedValue({ data: { success: true } });

      const originalRequest = {
        _retry: undefined,
        headers: {} as Record<string, string>,
      };
      const error = {
        config: originalRequest,
        response: { status: 401, data: {} },
      };

      await responseRejected(error);

      expect(mockAuthService.refreshAccessToken).toHaveBeenCalled();
      expect(originalRequest._retry).toBe(true);
      expect(originalRequest.headers.Authorization).toBe('Bearer new-access-token');
      expect(mockInstance).toHaveBeenCalledWith(originalRequest);
    });

    it('should logout and redirect to login when refresh fails after 401', async () => {
      mockAuthService.refreshAccessToken.mockRejectedValue(
        new Error('refresh failed')
      );

      const originalRequest = {
        _retry: undefined,
        headers: {} as Record<string, string>,
      };
      const error = {
        config: originalRequest,
        response: { status: 401, data: {} },
      };

      await expect(responseRejected(error)).rejects.toThrow('refresh failed');

      expect(mockAuthService.logout).toHaveBeenCalled();
      expect(window.location.href).toBe('#/login');
    });

    it('should not attempt refresh twice for the same request (_retry guard)', async () => {
      mockAuthService.refreshAccessToken.mockResolvedValue('new-access-token');
      mockInstance.mockResolvedValue({ data: { success: true } });

      const originalRequest = {
        _retry: true, // already retried once
        headers: {} as Record<string, string>,
      };
      const error = {
        config: originalRequest,
        response: { status: 401, data: {} },
      };

      // Falls through to Promise.reject(error) without attempting refresh
      await expect(responseRejected(error)).rejects.toBe(error);

      expect(mockAuthService.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should pass through non-401 errors unchanged', async () => {
      const error = {
        config: { headers: {} },
        response: { status: 500, data: {} },
      };

      await expect(responseRejected(error)).rejects.toBe(error);
      expect(mockAuthService.refreshAccessToken).not.toHaveBeenCalled();
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });
  });
});
