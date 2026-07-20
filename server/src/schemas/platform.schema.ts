import { z } from 'zod';

const planEnum = z.enum(['free', 'starter', 'professional', 'enterprise']);
const statusEnum = z.enum(['active', 'suspended', 'trial']);

// ---------- Tenant ----------
export const createTenantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug too long').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
  plan: planEnum.optional().default('free'),
  isDemo: z.boolean().optional().default(false),
  demoExpiresAt: z.string().datetime().optional().nullable(),
  subscriptionExpiresAt: z.string().datetime().optional().nullable(),
  maxUsers: z.number().int().positive().optional(),
  maxVisitors: z.number().int().positive().optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes').optional(),
  plan: planEnum.optional(),
  status: statusEnum.optional(),
  subscriptionExpiresAt: z.string().datetime().optional().nullable(),
  demoExpiresAt: z.string().datetime().optional().nullable(),
  maxUsers: z.number().int().positive().optional(),
  maxVisitors: z.number().int().positive().optional(),
});

export const listTenantsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(10),
  status: statusEnum.optional(),
  plan: planEnum.optional(),
  isDemo: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'name']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ---------- Users ----------
export const updatePlatformUserSchema = z.object({
  email: z.string().email().optional(),
  isSuperAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  role: z.enum(['admin', 'operador', 'auditor', 'demo']).optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(20),
  isSuperAdmin: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  search: z.string().optional(),
  sortBy: z.enum(['username', 'createdAt']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ---------- Subscriptions ----------
export const updateSubscriptionSchema = z.object({
  plan: planEnum.optional(),
  subscriptionExpiresAt: z.string().datetime().optional().nullable(),
  limitsOverride: z.object({
    maxUsers: z.number().int().positive().nullable().optional(),
    maxVisitors: z.number().int().positive().nullable().optional(),
  }).optional(),
});

// ---------- Audit logs ----------
export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(20),
  tenantId: z.coerce.number().optional(),
  action: z.string().optional(),
  username: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  export: z.enum(['csv', 'json']).optional(),
});

export const listTenantAuditLogsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(20),
  action: z.string().optional(),
  username: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
});

// ---------- Tenant users ----------
export const createTenantUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
  role: z.enum(['admin', 'operador', 'auditor', 'demo']),
});

export const updateTenantUserSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().nullable(),
  role: z.enum(['admin', 'operador', 'auditor', 'demo']).optional(),
  isActive: z.boolean().optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UpdatePlatformUserInput = z.infer<typeof updatePlatformUserSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;
export type UpdateTenantUserInput = z.infer<typeof updateTenantUserSchema>;
