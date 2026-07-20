import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoRequest, DemoResponse } from '../types';

/**
 * Real backend endpoint for demo provisioning.
 * The server is expected to create a demo tenant (slug: demo-{uuid}) and
 * three demo users (guardia@demo.com, admin@demo.com, auditor@demo.com,
 * password Demo123*) and return tokens + links.
 *
 * TODO(backend): Implement POST /v1/auth/demo on the server. Until then we
 * gracefully fall back to a mock response so the landing UX stays functional.
 */
const DEMO_ENDPOINT = '/v1/auth/demo';
const STORAGE_KEY = 'logmaster_demo_session';
const RATE_LIMIT_MS = 60_000;
const RATE_LIMIT_KEY = 'logmaster_demo_last_attempt';

interface UseDemoResult {
  loading: boolean;
  error: string | null;
  result: DemoResponse | null;
  rateLimitedFor: number; // seconds remaining, 0 when allowed
  startDemo: (payload: DemoRequest) => Promise<DemoResponse | null>;
  clearResult: () => void;
}

const buildMockResponse = (): DemoResponse => {
  const slug = `demo-${Math.random().toString(36).slice(2, 10)}`;
  return {
    accessToken: `mock_access_${slug}`,
    refreshToken: `mock_refresh_${slug}`,
    demoSlug: slug,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    redirectUrl: `https://app.logmaster.com/?demoToken=mock_access_${slug}`,
    credentials: {
      guardia: { email: 'guardia@demo.com', password: 'Demo123*' },
      admin: { email: 'admin@demo.com', password: 'Demo123*' },
      auditor: { email: 'auditor@demo.com', password: 'Demo123*' },
    },
    links: {
      admin: `https://app.logmaster.com/admin/${slug}`,
      auditor: `https://app.logmaster.com/auditor/${slug}`,
      system: `https://app.logmaster.com/system/${slug}`,
    },
  };
};

const getRemainingRateLimit = (): number => {
  const last = window.localStorage.getItem(RATE_LIMIT_KEY);
  if (!last) return 0;
  const elapsed = Date.now() - Number(last);
  const remaining = RATE_LIMIT_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
};

export function useDemo(): UseDemoResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [rateLimitedFor, setRateLimitedFor] = useState<number>(getRemainingRateLimit);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (rateLimitedFor <= 0) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => {
      const remaining = getRemainingRateLimit();
      setRateLimitedFor(remaining);
      if (remaining <= 0 && tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }, 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [rateLimitedFor]);

  const startDemo = useCallback(
    async (payload: DemoRequest): Promise<DemoResponse | null> => {
      if (getRemainingRateLimit() > 0) {
        setError('Please wait before requesting another demo.');
        return null;
      }

      setLoading(true);
      setError(null);
      window.localStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
      setRateLimitedFor(Math.ceil(RATE_LIMIT_MS / 1000));

      try {
        let data: DemoResponse;

        try {
          const response = await fetch(DEMO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`Backend responded ${response.status}: ${response.statusText}`);
          }

          data = (await response.json()) as DemoResponse;
        } catch (networkError) {
          // Fallback: the demo endpoint is not available yet. We simulate the
          // expected response so the landing flow keeps working and surface a
          // console warning for developers.
          console.warn(
            '[useDemo] POST /v1/auth/demo is not available yet. Using mock response.',
            networkError
          );
          data = buildMockResponse();
        }

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setResult(data);
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unexpected error starting the demo.';
        setError(message);
        console.error('[useDemo]', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearResult = useCallback(() => setResult(null), []);

  return { loading, error, result, rateLimitedFor, startDemo, clearResult };
}

export { DEMO_ENDPOINT, STORAGE_KEY };
