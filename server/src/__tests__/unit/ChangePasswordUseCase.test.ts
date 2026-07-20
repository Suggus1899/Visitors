/**
 * Unit Tests for ChangePasswordUseCase
 * Tests password change with policy validation and email notification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangePasswordUseCase } from '../../identity/application/usecases/auth/ChangePassword.usecase';
import { JwtAuthService } from '../../identity/infrastructure/services/JwtAuthService';
import { PasswordPolicy } from '../../identity/domain/services/PasswordPolicy';
import { EmailService } from '../../identity/infrastructure/services/EmailService';
import { IUserRepository } from '../../identity/domain/repositories/IUserRepository';
import { User } from '../../identity/domain/entities/User.entity';

describe('ChangePasswordUseCase', () => {
    let changePasswordUseCase: ChangePasswordUseCase;
    let authService: JwtAuthService;
    let passwordPolicy: PasswordPolicy;
    let emailService: EmailService;
    let userRepository: IUserRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        authService = new JwtAuthService();
        passwordPolicy = new PasswordPolicy();
        emailService = new EmailService();
        userRepository = {
            findAll: vi.fn(),
            findByUsername: vi.fn(),
            findById: vi.fn(),
            findByResetToken: vi.fn(),
            save: vi.fn(),
            delete: vi.fn(),
            updatePassword: vi.fn(),
            updatePasswordChange: vi.fn().mockResolvedValue(undefined),
            updateLoginAttempts: vi.fn(),
            updateResetToken: vi.fn()
        } as unknown as IUserRepository;
        changePasswordUseCase = new ChangePasswordUseCase(
            userRepository,
            authService,
            passwordPolicy,
            emailService
        );
    });

    const buildUser = async (password: string): Promise<User> => {
        const hashed = await authService.hashPassword(password);
        return new User('testuser', 'admin', hashed, 1);
    };

    describe('Successful Password Change', () => {
        it('should change password when current password is correct', async () => {
            const currentPassword = 'OldP@ssw0rd123';
            const newPassword = 'NewP@ssw0rd456';
            const user = await buildUser(currentPassword);

            (userRepository.findById as any).mockResolvedValue(user);

            await changePasswordUseCase.execute(1, currentPassword, newPassword);

            expect(userRepository.updatePasswordChange).toHaveBeenCalledWith(
                1,
                expect.any(String),
                false,
                expect.any(Date)
            );
        });

        it('should hash new password with bcrypt', async () => {
            const currentPassword = 'OldP@ssw0rd123';
            const newPassword = 'NewP@ssw0rd456';
            const user = await buildUser(currentPassword);

            (userRepository.findById as any).mockResolvedValue(user);

            await changePasswordUseCase.execute(1, currentPassword, newPassword);

            const call = (userRepository.updatePasswordChange as any).mock.calls[0];
            expect(call[1]).toBeDefined();
            expect(call[1]).not.toBe(newPassword);
            expect(call[1].startsWith('$2')).toBe(true);
        });

        it('should set mustChangePassword to false', async () => {
            const currentPassword = 'OldP@ssw0rd123';
            const newPassword = 'NewP@ssw0rd456';
            const user = await buildUser(currentPassword);

            (userRepository.findById as any).mockResolvedValue(user);

            await changePasswordUseCase.execute(1, currentPassword, newPassword);

            const call = (userRepository.updatePasswordChange as any).mock.calls[0];
            expect(call[2]).toBe(false);
        });
    });

    describe('Password Policy Validation', () => {
        it('should reject password shorter than 12 characters', async () => {
            const user = await buildUser('OldP@ssw0rd123');

            (userRepository.findById as any).mockResolvedValue(user);

            await expect(
                changePasswordUseCase.execute(1, 'OldP@ssw0rd123', 'Short1@')
            ).rejects.toThrow('PASSWORD_POLICY_VIOLATION');
        });

        it('should reject password without uppercase letter', async () => {
            const user = await buildUser('OldP@ssw0rd123');

            (userRepository.findById as any).mockResolvedValue(user);

            await expect(
                changePasswordUseCase.execute(1, 'OldP@ssw0rd123', 'newp@ssw0rd123')
            ).rejects.toThrow('PASSWORD_POLICY_VIOLATION');
        });

        it('should reject common passwords', async () => {
            const user = await buildUser('OldP@ssw0rd123');

            (userRepository.findById as any).mockResolvedValue(user);

            await expect(
                changePasswordUseCase.execute(1, 'OldP@ssw0rd123', 'password')
            ).rejects.toThrow('PASSWORD_POLICY_VIOLATION');
        });
    });

    describe('Error Handling', () => {
        it('should throw USER_NOT_FOUND if user does not exist', async () => {
            (userRepository.findById as any).mockResolvedValue(null);

            await expect(
                changePasswordUseCase.execute(999, 'OldP@ssw0rd123', 'NewP@ssw0rd456')
            ).rejects.toThrow('USER_NOT_FOUND');
        });

        it('should throw INVALID_CURRENT_PASSWORD if current password is incorrect', async () => {
            const user = await buildUser('OldP@ssw0rd123');

            (userRepository.findById as any).mockResolvedValue(user);

            await expect(
                changePasswordUseCase.execute(1, 'WrongPassword123!', 'NewP@ssw0rd456')
            ).rejects.toThrow('INVALID_CURRENT_PASSWORD');
        });
    });
});
