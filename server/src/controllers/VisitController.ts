import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import logger from '../config/logger';

const requireTenantId = (req: Request): number => {
  if (!req.tenantId) throw new Error('Tenant context is required');
  return req.tenantId;
};

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
    const tenantId = requireTenantId(req);
    const useCase = container.createCheckInVisitorUseCase();
    const result = await useCase.execute(tenantId, req.body);

    const visitId = typeof (result as { id?: unknown }).id === 'number'
      ? (result as { id: number }).id
      : undefined;

    container.eventEmitter.emitVisitEvent({
      type: 'visit:checked-in',
      timestamp: new Date().toISOString(),
      visitId,
      tenantId,
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
    const tenantId = requireTenantId(req);
    const result = await useCase.execute(tenantId, {
      visitId,
      notes: req.body.notes
    });

    container.eventEmitter.emitVisitEvent({
      type: 'visit:checked-out',
      timestamp: new Date().toISOString(),
      visitId,
      tenantId,
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
    const tenantId = requireTenantId(req);
    const result = await useCase.execute(tenantId, visitId);

    container.eventEmitter.emitVisitEvent({
      type: 'visit:admitted',
      timestamp: new Date().toISOString(),
      visitId,
      tenantId,
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
export const getActiveVisits = async (req: Request, res: Response) => {
  try {
    const useCase = container.createGetActiveVisitsUseCase();
    const visits = await useCase.execute(requireTenantId(req));

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
export const getWaitingVisits = async (req: Request, res: Response) => {
  try {
    const useCase = container.createGetWaitingVisitsUseCase();
    const visits = await useCase.execute(requireTenantId(req));

    res.json(ResponseBuilder.success(visits));
  } catch (error) {
    logger.error('Get waiting visits error:', error);
    res.status(500).json(ResponseBuilder.error('FETCH_FAILED', 'Failed to fetch waiting visits'));
  }
};

/**
 * Mark a visit as intermittent (visitor temporarily left)
 * POST /api/v1/visits/:id/intermittent
 */
export const goIntermittent = async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const visitId = parseInt(idParam);

    if (isNaN(visitId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid visit ID'));
    }

    const useCase = container.createGoIntermittentUseCase();
    const tenantId = requireTenantId(req);
    const result = await useCase.execute(tenantId, visitId, req.body.notes);

    container.eventEmitter.emitVisitEvent({
      type: 'visit:intermittent',
      timestamp: new Date().toISOString(),
      visitId,
      tenantId,
    });

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Go intermittent error:', error);
    res.status(400).json(ResponseBuilder.error(
      'INTERMITTENT_FAILED',
      error instanceof Error ? error.message : 'Failed to mark visit as intermittent'
    ));
  }
};

/**
 * Reactivate an intermittent visit (visitor returned)
 * POST /api/v1/visits/:id/reactivate
 */
export const reactivateVisit = async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const visitId = parseInt(idParam);

    if (isNaN(visitId)) {
      return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid visit ID'));
    }

    const useCase = container.createReactivateVisitUseCase();
    const tenantId = requireTenantId(req);
    const result = await useCase.execute(tenantId, visitId);

    container.eventEmitter.emitVisitEvent({
      type: 'visit:reactivated',
      timestamp: new Date().toISOString(),
      visitId,
      tenantId,
    });

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Reactivate visit error:', error);
    res.status(400).json(ResponseBuilder.error(
      'REACTIVATE_FAILED',
      error instanceof Error ? error.message : 'Failed to reactivate visit'
    ));
  }
};

/**
 * Get all intermittent visits
 * GET /api/v1/visits/intermittent
 */
export const getIntermittentVisits = async (req: Request, res: Response) => {
  try {
    const useCase = container.createGetIntermittentVisitsUseCase();
    const visits = await useCase.execute(requireTenantId(req));
    res.json(ResponseBuilder.success(visits));
  } catch (error) {
    logger.error('Get intermittent visits error:', error);
    res.status(500).json(ResponseBuilder.error('FETCH_FAILED', 'Failed to fetch intermittent visits'));
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
    const result = await useCase.execute(requireTenantId(req), filters as any);

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
    const tenantId = requireTenantId(req);
    const result = await useCase.execute(tenantId, {
      visitId,
      notes: req.body.notes,
      registeredBy: req.user?.username ?? undefined,
    });

    container.eventEmitter.emitVisitEvent({
      type: 'visit:intermittent-exit',
      timestamp: new Date().toISOString(),
      visitId,
      tenantId,
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
    const tenantId = requireTenantId(req);
    const result = await useCase.execute(tenantId, {
      visitId,
      notes: req.body.notes,
      registeredBy: req.user?.username ?? undefined,
    });

    container.eventEmitter.emitVisitEvent({
      type: 'visit:intermittent-reentry',
      timestamp: new Date().toISOString(),
      visitId,
      tenantId,
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

