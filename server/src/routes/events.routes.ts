import express, { Request, Response } from 'express';
import { verifySseToken } from '../middleware/auth';
import { container } from '../shared/Container';
import { VisitRealtimeEvent } from '../domain/services/IEventEmitter';

const router = express.Router();

router.get('/v1/events/visits', verifySseToken, (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const send = (event: VisitRealtimeEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({
    type: 'system:connected',
    timestamp: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 25_000);

  const unsubscribe = container.eventEmitter.subscribeToVisitEvents((event) => {
    send(event);
  });

  _req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
