/**
 * Change Password Use Case
 * Allows authenticated users to change their password
 * Requirements: 5.4, 5.5, 5.7, 5.8, 5.10
 */

import { JwtAuthService } from '../../../infrastructure/services/JwtAuthService';
import { PasswordPolicy } from '../../../domain/services/PasswordPolicy';
import { EmailService } from '../../../infrastructure/services/EmailService';
import UserModel from '../../../models/User';

export class ChangePasswordUseCase {
    constructor(
        private authService: JwtAuthService,
        private passwordPolicy: PasswordPolicy,
        private emailService: EmailService
    ) { }

    async execute(userId: number, currentPassword: string, newPassword: string): Promise<void> {
        // Find user
        const user = await UserModel.findByPk(userId);

        if (!user) {
            throw new Error('USER_NOT_FOUND');
        }

        // Verify current password
        const isValidPassword = await this.authService.verifyPassword(currentPassword, user.password);

        if (!isValidPassword) {
            throw new Error('INVALID_CURRENT_PASSWORD');
        }

        // Validate new password against policy (Requirement: 5.10)
        const validation = this.passwordPolicy.validate(newPassword);

        if (!validation.isValid) {
            const error: any = new Error('PASSWORD_POLICY_VIOLATION');
            error.errors = validation.errors;
            error.details = validation.errors.join(', ');
            throw error;
        }

        // Hash new password with bcrypt 12 rounds (Requirement: 8.1)
        const hashedPassword = await this.authService.hashPassword(newPassword);

        // Update user (Requirements: 5.5, 5.8)
        await user.update({
            password: hashedPassword,
            mustChangePassword: false,
            passwordChangedAt: new Date()
        });

        // Send confirmation email (Requirement: 11.10)
        if (this.emailService.isConfigured()) {
            try {
                await this.emailService.sendPasswordChangedEmail(
                    user.username, // Using username as email for now
                    user.username
                );
            } catch (error) {
                console.error('Failed to send password changed email:', error);
                // Don't throw - email failure shouldn't prevent password change
            }
        }
    }
}
