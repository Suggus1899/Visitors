import { z } from 'zod';

export const loginSchema = z.object({
  // `username` accepts either a username or an email address.
  username: z.string().min(1, 'Username or email is required').max(200, 'Identifier too long'),
  password: z.string().min(1, 'Password is required').max(200, 'Password too long'),
});

export const forgotPasswordSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100, 'Username too long'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters').max(128, 'Password must not exceed 128 characters'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  tenantSlug: z.string().max(100, 'Tenant slug too long').optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters').max(128, 'Password must not exceed 128 characters'),
  confirmPassword: z.string().optional(),
}).refine((data) => !data.confirmPassword || data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const selectTenantSchema = z.object({
  tenantSlug: z.string().min(1, 'Tenant slug is required').max(100, 'Tenant slug too long'),
});

export const createDemoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  email: z.string().email('A valid email is required').max(200, 'Email too long'),
  company: z.string().max(200, 'Company name too long').optional(),
  phone: z.string().max(50, 'Phone too long').optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SelectTenantInput = z.infer<typeof selectTenantSchema>;
export type CreateDemoInput = z.infer<typeof createDemoSchema>;
