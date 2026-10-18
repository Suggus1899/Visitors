import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../app/auth/renew/safe-return-to';

describe('safeReturnTo', () => {
  it('preserves local paths and queries but drops fragments', () => {
    expect(safeReturnTo('/admin?tab=users#secrets')).toBe('/admin?tab=users');
  });

  it.each([
    'https://attacker.example/path',
    '//attacker.example/path',
    'https://logmaster.invalid//attacker.example/path',
    '/%2f%2fattacker.example/path',
    '/\\attacker.example/path',
    '/%5c%5cattacker.example/path',
  ])('rejects unsafe destination %s', (destination) => {
    expect(safeReturnTo(destination)).toBe('/');
  });
});
