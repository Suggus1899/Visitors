import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { JwtAuthService } from '../../../infrastructure/services/JwtAuthService';
import { PasswordPolicy } from '../../../domain/services/PasswordPolicy';
import { EmailService } from '../../../infrastructure/services/EmailService';
import UserModel from '../../../models/User';

export class ResetPasswordUseCase {
    constructor(
        private userRepository: IUserRepository,
        private authService: JwtAuthService,
        private passwordPolicy: PasswordPolicy,
        private emailService: EmailService
    ) { }

    async execute(token: string, newPassword: string): Promise<void> {
        // Hash the received token to match stored hash (Requirement: 11.8)
        const hashedToken = this.authService.hashResetToken(token);

        const user = await this.userRepository.findByResetToken(hashedToken);

        if (!user || !user.id || !user.resetTokenExpiry) {
            throw new Error('INVALID_TOKEN');
        }

        // Verify token has not expired (Requirement: 11.8)
        if (user.resetTokenExpiry < new Date()) {
            throw new Error('TOKEN_EXPIRED');
        }

        // Validate new password against policy (Requirements: 4.1-4.9)
        const validation = this.passwordPolicy.validate(newPassword);

        if (!validation.isValid) {
            const error: any = new Error('PASSWORD_POLICY_VIOLATION');
            error.errors = validation.errors;
            error.details = validation.errors.join(', ');
            throw error;
        }

        // Hash password with bcrypt 12 rounds (Requirement: 8.1)
        const hashedPassword = await this.authService.hashPassword(newPassword);

        // Update password and clear reset token (Requirement: 11.9)
        await this.userRepository.updatePassword(user.id, hashedPassword);
        await this.userRepository.updateResetToken(user.id, null, null);

        // Set mustChangePassword to false since user just set a new password
        const userModel = await UserModel.findByPk(user.id);
        if (userModel) {
            await userModel.update({
                mustChangePassword: false,
                passwordChangedAt: new Date()
            });
        }

        // Send confirmation email (Requirement: 11.10)
        if (this.emailService.isConfigured()) {
            try {
                await this.emailService.sendPasswordChangedEmail(
                    user.username, // Using username as email for now
                    user.username
                );
            } catch (error) {
                console.error('Failed to send password changed email:', error);
                // Don't throw - email failure shouldn't prevent password reset
            }
        }
    }
}
