/**
 * Unit Tests for ChangePasswordUseCase
 * Tests password change with policy validation and email notification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangePasswordUseCase } from '../../application/usecases/auth/ChangePassword.usecase';
import { JwtAuthService } from '../../infrastructure/services/JwtAuthService';
import { PasswordPolicy } from '../../domain/services/PasswordPolicy';
import { EmailService } from '../../infrastructure/services/EmailService';
import UserModel from '../../models/User';

// Mock UserModel
vi.mock('../../models/User', () => ({
    default: {
        findByPk: vi.fn()
    }
}));

describe('ChangePasswordUseCase', () => {
    let changePasswordUseCase: ChangePasswordUseCase;
    let authService: JwtAuthService;
    let passwordPolicy: PasswordPolicy;
    let emailService: EmailService;

    beforeEach(() => {
        vi.clearAllMocks();
        authService = new JwtAuthService();
        passwordPolicy = new PasswordPolicy();
        emailService = new EmailService();
        changePasswordUseCase = new ChangePasswordUseCase(
            authService,
            passwordPolicy,
            emailService
        );
    });

    describe('Successful Password Change', () => {
        it('should change password when current password is correct', async () => {
            const currentPassword = 'OldP@ssw0rd123';
            const newPassword = 'NewP@ssw0rd456';
            const hashedOldPassword = await authService.hashPassword(currentPassword);

            const mockUser = {
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                password: hashedOldPassword,
                mustChangePassword: true,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            await changePasswordUseCase.execute(1, currentPassword, newPassword);

            expect(mockUser.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    mustChangePassword: false,
                    passwordChangedAt: expect.any(Date)
                })
            );
        });

        it('should hash new password with bcrypt', async () => {
            const currentPassword = 'OldP@ssw0rd123';
            const newPassword = 'NewP@ssw0rd456';
            const hashedOldPassword = await authService.hashPassword(currentPassword);

            const mockUser = {
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                password: hashedOldPassword,
                mustChangePassword: true,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            await changePasswordUseCase.execute(1, currentPassword, newPassword);

            const updateCall = mockUser.update.mock.calls[0][0];
            expect(updateCall.password).toBeDefined();
            expect(updateCall.password).not.toBe(newPassword);
            expect(updateCall.password.startsWith('$2')).toBe(true);
        });

        it('should set mustChangePassword to false', async () => {
            const currentPassword = 'OldP@ssw0rd123';
            const newPassword = 'NewP@ssw0rd456';
            const hashedOldPassword = await authService.hashPassword(currentPassword);

            const mockUser = {
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                password: hashedOldPassword,
                mustChangePassword: true,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            await changePasswordUseCase.execute(1, currentPassword, newPassword);

            expect(mockUser.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    mustChangePassword: false
                })
            );
        });
    });

    describe('Password Policy Validation', () => {
        it('should reject password shorter than 12 characters', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('OldP@ssw0rd123')
            };

            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            await expect(
                changePasswordUseCase.execute(1, 'OldP@ssw0rd123', 'Short1@')
            ).rejects.toThrow('PASSWORD_POLICY_VIOLATION');
        });

        it('should reject password without uppercase letter', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('OldP@ssw0rd123')
            };

            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            await expect(
                changePasswordUseCase.execute(1, 'OldP@ssw0rd123', 'newp@ssw0rd123')
            ).rejects.toThrow('PASSWORD_POLICY_VIOLATION');
        });

        it('should reject common passwords', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('OldP@ssw0rd123')
            };

            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            await expect(
                changePasswordUseCase.execute(1, 'OldP@ssw0rd123', 'password')
            ).rejects.toThrow('PASSWORD_POLICY_VIOLATION');
        });
    });

    describe('Error Handling', () => {
        it('should throw USER_NOT_FOUND if user does not exist', async () => {
            (UserModel.findByPk as any).mockResolvedValue(null);

            await expect(
                changePasswordUseCase.execute(999, 'OldP@ssw0rd123', 'NewP@ssw0rd456')
            ).rejects.toThrow('USER_NOT_FOUND');
        });

        it('should throw INVALID_CURRENT_PASSWORD if current password is incorrect', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('OldP@ssw0rd123')
            };

            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            await expect(
                changePasswordUseCase.execute(1, 'WrongPassword123!', 'NewP@ssw0rd456')
            ).rejects.toThrow('INVALID_CURRENT_PASSWORD');
        });
    });
});
