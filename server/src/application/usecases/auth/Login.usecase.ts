import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { JwtAuthService } from '../../../infrastructure/services/JwtAuthService';
import { LoginDto, AuthResponseDto } from '../../dto/AuthDto';
import { logActivity } from '../../../models/ActivityLog';
import UserModel from '../../../models/User';
import config from '../../../config/AppConfig';
import bcrypt from 'bcryptjs';

export class LoginUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService
  ) { }

  async execute(credentials: LoginDto): Promise<AuthResponseDto> {
    // Find user using Sequelize model directly for update operations
    const user = await UserModel.findOne({ where: { username: credentials.username } });

    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.password) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Check account lockout (Requirements: 9.3, 9.4)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      const error: any = new Error('ACCOUNT_LOCKED');
      error.minutesRemaining = minutesRemaining;
      error.lockedUntil = user.lockedUntil;
      throw error;
    }

    // Verify password
    const isValid = await this.authService.verifyPassword(credentials.password, user.password);

    if (!isValid) {
      // Increment login attempts (Requirement: 9.5)
      const newAttempts = (user.loginAttempts || 0) + 1;

      // Check if we should lock the account (Requirement: 9.6)
      if (newAttempts >= config.maxLoginAttempts) {
        const lockoutDuration = config.lockoutDurationMinutes * 60 * 1000; // Convert to milliseconds
        const lockedUntil = new Date(Date.now() + lockoutDuration);

        await user.update({
          loginAttempts: newAttempts,
          lockedUntil: lockedUntil
        });

        // Create audit log for account lockout (Requirement: 9.8)
        try {
          await logActivity(
            user.id!,
            user.username,
            'ACCOUNT_LOCKED',
            'User',
            user.id!.toString(),
            `Account locked after ${newAttempts} failed login attempts`,
            undefined,
            undefined
          );
        } catch (error) {
          console.error('Failed to log account lockout:', error);
        }

        const error: any = new Error('ACCOUNT_LOCKED');
        error.minutesRemaining = config.lockoutDurationMinutes;
        error.lockedUntil = lockedUntil;
        throw error;
      } else {
        // Update login attempts
        await user.update({
          loginAttempts: newAttempts
        });

        // Notify user of remaining attempts (Requirement: 9.10)
        if (newAttempts >= 3) {
          const attemptsRemaining = config.maxLoginAttempts - newAttempts;
          const error: any = new Error('INVALID_CREDENTIALS');
          error.attemptsRemaining = attemptsRemaining;
          throw error;
        }
      }

      throw new Error('INVALID_CREDENTIALS');
    }

    // Password is valid - reset login attempts (Requirement: 9.7)
    await user.update({
      loginAttempts: 0,
      lockedUntil: null
    });

    // Check if password needs re-hashing (Requirements: 8.7, 8.8)
    try {
      const currentRounds = bcrypt.getRounds(user.password);
      if (currentRounds < config.bcryptRounds) {
        console.log(`Re-hashing password for user ${user.username} (${currentRounds} -> ${config.bcryptRounds} rounds)`);
        const newHash = await this.authService.hashPassword(credentials.password);
        await user.update({ password: newHash });
      }
    } catch (error) {
      console.error('Failed to check/update bcrypt rounds:', error);
      // Don't throw - this is not critical for login
    }

    // Generate token pair (Requirements: 3.1, 3.4, 3.5)
    let accessToken: string;
    let refreshToken: string;

    if (this.authService instanceof JwtAuthService) {
      const tokenPair = this.authService.generateTokenPair(user);
      accessToken = tokenPair.accessToken;
      refreshToken = tokenPair.refreshToken;
    } else {
      // Fallback for legacy auth service
      accessToken = this.authService.generateToken(user);
      refreshToken = accessToken; // Temporary fallback
    }

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword || false
      }
    };
  }
}
