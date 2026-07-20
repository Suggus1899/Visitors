/**
 * Change Password Use Case
 * Allows authenticated users to change their password
 * Requirements: 5.4, 5.5, 5.7, 5.8, 5.10
 */

import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { IEmailService } from '../../../domain/services/IEmailService';
import { PasswordPolicy } from '../../../domain/services/PasswordPolicy';
import logger from '../../../../config/logger';

interface PasswordPolicyError extends Error {
    errors: string[];
    details: string;
}

export class ChangePasswordUseCase {
    constructor(
        private userRepository: IUserRepository,
        private authService: IAuthService,
        private passwordPolicy: PasswordPolicy,
        private emailService: IEmailService
    ) { }

    async execute(userId: number, currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.userRepository.findById(userId);

        if (!user) {
            throw new Error('USER_NOT_FOUND');
        }

        const isValidPassword = await this.authService.verifyPassword(currentPassword, user.password || '');

        if (!isValidPassword) {
            throw new Error('INVALID_CURRENT_PASSWORD');
        }

        const validation = this.passwordPolicy.validate(newPassword);

        if (!validation.isValid) {
            const error = new Error('PASSWORD_POLICY_VIOLATION') as PasswordPolicyError;
            error.errors = validation.errors;
            error.details = validation.errors.join(', ');
            throw error;
        }

        const hashedPassword = await this.authService.hashPassword(newPassword);

        await this.userRepository.updatePasswordChange(userId, hashedPassword, false, new Date());

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
