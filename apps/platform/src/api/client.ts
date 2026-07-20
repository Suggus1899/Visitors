import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { tokenStore } from './tokenStore';
import { API_PATHS } from '../types';

/**
 * Resolve the API base URL from Vite env. Defaults to relative paths so the
 * dev proxy / same-origin production deployment works out of the box.
 */
const resolveBaseUrl = (): string => {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  const url = env?.VITE_API_URL;
  if (url === undefined) return '';
  return url;
};

export const BASE_URL = resolveBaseUrl();

/**
 * Shared axios instance for the platform app.
 *
 * - Injects the superadmin access token on every request.
 * - On 401, attempts a single token refresh then retries the original request.
 * - If refresh fails, clears the session and redirects to /login.
 */
export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    const response = await axios.post(
      `${BASE_URL}${API_PATHS.refresh}`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const data = response.data?.data ?? response.data;
    const accessToken: string = data.accessToken;
    tokenStore.setAccessToken(accessToken);
    return accessToken;
  })();
  try {
    return await refreshPromise;
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
        const newToken = await refreshAccessToken();
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${newToken}`,
        };
        return apiClient(originalRequest);
      } catch (refreshError) {
        tokenStore.clear();
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
