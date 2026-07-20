import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage carrying the correlation context for the current
 * request. Kept in shared/ (no dependencies) so logger.ts and
 * middleware/correlationId.ts can both import it without creating a
 * circular dependency.
 */
export interface CorrelationContext {
  correlationId: string;
  tenantId?: number;
  userId?: number;
}

export const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Read the current correlation context, if any.
 */
export const getCorrelationContext = (): CorrelationContext | undefined =>
  correlationStorage.getStore();
