import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';

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
    
    res.status(201).json(ResponseBuilder.success(result));
  } catch (error) {
    console.error('Check-in error:', error);
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
    
    res.json(ResponseBuilder.success(result));
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(400).json(ResponseBuilder.error(
      'CHECKOUT_FAILED',
      error instanceof Error ? error.message : 'Failed to check out visitor'
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
    const result = await useCase.execute();
    return res.json(ResponseBuilder.success(result));
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json(ResponseBuilder.error('CHECKOUT_FAILED', 'Failed to check out visitor'));
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
    console.error('Get visits error:', error);
    res.status(500).json(ResponseBuilder.error('FETCH_FAILED', 'Failed to fetch visits'));
  }
};
