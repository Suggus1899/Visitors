import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import { LoginDto } from '../application/dto/AuthDto';
import { getClientInfo } from '../middleware/ipCapture';
import logger from '../config/logger';

interface AuthError {
  message: string;
  minutesRemaining?: number;
  lockedUntil?: string;
  attemptsRemaining?: number;
  details?: string;
  errors?: unknown[];
}

interface AuthenticatedRequest extends Request {
  user?: { id: number; username: string; role: string };
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
      userId: 0,
      username: result.user.username,
      action: 'LOGIN',
      entity: 'User',
      entityId: result.user.username,
      details: `Inicio de sesión exitoso (rol: ${result.user.role})`,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

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
 * Refresh access token using refresh token
 * Requirements: 3.6, 3.10
 */
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const useCase = container.createRefreshTokenUseCase();
    const result = await useCase.execute(refreshToken);

    res.json(ResponseBuilder.success(result));
  } catch (error: unknown) {
    const err = error as AuthError;
    if (err.message === 'INVALID_REFRESH_TOKEN' || err.message === 'TOKEN_EXPIRED') {
      res.status(401).json(ResponseBuilder.error('INVALID_TOKEN', 'Invalid or expired refresh token'));
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
