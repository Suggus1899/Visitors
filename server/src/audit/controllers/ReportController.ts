import { Request, Response } from 'express';
import { container } from '../../shared/Container';
import { ResponseBuilder } from '../../shared/ApiResponse';
import logger from '../../config/logger';

const requireTenantId = (req: Request): number => {
  if (!req.tenantId) throw new Error('Tenant context is required');
  return req.tenantId;
};

/**
 * Clean Architecture Report Controller
 * Handles statistical data and reports
 */

/**
 * Get visit statistics
 * GET /api/v1/reports/stats
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const useCase = container.createGetVisitStatsUseCase();
    const result = await useCase.execute(requireTenantId(req), start, end);

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json(ResponseBuilder.error('STATS_FAILED', 'Failed to generate statistics'));
  }
};

/**
 * Get monthly report
 * GET /api/v1/reports/stats/monthly
 */
export const getMonthlyReport = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month as string) : undefined;
    const targetYear = year ? parseInt(year as string) : undefined;

    const useCase = container.createGetMonthlyReportUseCase();
    const result = await useCase.execute(requireTenantId(req), targetMonth, targetYear);

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Get monthly report error:', error);
    res.status(500).json(ResponseBuilder.error('REPORT_FAILED', 'Failed to generate monthly report'));
  }
};

/**
 * Get missed checkouts (alerts)
 * GET /api/v1/reports/alerts
 */
export const getMissedCheckouts = async (req: Request, res: Response) => {
  try {
    const { threshold } = req.query;
    const hours = threshold ? parseInt(threshold as string) : 8;

    const useCase = container.createGetMissedCheckoutsUseCase();
    const result = await useCase.execute(requireTenantId(req), hours);

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json(ResponseBuilder.error('ALERTS_FAILED', 'Failed to get alerts'));
  }
};

/**
 * Get comparison stats
 * GET /api/v1/reports/comparison
 */
export const getComparisonStats = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month as string) : undefined;
    const targetYear = year ? parseInt(year as string) : undefined;

    const useCase = container.createGetComparisonStatsUseCase();
    const result = await useCase.execute(requireTenantId(req), targetMonth, targetYear);

    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('Get comparison error:', error);
    res.status(500).json(ResponseBuilder.error('COMPARISON_FAILED', 'Failed to get comparison stats'));
  }
};
