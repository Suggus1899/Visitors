import express, { Request, Response } from 'express';
import { verifySseToken } from '../../middleware/auth';
import { container } from '../../shared/Container';
import { VisitRealtimeEvent } from '../../shared/domain/services/IEventEmitter';

const router = express.Router();

router.get('/v1/events/visits', verifySseToken, (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Tenant scope for this SSE connection. Events emitted without a tenantId
  // (e.g. system:connected) are always delivered; visit events are delivered
  // only when their tenantId matches the authenticated user's tenant.
  const tenantScope = req.user?.tid;

  const send = (event: VisitRealtimeEvent) => {
    if (event.tenantId !== undefined && event.tenantId !== tenantScope) {
      return;
    }
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

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
