/**
 * Environment configuration for the client.
 * Detects the runtime context (Electron production, dev server, etc.)
 * and exposes a single API base URL used by all services.
 */

const isElectronProduction = (): boolean =>
  typeof window !== 'undefined' &&
  window.location.protocol === 'file:';

const resolveApiBaseUrl = (): string => {
  // Vite injects env vars at build time via import.meta.env
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL as string;
  }

  // Electron production: server always runs on localhost:3000
  if (isElectronProduction()) {
    return 'http://localhost:3000';
  }

  // Development fallback
  return 'http://localhost:3000';
};

export const API_BASE_URL = resolveApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api/v1`;
