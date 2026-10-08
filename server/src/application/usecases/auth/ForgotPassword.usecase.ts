import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { IEmailService } from '../../../domain/services/IEmailService';
import logger from '../../../config/logger';

export class ForgotPasswordUseCase {
  constructor(private userRepository: IUserRepository, private authService: IAuthService, private emailService: IEmailService) {}

  async execute(username: string): Promise<void> {
    const user = await this.userRepository.findByUsername(username);
    if (!user?.id || !user.email || !this.emailService.isConfigured()) return;
    const token = this.authService.generateResetToken();
    await this.userRepository.updateResetToken(user.id, this.authService.hashResetToken(token), new Date(Date.now() + 15 * 60 * 1000));
    try { await this.emailService.sendPasswordResetEmail(user.email, token, user.username); }
    catch {
      await this.userRepository.updateResetToken(user.id, null, null);
      logger.error('Password reset email could not be delivered');
    }
  }
}
