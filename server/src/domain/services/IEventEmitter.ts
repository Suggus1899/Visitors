export interface VisitRealtimeEvent {
  type: 'system:connected' | 'visit:checked-in' | 'visit:checked-out' | 'visit:admitted' | 'visit:intermittent' | 'visit:reactivated' | 'visit:intermittent-exit' | 'visit:intermittent-reentry';
  timestamp: string;
  visitId?: number;
}

export interface IEventEmitter {
  emitVisitEvent(event: VisitRealtimeEvent): void;
  subscribeToVisitEvents(listener: (event: VisitRealtimeEvent) => void): () => void;
}
