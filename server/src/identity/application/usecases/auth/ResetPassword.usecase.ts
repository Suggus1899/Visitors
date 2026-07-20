import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { IEmailService } from '../../../domain/services/IEmailService';
import { PasswordPolicy } from '../../../domain/services/PasswordPolicy';
import logger from '../../../../config/logger';

interface PasswordPolicyError extends Error {
    errors: string[];
    details: string;
}

export class ResetPasswordUseCase {
    constructor(
        private userRepository: IUserRepository,
        private authService: IAuthService,
        private passwordPolicy: PasswordPolicy,
        private emailService: IEmailService
    ) { }

    async execute(token: string, newPassword: string): Promise<void> {
        const hashedToken = this.authService.hashResetToken(token);

        const user = await this.userRepository.findByResetToken(hashedToken);

        if (!user || !user.id || !user.resetTokenExpiry) {
            throw new Error('INVALID_TOKEN');
        }

        if (user.resetTokenExpiry < new Date()) {
            throw new Error('TOKEN_EXPIRED');
        }

        const validation = this.passwordPolicy.validate(newPassword);

        if (!validation.isValid) {
            const error = new Error('PASSWORD_POLICY_VIOLATION') as PasswordPolicyError;
            error.errors = validation.errors;
            error.details = validation.errors.join(', ');
            throw error;
        }

        const hashedPassword = await this.authService.hashPassword(newPassword);

        await this.userRepository.updatePasswordChange(user.id, hashedPassword, false, new Date());
        await this.userRepository.updateResetToken(user.id, null, null);

        if (this.emailService.isConfigured()) {
            try {
                await this.emailService.sendPasswordChangedEmail(
                    user.username,
                    user.username
                );
            } catch (error) {
                logger.error('Failed to send password changed email:', error);
            }
        }
    }
}
