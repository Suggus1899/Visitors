import { z } from 'zod';

export const getAuditLogsSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  action: z.string().optional(),
  username: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const getAuditLogsByUserIdSchema = z.object({
  userId: z.coerce.number().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});
