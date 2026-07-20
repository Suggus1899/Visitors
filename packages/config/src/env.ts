/**
 * Environment configuration for the client.
 * Detects the runtime context (dev server, production build, etc.)
 * and exposes a single API base URL used by all services.
 */

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

const resolveApiBaseUrl = (): string => {
  // Vite injects env vars at build time via import.meta.env
  const env = (import.meta as unknown as { env: ImportMetaEnv }).env;
  const viteApiUrl = env.VITE_API_URL;

  // Explicit URL set (e.g. http://192.168.1.x:3000 for LAN dev)
  if (viteApiUrl && viteApiUrl !== '') {
    return viteApiUrl as string;
  }

  // VITE_API_URL='' means relative paths (proxy mode)
  if (typeof viteApiUrl === 'string' && viteApiUrl === '') {
    return '';
  }

  // Development fallback
  return 'http://localhost:3000';
};

export const API_BASE_URL = resolveApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api/v1`;
