/**
 * Environment configuration for the client.
 *
 * With Next.js rewrites, all API requests use relative paths (`/api/v1/...`)
 * so the browser sends them same-origin. The Next rewrite forwards them to
 * the backend (BACKEND_URL, default http://localhost:3001). This also means
 * the httpOnly `lm_access_token` cookie is sent automatically — no token
 * query param needed for SSE or REST.
 */

// Relative base — the Next.js rewrite handles proxying to the backend.
export const API_BASE_URL = '';
export const API_URL = '/api/v1';
