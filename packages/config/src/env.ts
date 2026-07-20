/**
 * Environment configuration for the client.
 * Detects the runtime context (dev server, production build, etc.)
 * and exposes a single API base URL used by all services.
 */

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

const resolveApiBaseUrl = (): string => {
  // Vite injects env vars at build time via import.meta.env.
  // In Next.js (webpack), import.meta.env is undefined, so we guard access
  // and fall back to relative paths — Next rewrites proxy /api → backend.
  // NOTE: access import.meta.env via property access only — webpack emits a
  // critical-dependency warning if import.meta is assigned to a variable.
  const viteEnv = (import.meta as unknown as { env?: ImportMetaEnv }).env;
  const viteApiUrl = viteEnv?.VITE_API_URL;

  // Explicit URL set (e.g. http://192.168.1.x:3000 for LAN dev)
  if (viteApiUrl && viteApiUrl !== '') {
    return viteApiUrl as string;
  }

  // VITE_API_URL='' means relative paths (proxy mode)
  if (typeof viteApiUrl === 'string' && viteApiUrl === '') {
    return '';
  }

  // Next.js / non-Vite: relative paths so same-origin rewrites + cookies work.
  // API_URL becomes "/api/v1" and Next's rewrites() proxy /api/:path* to the backend.
  return '';
};

export const API_BASE_URL = resolveApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api/v1`;
