import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { API_PATHS } from '../types';

/**
 * Base URL is empty so all requests are relative (`/api/v1/...`).
 * The Next.js rewrites proxy them to the backend on the same origin,
 * which means httpOnly cookies flow automatically — no manual token
 * injection needed.
 */
export const BASE_URL = '';

/**
 * Shared axios instance for the platform app.
 *
 * - Uses `withCredentials` so cookies are sent on every request.
 * - On 401, attempts a single token refresh via cookie then retries.
 * - If refresh fails, redirects to /login.
 */
export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
  withCredentials: true,
});

// No request interceptor needed — cookies are sent automatically.

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

const refreshAccessToken = async (): Promise<void> => {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = (async () => {
    await axios.post(
      `${BASE_URL}${API_PATHS.refresh}`,
      {},
      { headers: { 'Content-Type': 'application/json' }, withCredentials: true }
    );
  })();
  try {
    await refreshPromise;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await refreshAccessToken();
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Unwrap the standardized backend envelope `{ success, data, error }`.
 * Falls back to the raw payload when the envelope is absent (mocks).
 */
export const unwrap = <T>(payload: unknown): T => {
  const envelope = payload as { success?: boolean; data?: T; error?: { message?: string } };
  if (envelope && envelope.success === false) {
    throw new Error(envelope.error?.message || 'Request failed');
  }
  return (envelope?.data ?? (payload as T)) as T;
};
