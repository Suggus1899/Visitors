import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import logger from '../config/logger';
import { eventEmitterService } from '../infrastructure/services/EventEmitterService';

/**
 * Clean Architecture Visit Controller
 * Uses use cases instead of direct model access
 */

/**
 * Check in a visitor
 * POST /api/v1/visits/checkin
 */
export const checkIn = async (req: Request, res: Response) => {
  try {
    const useCase = container.createCheckInVisitorUseCase();
    const result = await useCase.execute(req.body);

    const visitId = typeof (result as { id?: unknown }).id === 'number'
      ? (result as { id: number }).id
      : undefined;

    eventEmitterService.emitVisitEvent({
      type: 'visit:checked-in',
      timestamp: new Date().toISOString(),
      visitId,
    });

    res.status(201).json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Check-in error:', error);
    res.status(400).json(ResponseBuilder.error(
      'CHECKIN_FAILED',
      error instanceof Error ? error.message : 'Failed to check in visitor'
    ));
  }
};

/**
 * Check out a visitor
 * POST /api/v1/visits/:id/checkout
 */
export const checkOut = async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const visitId = parseInt(idParam);

    if (isNaN(visitId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid visit ID'));
    }

    const useCase = container.createCheckOutVisitorUseCase();
    const result = await useCase.execute({
      visitId,
      notes: req.body.notes
    });

    eventEmitterService.emitVisitEvent({
      type: 'visit:checked-out',
      timestamp: new Date().toISOString(),
      visitId,
    });

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Check-out error:', error);
    res.status(400).json(ResponseBuilder.error(
      'CHECKOUT_FAILED',
      error instanceof Error ? error.message : 'Failed to check out visitor'
    ));
  }
};

/**
 * Admit a waiting visitor
 * POST /api/v1/visits/:id/admit
 */
export const admitVisitor = async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const visitId = parseInt(idParam);

    if (isNaN(visitId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid visit ID'));
    }

    const useCase = container.createAdmitVisitorUseCase();
    const result = await useCase.execute(visitId);

    eventEmitterService.emitVisitEvent({
      type: 'visit:admitted',
      timestamp: new Date().toISOString(),
      visitId,
    });

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Admit visitor error:', error);
    res.status(400).json(ResponseBuilder.error(
      'ADMIT_FAILED',
      error instanceof Error ? error.message : 'Failed to admit visitor'
    ));
  }
};

/**
 * Get all active visits
 * GET /api/v1/visits/active
 */
export const getActiveVisits = async (_req: Request, res: Response) => {
  try {
    const useCase = container.createGetActiveVisitsUseCase();
    const visits = await useCase.execute();

    res.json(ResponseBuilder.success(visits));
  } catch (error) {
    logger.error('Get active visits error:', error);
    res.status(500).json(ResponseBuilder.error('FETCH_FAILED', 'Failed to fetch active visits'));
  }
};

/**
 * Get all waiting visits
 * GET /api/v1/visits/waiting
 */
export const getWaitingVisits = async (_req: Request, res: Response) => {
  try {
    const useCase = container.createGetWaitingVisitsUseCase();
    const visits = await useCase.execute();

    res.json(ResponseBuilder.success(visits));
  } catch (error) {
    logger.error('Get waiting visits error:', error);
    res.status(500).json(ResponseBuilder.error('FETCH_FAILED', 'Failed to fetch waiting visits'));
  }
};

export const getVisits = async (req: Request, res: Response) => {
  try {
    // const useCase = container.createGetVisitsUseCase(); // Removed duplicate
    const page = req.query.page ? Math.max(parseInt(req.query.page as string), 1) : 1;
    const limitRaw = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    const filters = {
      ...req.query,
      page,
      limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined
    };

    const useCase = container.createGetVisitsUseCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await useCase.execute(filters as any);

    res.json(ResponseBuilder.success(result, {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit)
    }));
  } catch (error) {
    logger.error('Get visits error:', error);
    res.status(500).json(ResponseBuilder.error('FETCH_FAILED', 'Failed to fetch visits'));
  }
};

/**
 * Intermittent Exit — temporary exit from premises
 * POST /api/v1/visits/:id/intermittent-exit
 */
export const intermittentExit = async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const visitId = parseInt(idParam);

    if (isNaN(visitId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid visit ID'));
    }

    const useCase = container.createIntermittentExitUseCase();
    const result = await useCase.execute({
      visitId,
      notes: req.body.notes,
      registeredBy: (req as any).user?.username || null,
    });

    eventEmitterService.emitVisitEvent({
      type: 'visit:intermittent-exit',
      timestamp: new Date().toISOString(),
      visitId,
    });

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Intermittent exit error:', error);
    res.status(400).json(ResponseBuilder.error(
      'INTERMITTENT_EXIT_FAILED',
      error instanceof Error ? error.message : 'Failed to register temporary exit'
    ));
  }
};

/**
 * Intermittent Re-Entry — return to premises after temporary exit
 * POST /api/v1/visits/:id/intermittent-reentry
 */
export const intermittentReEntry = async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const visitId = parseInt(idParam);

    if (isNaN(visitId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid visit ID'));
    }

    const useCase = container.createIntermittentReEntryUseCase();
    const result = await useCase.execute({
      visitId,
      notes: req.body.notes,
      registeredBy: (req as any).user?.username || null,
    });

    eventEmitterService.emitVisitEvent({
      type: 'visit:intermittent-reentry',
      timestamp: new Date().toISOString(),
      visitId,
    });

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Intermittent re-entry error:', error);
    res.status(400).json(ResponseBuilder.error(
      'INTERMITTENT_REENTRY_FAILED',
      error instanceof Error ? error.message : 'Failed to register re-entry'
    ));
  }
};

/**
 * Get all intermittent visits
 * GET /api/v1/visits/intermittent
 */
export const getIntermittentVisits = async (_req: Request, res: Response) => {
  try {
    const useCase = container.createGetIntermittentVisitsUseCase();
    const visits = await useCase.execute();

    res.json(ResponseBuilder.success(visits));
  } catch (error) {
    logger.error('Get intermittent visits error:', error);
    res.status(500).json(ResponseBuilder.error('FETCH_FAILED', 'Failed to fetch intermittent visits'));
  }
};
