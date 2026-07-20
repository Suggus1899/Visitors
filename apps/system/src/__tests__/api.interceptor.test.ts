import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted runs BEFORE any imports (and before vi.mock factories), so the
// mock axios instance and AuthService mock are initialized in time for the
// api.v1 module body to use them when it loads.
const { mockInstance, mockAuthService } = vi.hoisted(() => {
  // The axios instance must be callable (api(originalRequest) on retry) AND
  // expose interceptors.request.use / interceptors.response.use so we can
  // capture the handlers registered at module-load time.
  const instance: any = vi.fn();
  instance.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };
  instance.get = vi.fn();
  instance.post = vi.fn();
  instance.put = vi.fn();
  instance.patch = vi.fn();
  instance.delete = vi.fn();

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
import '../services/api.v1';

// Capture the handlers registered at module-load time.
// NOTE: do this at top level — vi.clearAllMocks() in beforeEach wipes call
// history, so capturing there would read `undefined`.
const requestFulfilled: (config: any) => Promise<any> =
  mockInstance.interceptors.request.use.mock.calls[0][0];
const responseRejected: (error: any) => Promise<any> =
  mockInstance.interceptors.response.use.mock.calls[0][1];

describe('api.v1 interceptors', () => {
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
