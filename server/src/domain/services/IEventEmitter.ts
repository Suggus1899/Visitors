export interface VisitRealtimeEvent {
  type: 'system:connected' | 'visit:checked-in' | 'visit:checked-out' | 'visit:admitted' | 'visit:intermittent' | 'visit:reactivated' | 'visit:intermittent-exit' | 'visit:intermittent-reentry';
  timestamp: string;
  visitId?: number;
  /**
   * Tenant the event belongs to. SSE clients must only receive events whose
   * tenantId matches their authenticated tenant, preventing cross-tenant data
   * leakage over the realtime channel.
   */
  tenantId?: number;
}

export interface IEventEmitter {
  emitVisitEvent(event: VisitRealtimeEvent): void;
  subscribeToVisitEvents(listener: (event: VisitRealtimeEvent) => void): () => void;
}
