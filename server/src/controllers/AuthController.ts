import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import { LoginDto, SelectTenantDto, CreateDemoDto, RefreshTokenDto } from '../application/dto/AuthDto';
import { getClientInfo } from '../middleware/ipCapture';
import { setAuthCookies, clearAuthCookies } from '../utils/authCookies';
import logger from '../config/logger';

interface AuthError {
  message: string;
  minutesRemaining?: number;
  lockedUntil?: string;
  attemptsRemaining?: number;
  details?: string;
  errors?: unknown[];
}

/**
 * Clean Architecture Auth Controller
 */

export const login = async (req: Request, res: Response) => {
  try {
    const credentials: LoginDto = req.body;
    const useCase = container.createLoginUseCase();
    const result = await useCase.execute(credentials);

    // Capturar información del cliente para auditoría
    const clientInfo = getClientInfo(req);

    // Registrar login en log de actividad
    await container.auditLogRepository.log({
      tenantId: 0,
      userId: 0,
      username: result.user.username,
      action: 'LOGIN',
      entity: 'User',
      entityId: result.user.username,
      details: `Inicio de sesión exitoso (rol: ${result.user.role})`,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    // Hybrid auth: set httpOnly cookies for SSR/Next.js, keep JSON body for API clients.
    const access = result.accessToken ?? result.token;
    if (access) setAuthCookies(res, access, result.refreshToken ?? undefined);

    res.json(ResponseBuilder.success(result));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'ACCOUNT_LOCKED') {
      const err = error as AuthError;
      res.status(403).json(ResponseBuilder.error(
        'ACCOUNT_LOCKED',
        'Account locked due to multiple failed login attempts',
        {
          minutesRemaining: err.minutesRemaining,
          lockedUntil: err.lockedUntil
        }
      ));
    } else if (errorMessage === 'INVALID_CREDENTIALS') {
      const err = error as AuthError;
      const data = err.attemptsRemaining !== undefined ? {
        attemptsRemaining: err.attemptsRemaining
      } : undefined;

      res.status(401).json(ResponseBuilder.error('AUTH_FAILED', 'Invalid credentials', data));
    } else {
      logger.error('Login error:', error);
      res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Login failed'));
    }
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    const useCase = container.createForgotPasswordUseCase();
    const token = await useCase.execute(username);

    // Security: Never expose the token in the API response.
    // In production, send via email. Token is logged server-side for dev only.
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`[DEV ONLY] Password reset token for ${username}: ${token}`);
    }

    res.json(ResponseBuilder.success({
      message: 'If the account exists, a password reset has been initiated. Check your email or contact an administrator.'
    }));
  } catch (error: unknown) {
    const authErr = error as AuthError;
    if (authErr.message === 'USER_NOT_FOUND') {
      res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'User not found'));
    } else {
      logger.error('Forgot password error:', error);
      res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to process request'));
    }
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    const useCase = container.createResetPasswordUseCase();
    await useCase.execute(token, newPassword);

    res.json(ResponseBuilder.success({ message: 'Password reset successful' }));
  } catch (error: unknown) {
    const err = error as AuthError;
    if (err.message === 'INVALID_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      res.status(400).json(ResponseBuilder.error('INVALID_TOKEN', 'Invalid or expired token'));
    } else if (err.message === 'PASSWORD_POLICY_VIOLATION') {
      res.status(400).json(ResponseBuilder.error('VALIDATION_ERROR', err.details || 'Password does not meet security requirements', err.errors));
    } else {
      logger.error('Reset password error:', error);
      res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to reset password'));
    }
  }
};

/**
 * Refresh access token using refresh token.
 * Accepts an optional `tenantSlug` to scope the new access token to a tenant.
 * Requirements: 3.6, 3.10
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    // Accept refresh token from body (API clients) or httpOnly cookie (SSR).
    const bodyDto = req.body as Partial<RefreshTokenDto>;
    const refreshToken = bodyDto?.refreshToken || req.cookies?.lm_refresh_token;
    const tenantSlug = bodyDto?.tenantSlug;
    if (!refreshToken) {
      return res.status(400).json(ResponseBuilder.error('VALIDATION_ERROR', 'refreshToken is required'));
    }
    const useCase = container.createRefreshTokenUseCase();
    const result = await useCase.execute(refreshToken, tenantSlug);

    // Rotate access cookie; refresh cookie stays the same (not rotated).
    setAuthCookies(res, result.accessToken);

    res.json(ResponseBuilder.success(result));
  } catch (error: unknown) {
    const err = error as AuthError;
    if (err.message === 'INVALID_REFRESH_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      res.status(401).json(ResponseBuilder.error('INVALID_TOKEN', 'Invalid or expired refresh token'));
    } else if (err.message === 'TENANT_MEMBERSHIP_REQUIRED') {
      res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'User is not a member of the requested tenant'));
    } else if (err.message === 'TENANT_UNAVAILABLE') {
      res.status(403).json(ResponseBuilder.error('TENANT_UNAVAILABLE', 'Tenant is unavailable'));
    } else {
      logger.error('Refresh token error:', error);
      res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to refresh token'));
    }
  }
};

/**
 * Change user password
 * Requirements: 5.4, 5.5, 5.7, 5.8, 5.10
 */
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    const useCase = container.createChangePasswordUseCase();
    await useCase.execute(userId, currentPassword, newPassword);

    res.json(ResponseBuilder.success({ message: 'Password changed successfully' }));
  } catch (error: unknown) {
    const err = error as AuthError;
    if (err.message === 'INVALID_CURRENT_PASSWORD') {
      res.status(401).json(ResponseBuilder.error('INVALID_PASSWORD', 'Current password is incorrect'));
    } else if (err.message === 'PASSWORD_POLICY_VIOLATION') {
      res.status(400).json(ResponseBuilder.error('VALIDATION_ERROR', err.details || 'Password does not meet security requirements', err.errors));
    } else {
      logger.error('Change password error:', error);
      res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to change password'));
    }
  }
};

/**
 * List the tenants the authenticated user belongs to, with their role in each.
 */
export const listTenants = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const memberships = await container.tenantUserRepository.findByUserIdWithTenant(userId);

    const tenants = memberships
      .filter(m => m.tenant.status !== 'suspended')
      .map(m => ({
        id: m.tenant.id!,
        slug: m.tenant.slug,
        name: m.tenant.name,
        role: m.role,
        status: m.tenant.status || 'active',
        isDemo: !!m.tenant.isDemo,
        plan: m.tenant.subscriptionPlan || 'free',
        subscriptionExpiresAt: m.tenant.subscriptionExpiresAt || null
      }));

    res.json(ResponseBuilder.success({ tenants }));
  } catch (error: unknown) {
    logger.error('List tenants error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to list tenants'));
  }
};

/**
 * Select a working tenant. Issues a new access token scoped to the chosen
 * tenant. The existing refresh token is kept (not rotated).
 */
export const selectTenant = async (req: Request, res: Response) => {
  try {
    const { tenantSlug } = req.body as SelectTenantDto;
    const userId = req.user!.id;

    const membership = await container.tenantUserRepository.findMembershipBySlug(userId, tenantSlug);
    if (!membership) {
      return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'User is not a member of the requested tenant'));
    }

    const memberships = await container.tenantUserRepository.findByUserIdWithTenant(userId);
    const match = memberships.find(m => m.tenant.slug === tenantSlug);
    if (!match || match.tenant.status === 'suspended' || (match.tenant.isDemo && match.tenant.demoExpiresAt && match.tenant.demoExpiresAt < new Date())) {
      return res.status(403).json(ResponseBuilder.error('TENANT_UNAVAILABLE', 'Tenant is unavailable'));
    }

    const tokenUser = {
      id: userId,
      username: req.user!.username,
      email: req.user!.email ?? undefined,
      tenantId: match.tenant.id,
      tenantSlug: match.tenant.slug,
      role: membership.role
    };
    const accessToken = container.authService.generateAccessToken(tokenUser);

    // Rotate access cookie with the new tenant-scoped token.
    setAuthCookies(res, accessToken);

    res.json(ResponseBuilder.success({
      accessToken,
      tenant: {
        id: match.tenant.id,
        slug: match.tenant.slug,
        name: match.tenant.name,
        role: membership.role
      }
    }));
  } catch (error: unknown) {
    logger.error('Select tenant error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to select tenant'));
  }
};

/**
 * Logout — clears auth cookies and invalidates the access token in the
 * blacklist. Accepts token from Authorization header or access cookie.
 */
export const logout = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.slice(7).trim()
      : req.cookies?.lm_access_token;

    if (token) {
      container.tokenBlacklist.add(token);
      const decoded = jwt.decode(token) as { id?: number; iat?: number } | null;
      if (decoded && typeof decoded === 'object' && decoded.id) {
        container.tokenBlacklist.invalidateUserTokens(decoded.id);
      }
      if (req.user?.username) {
        const clientInfo = getClientInfo(req);
        await container.auditLogRepository.log({
          tenantId: req.user.tid ?? 0,
          userId: req.user.id ?? 0,
          username: req.user.username,
          action: 'LOGOUT',
          entity: 'User',
          entityId: req.user.username,
          details: 'Cierre de sesión',
          ipAddress: clientInfo.ip,
          userAgent: clientInfo.userAgent
        });
      }
    }

    clearAuthCookies(res);
    res.json(ResponseBuilder.success({ message: 'Logged out successfully' }));
  } catch (error: unknown) {
    logger.error('Logout error:', error);
    clearAuthCookies(res);
    res.json(ResponseBuilder.success({ message: 'Logged out' }));
  }
};

/**
 * Create a demo tenant with pre-provisioned users and seed data.
 * Public endpoint, strictly rate-limited.
 */
export const createDemo = async (req: Request, res: Response) => {
  try {
    const dto: CreateDemoDto = req.body;
    const useCase = container.createCreateDemoTenantUseCase();
    const result = await useCase.execute(dto);

    res.status(201).json(ResponseBuilder.success(result));
  } catch (error: unknown) {
    logger.error('Create demo tenant error:', error);
    res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to create demo tenant'));
  }
};
