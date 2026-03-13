import { describe, it, expect } from 'vitest';
import {
  createArcoRequestSchema,
  rectifyDataSchema,
  updateArcoStatusSchema,
  oppositionSchema
} from '../../schemas/privacy.schema';

describe('privacy schemas', () => {
  it('accepts a valid ARCO request payload', () => {
    const parsed = createArcoRequestSchema.safeParse({
      requestType: 'access',
      cedula: '12345678',
      requestedByName: 'Juan Perez',
      contactEmail: 'juan@acme.com',
      reason: 'Solicito acceso a mis datos',
      requestPayload: { source: 'frontdesk' }
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects invalid ARCO request type', () => {
    const parsed = createArcoRequestSchema.safeParse({
      requestType: 'invalid',
      cedula: '12345678',
      requestedByName: 'Juan Perez'
    });

    expect(parsed.success).toBe(false);
  });

  it('requires at least one field in rectification payload', () => {
    const parsed = rectifyDataSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('accepts valid rectification payload', () => {
    const parsed = rectifyDataSchema.safeParse({
      firstName: 'Maria',
      phone: '8290000000'
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts status update payload', () => {
    const parsed = updateArcoStatusSchema.safeParse({
      status: 'completed',
      resolutionNotes: 'Entregado al titular'
    });

    expect(parsed.success).toBe(true);
  });

  it('validates opposition payload', () => {
    const parsed = oppositionSchema.safeParse({
      requestedByName: 'Maria Gomez',
      reason: 'Me opongo al uso para marketing'
    });

    expect(parsed.success).toBe(true);
  });
});
