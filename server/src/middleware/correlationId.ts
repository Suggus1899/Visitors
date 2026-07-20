import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { correlationStorage, CorrelationContext, getCorrelationContext } from '../shared/correlationStorage';

export { getCorrelationContext, CorrelationContext };

const HEADER = 'x-request-id';
const ID_LENGTH = 16;

/**
 * Generate a short, URL-safe, opaque correlation ID.
 */
const newCorrelationId = (): string => crypto.randomBytes(ID_LENGTH).toString('hex');

/**
 * Middleware that establishes a correlation context for the request.
 *
 * - Reuses an incoming x-request-id header if present (max 128 chars,
 *   validated to be a printable token to avoid log injection).
 * - Otherwise generates a fresh ID.
 * - Sets x-request-id on the response so clients can correlate.
 * - Runs the rest of the request inside AsyncLocalStorage so any
 *   logger in the call tree can attach the correlationId.
 */
export const correlationId = (req: Request, res: Response, next: NextFunction) => {
  const incoming = typeof req.headers[HEADER] === 'string' ? req.headers[HEADER] as string : '';
  const isValidIncoming = incoming.length > 0 && incoming.length <= 128 && /^[A-Za-z0-9._-]+$/.test(incoming);
  const id = isValidIncoming ? incoming : newCorrelationId();

  res.setHeader(HEADER, id);

  const store: CorrelationContext = { correlationId: id };
  correlationStorage.run(store, () => next());
};

/**
 * Attach tenant/user context to the current correlation store.
 * Called by auth middleware after req.user / req.tenantId are resolved
 * so that downstream logs include the authenticated principal.
 */
export const enrichCorrelationContext = (patch: Partial<Omit<CorrelationContext, 'correlationId'>>) => {
  const current = getCorrelationContext();
  if (!current) return;
  // Mutate in place — the store object is the same reference for the
  // whole request lifetime, so downstream loggers see the enriched fields.
  if (patch.tenantId !== undefined) current.tenantId = patch.tenantId;
  if (patch.userId !== undefined) current.userId = patch.userId;
};
