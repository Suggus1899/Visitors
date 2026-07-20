import { describe, it, expect } from 'vitest';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../../schemas/auth.schema';

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ username: 'admin', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects empty username', () => {
    const result = loginSchema.safeParse({ username: '', password: 'secret' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('username');
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ username: 'admin', password: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('password');
  });

  it('rejects missing fields', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map(i => i.path[0]);
    expect(fields).toContain('username');
    expect(fields).toContain('password');
  });

  it('rejects username longer than 200 chars', () => {
    const result = loginSchema.safeParse({ username: 'a'.repeat(201), password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects password longer than 200 chars', () => {
    const result = loginSchema.safeParse({ username: 'admin', password: 'p'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid username', () => {
    const result = forgotPasswordSchema.safeParse({ username: 'john' });
    expect(result.success).toBe(true);
  });

  it('rejects empty username', () => {
    const result = forgotPasswordSchema.safeParse({ username: '' });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid token and password', () => {
    const result = resetPasswordSchema.safeParse({ token: 'abc123', newPassword: 'ValidP@ssw0rd123' });
    expect(result.success).toBe(true);
  });

  it('rejects password shorter than 12 chars', () => {
    const result = resetPasswordSchema.safeParse({ token: 'tok', newPassword: '123' });
    expect(result.success).toBe(false);
    const msg = result.error?.issues[0].message;
    expect(msg).toMatch(/12/);
  });

  it('rejects empty token', () => {
    const result = resetPasswordSchema.safeParse({ token: '', newPassword: 'ValidP@ssw0rd123' });
    expect(result.success).toBe(false);
  });
});
