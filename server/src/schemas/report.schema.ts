import { z } from 'zod';

export const getStatsSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

export const getMonthlyReportSchema = z.object({
  month: z.coerce.number().min(0).max(11).optional(),
  year: z.coerce.number().min(2000).max(2100).optional(),
});

export const getComparisonStatsSchema = z.object({
  month: z.coerce.number().min(0).max(11).optional(),
  year: z.coerce.number().min(2000).max(2100).optional(),
});
