import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email().max(254).nullable().optional(),
  username: z.string().min(1, 'Username is required').max(100, 'Username too long'),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128, 'Password too long'),
  role: z.enum(['admin', 'operador', 'auditor', 'demo'], { message: 'Role must be admin, operador, auditor, or demo' }),
}).refine(data => data.role === 'demo' || !!data.email, { message: 'Email is required for operational accounts', path: ['email'] });

export const updateUserSchema = z.object({
  email: z.string().email().max(254).nullable().optional(),
  username: z.string().min(1, 'Username is required').max(100, 'Username too long').optional(),
  role: z.enum(['admin', 'operador', 'auditor', 'demo'], { message: 'Role must be admin, operador, auditor, or demo' }).optional(),
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(12, 'Password must be at least 12 characters').max(128, 'Password too long'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
