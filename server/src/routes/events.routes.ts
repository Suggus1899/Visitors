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

  const sessionAllowed = async () => {
    const session = _req.user!;
    const user = await container.userRepository.findById(session.id);
    return !!user && !user.mustChangePassword && user.tokenVersion === session.tokenVersion &&
      !!session.exp && session.exp * 1000 > Date.now() && !container.tokenBlacklist.isBlacklisted(String(_req.query.token));
  };
  const send = async (event: VisitRealtimeEvent) => {
    try {
      if (!await sessionAllowed()) return res.end();
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { res.end(); }
  };

  send({
    type: 'system:connected',
    timestamp: new Date().toISOString(),
  });

  const heartbeat = setInterval(async () => {
    try {
      if (!await sessionAllowed()) return res.end();
      if (!res.writableEnded) res.write(':heartbeat\n\n');
    } catch { res.end(); }
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
