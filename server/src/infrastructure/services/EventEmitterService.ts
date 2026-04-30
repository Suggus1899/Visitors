import { EventEmitter } from 'events';

export interface VisitRealtimeEvent {
  type: 'system:connected' | 'visit:checked-in' | 'visit:checked-out' | 'visit:admitted' | 'visit:intermittent' | 'visit:reactivated';
  timestamp: string;
  visitId?: number;
}

class EventEmitterService {
  private emitter = new EventEmitter();

  emitVisitEvent(event: VisitRealtimeEvent): void {
    this.emitter.emit('visits', event);
  }

  subscribeToVisitEvents(listener: (event: VisitRealtimeEvent) => void): () => void {
    this.emitter.on('visits', listener);

    return () => {
      this.emitter.off('visits', listener);
    };
  }
}

export const eventEmitterService = new EventEmitterService();
