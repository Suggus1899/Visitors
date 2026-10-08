import { EventEmitter } from 'events';
import { IEventEmitter, VisitRealtimeEvent } from '../../domain/services/IEventEmitter';

export type { VisitRealtimeEvent };

class EventEmitterService implements IEventEmitter {
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
