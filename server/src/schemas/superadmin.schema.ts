import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100, 'Username too long'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
  role: z.enum(['admin', 'operador', 'auditor', 'demo'], { message: 'Role must be admin, operador, auditor, or demo' }),
});

export const updateUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100, 'Username too long').optional(),
  role: z.enum(['admin', 'operador', 'auditor', 'demo'], { message: 'Role must be admin, operador, auditor, or demo' }).optional(),
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
