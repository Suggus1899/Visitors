import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import { LoginDto } from '../application/dto/AuthDto';
import { getClientInfo } from '../middleware/ipCapture';
import { logActivity } from '../models/ActivityLog';

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
    await logActivity(
      0, // userId temporal, se actualiza luego
      result.user.username,
      'LOGIN',
      'User',
      result.user.username,
      `Inicio de sesión exitoso (rol: ${result.user.role})`,
      clientInfo.ip,
      clientInfo.userAgent
    );
    
    res.json(ResponseBuilder.success(result));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'INVALID_CREDENTIALS') {
      res.status(401).json(ResponseBuilder.error('AUTH_FAILED', 'Invalid credentials'));
    } else {
      console.error('Login error:', error);
      res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Login failed'));
    }
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    const useCase = container.createForgotPasswordUseCase();
    const token = await useCase.execute(username);
    
    res.json(ResponseBuilder.success({ 
      message: 'Reset token generated (Check console)', 
      token // Exposed for demo/local purposes
    }));
  } catch (error: any) {
    if (error.message === 'USER_NOT_FOUND') {
      res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'User not found'));
    } else {
      console.error('Forgot password error:', error);
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
  } catch (error: any) {
    if (error.message === 'INVALID_TOKEN' || error.message === 'TOKEN_EXPIRED') {
      res.status(400).json(ResponseBuilder.error('INVALID_TOKEN', 'Invalid or expired token'));
    } else {
      console.error('Reset password error:', error);
      res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Failed to reset password'));
    }
  }
};
