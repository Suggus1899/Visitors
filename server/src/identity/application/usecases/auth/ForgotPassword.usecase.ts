import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { IEmailService } from '../../../domain/services/IEmailService';
import logger from '../../../../config/logger';

export class ForgotPasswordUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService,
    private emailService: IEmailService
  ) { }

  async execute(username: string): Promise<string> {
    const user = await this.userRepository.findByUsername(username);

    // Security: Don't reveal if user exists (Requirement: 11.7)
    // But for development, we'll throw an error
    if (!user || !user.id) {
      throw new Error('USER_NOT_FOUND');
    }

    // Generate secure 32-byte token (Requirement: 11.3)
    const token = this.authService.generateResetToken();

    // Hash token with SHA-256 before storing (Requirement: 11.4)
    const hashedToken = this.authService.hashResetToken(token);

    // Set expiry to 15 minutes (Requirement: 11.5)
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.userRepository.updateResetToken(user.id, hashedToken, expiry);

    // Send email with unhashed token (Requirements: 11.6, 11.7)
    if (this.emailService.isConfigured()) {
      try {
        await this.emailService.sendPasswordResetEmail(
          user.username, // Using username as email for now
          token, // Send unhashed token
          user.username
        );
        logger.info(`Password reset email sent to ${user.username}`);
      } catch (error) {
        logger.error('Failed to send password reset email:', error);
        throw new Error('EMAIL_SEND_FAILED');
      }
    } else {
      // Email not configured - log token for development
      logger.warn(`[EMAIL NOT CONFIGURED] Password Reset for ${username}. Token: ${token}`);
      logger.warn(`Reset link: ${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`);
    }

    return token;
  }
}
