import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100, 'Username too long'),
  password: z.string().min(1, 'Password is required').max(200, 'Password too long'),
});

export const forgotPasswordSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100, 'Username too long'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(200, 'Password too long'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
