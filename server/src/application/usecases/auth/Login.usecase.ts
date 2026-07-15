import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { LoginDto, AuthResponseDto } from '../../dto/AuthDto';
import config from '../../../config/AppConfig';
import bcrypt from 'bcryptjs';
import logger from '../../../config/logger';

export class LoginUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService,
    private auditLogRepository: IAuditLogRepository
  ) { }

  async execute(credentials: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByUsername(credentials.username);

    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.password) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      const error: any = new Error('ACCOUNT_LOCKED');
      error.minutesRemaining = minutesRemaining;
      error.lockedUntil = user.lockedUntil;
      throw error;
    }

    const isValid = await this.authService.verifyPassword(credentials.password, user.password);

    if (!isValid) {
      const newAttempts = (user.loginAttempts || 0) + 1;

      if (newAttempts >= config.maxLoginAttempts) {
        const lockoutDuration = config.lockoutDurationMinutes * 60 * 1000;
        const lockedUntil = new Date(Date.now() + lockoutDuration);

        await this.userRepository.updateLoginAttempts(user.id!, newAttempts, lockedUntil);

        try {
          await this.auditLogRepository.log({
            userId: user.id!,
            username: user.username,
            action: 'ACCOUNT_LOCKED',
            entity: 'User',
            entityId: user.id!.toString(),
            details: `Account locked after ${newAttempts} failed login attempts`
          });
        } catch (error) {
          logger.error('Failed to log account lockout:', error);
        }

        const error: any = new Error('ACCOUNT_LOCKED');
        error.minutesRemaining = config.lockoutDurationMinutes;
        error.lockedUntil = lockedUntil;
        throw error;
      } else {
        await this.userRepository.updateLoginAttempts(user.id!, newAttempts, user.lockedUntil || null);

        if (newAttempts >= 3) {
          const attemptsRemaining = config.maxLoginAttempts - newAttempts;
          const error: any = new Error('INVALID_CREDENTIALS');
          error.attemptsRemaining = attemptsRemaining;
          throw error;
        }
      }

      throw new Error('INVALID_CREDENTIALS');
    }

    await this.userRepository.updateLoginAttempts(user.id!, 0, null);

    try {
      const currentRounds = bcrypt.getRounds(user.password);
      if (currentRounds < config.bcryptRounds) {
        logger.info(`Re-hashing password for user ${user.username} (${currentRounds} -> ${config.bcryptRounds} rounds)`);
        const newHash = await this.authService.hashPassword(credentials.password);
        await this.userRepository.updatePassword(user.id!, newHash);
      }
    } catch (error) {
      logger.error('Failed to check/update bcrypt rounds:', error);
    }

    const tokenPair = this.authService.generateTokenPair(user);

    return {
      token: tokenPair.accessToken,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      user: {
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword || false
      }
    };
  }
}
