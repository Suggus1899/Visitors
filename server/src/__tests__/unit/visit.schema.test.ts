import { describe, it, expect } from 'vitest';
import { checkInSchema } from '../../schemas/visit.schema';

const validPayload = {
  visitorCedula: '12345678',
  consent: {
    accepted: true,
    policyVersion: '1.0',
    acceptedAt: '2026-03-11T10:00:00.000Z',
  },
  purpose: 'Reunión de negocios',
  personToVisit: 'Recepcion',
};

describe('checkInSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = checkInSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts a full payload with optional visitorData', () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      notes: 'Internal guest',
      visitorData: {
        firstName: 'Juan',
        lastName: 'Pérez',
        company: 'Acme',
        email: 'juan@acme.com',
        phone: '+584121234567',
        jobTitle: 'Engineer',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing visitorCedula', () => {
    const result = checkInSchema.safeParse({ purpose: 'Reunión', personToVisit: 'Rec' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('visitorCedula');
  });

  it('rejects missing purpose', () => {
    const result = checkInSchema.safeParse({
      visitorCedula: '12345678',
      consent: validPayload.consent,
      personToVisit: 'Rec'
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('purpose');
  });

  it('rejects missing personToVisit', () => {
    const result = checkInSchema.safeParse({
      visitorCedula: '12345678',
      consent: validPayload.consent,
      purpose: 'Reunión'
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('personToVisit');
  });

  it('rejects invalid email in visitorData', () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      visitorData: { email: 'not-an-email' },
    });
    expect(result.success).toBe(false);
    const emailIssue = result.error?.issues.find(i => i.path.includes('email'));
    expect(emailIssue).toBeDefined();
  });

  it('rejects cedula longer than 20 chars', () => {
    const result = checkInSchema.safeParse({ ...validPayload, visitorCedula: 'x'.repeat(21) });
    expect(result.success).toBe(false);
  });

  it('accepts optional notes', () => {
    const result = checkInSchema.safeParse({ ...validPayload, notes: 'VIP visitor' });
    expect(result.success).toBe(true);
  });
});
