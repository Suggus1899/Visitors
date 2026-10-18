import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { clientRequestHeaders, safeRequestId } from '../server/auth-cookies';

describe('request correlation headers', () => {
  it('forwards only a proxy-shaped correlation id', () => {
    const request = new Request('https://localhost:5173/api/v1/health', {
      headers: { 'x-real-ip': '203.0.113.8', 'x-request-id': 'a'.repeat(32) },
    });

    const headers = clientRequestHeaders(request);

    expect(headers.get('x-forwarded-for')).toBe('203.0.113.8');
    expect(headers.get('x-request-id')).toBe('a'.repeat(32));
  });

  it('rejects client supplied correlation values that cannot be logged safely', () => {
    expect(safeRequestId('a'.repeat(31))).toBeUndefined();
    expect(safeRequestId(`${'a'.repeat(31)}\n`)).toBeUndefined();
    expect(safeRequestId('A'.repeat(32))).toBeUndefined();
    const request = new Request('https://localhost:5173/api/v1/health', {
      headers: { 'x-request-id': 'a'.repeat(31) },
    });
    expect(clientRequestHeaders(request).has('x-request-id')).toBe(false);
  });
});
