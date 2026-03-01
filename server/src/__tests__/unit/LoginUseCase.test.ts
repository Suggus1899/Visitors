/**
 * Unit Tests for LoginUseCase
 * Tests account lockout, bcrypt migration, and token generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoginUseCase } from '../../application/usecases/auth/Login.usecase';
import { JwtAuthService } from '../../infrastructure/services/JwtAuthService';
import UserModel from '../../models/User';
import config from '../../config/AppConfig';

// Mock UserModel
vi.mock('../../models/User', () => ({
    default: {
        findOne: vi.fn()
    }
}));

// Mock logActivity
vi.mock('../../models/ActivityLog', () => ({
    logActivity: vi.fn()
}));

describe('LoginUseCase - Account Lockout', () => {
    let loginUseCase: LoginUseCase;
    let authService: JwtAuthService;
    let mockUserRepository: any;

    beforeEach(() => {
        vi.clearAllMocks();
        authService = new JwtAuthService();
        mockUserRepository = {};
        loginUseCase = new LoginUseCase(mockUserRepository, authService);
    });

    describe('Account Lockout Detection', () => {
        it('should reject login if account is locked', async () => {
            const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('password123'),
                role: 'admin',
                loginAttempts: 5,
                lockedUntil: lockedUntil,
                mustChangePassword: false,
                update: vi.fn()
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            await expect(
                loginUseCase.execute({ username: 'testuser', password: 'password123' })
            ).rejects.toThrow('ACCOUNT_LOCKED');
        });

        it('should include minutes remaining in lockout error', async () => {
            const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('password123'),
                role: 'admin',
                loginAttempts: 5,
                lockedUntil: lockedUntil,
                mustChangePassword: false,
                update: vi.fn()
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            try {
                await loginUseCase.execute({ username: 'testuser', password: 'password123' });
            } catch (error: any) {
                expect(error.message).toBe('ACCOUNT_LOCKED');
                expect(error.minutesRemaining).toBeGreaterThan(0);
                expect(error.minutesRemaining).toBeLessThanOrEqual(10);
                expect(error.lockedUntil).toBeDefined();
            }
        });

        it('should allow login if lockout has expired', async () => {
            const lockedUntil = new Date(Date.now() - 1000); // 1 second ago
            const password = 'ValidP@ssw0rd123';
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword(password),
                role: 'admin',
                loginAttempts: 5,
                lockedUntil: lockedUntil,
                mustChangePassword: false,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            const result = await loginUseCase.execute({ username: 'testuser', password });

            expect(result).toBeDefined();
            expect(result.accessToken).toBeDefined();
            expect(mockUser.update).toHaveBeenCalledWith({
                loginAttempts: 0,
                lockedUntil: null
            });
        });
    });

    describe('Login Attempt Tracking', () => {
        it('should increment loginAttempts on failed login', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('correctpassword'),
                role: 'admin',
                loginAttempts: 2,
                lockedUntil: null,
                mustChangePassword: false,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            try {
                await loginUseCase.execute({ username: 'testuser', password: 'wrongpassword' });
            } catch (error) {
                expect(mockUser.update).toHaveBeenCalledWith({
                    loginAttempts: 3
                });
            }
        });

        it('should lock account after 5 failed attempts', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('correctpassword'),
                role: 'admin',
                loginAttempts: 4,
                lockedUntil: null,
                mustChangePassword: false,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            try {
                await loginUseCase.execute({ username: 'testuser', password: 'wrongpassword' });
            } catch (error: any) {
                expect(error.message).toBe('ACCOUNT_LOCKED');
                expect(mockUser.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        loginAttempts: 5,
                        lockedUntil: expect.any(Date)
                    })
                );
            }
        });

        it('should notify user of remaining attempts after 3rd failure', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword('correctpassword'),
                role: 'admin',
                loginAttempts: 2,
                lockedUntil: null,
                mustChangePassword: false,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            try {
                await loginUseCase.execute({ username: 'testuser', password: 'wrongpassword' });
            } catch (error: any) {
                expect(error.message).toBe('INVALID_CREDENTIALS');
                expect(error.attemptsRemaining).toBe(2); // 5 - 3 = 2
            }
        });

        it('should reset loginAttempts on successful login', async () => {
            const password = 'ValidP@ssw0rd123';
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword(password),
                role: 'admin',
                loginAttempts: 3,
                lockedUntil: null,
                mustChangePassword: false,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            await loginUseCase.execute({ username: 'testuser', password });

            expect(mockUser.update).toHaveBeenCalledWith({
                loginAttempts: 0,
                lockedUntil: null
            });
        });
    });

    describe('Token Generation', () => {
        it('should return both access and refresh tokens', async () => {
            const password = 'ValidP@ssw0rd123';
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword(password),
                role: 'admin',
                loginAttempts: 0,
                lockedUntil: null,
                mustChangePassword: false,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            const result = await loginUseCase.execute({ username: 'testuser', password });

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.accessToken).not.toBe(result.refreshToken);
        });

        it('should include user info in response', async () => {
            const password = 'ValidP@ssw0rd123';
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: await authService.hashPassword(password),
                role: 'admin',
                loginAttempts: 0,
                lockedUntil: null,
                mustChangePassword: false,
                update: vi.fn().mockResolvedValue(true)
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            const result = await loginUseCase.execute({ username: 'testuser', password });

            expect(result.user).toBeDefined();
            expect(result.user.username).toBe('testuser');
            expect(result.user.role).toBe('admin');
            expect(result.user.mustChangePassword).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should throw INVALID_CREDENTIALS for non-existent user', async () => {
            (UserModel.findOne as any).mockResolvedValue(null);

            await expect(
                loginUseCase.execute({ username: 'nonexistent', password: 'password' })
            ).rejects.toThrow('INVALID_CREDENTIALS');
        });

        it('should throw INVALID_CREDENTIALS for user without password', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                password: null,
                role: 'admin'
            };

            (UserModel.findOne as any).mockResolvedValue(mockUser);

            await expect(
                loginUseCase.execute({ username: 'testuser', password: 'password' })
            ).rejects.toThrow('INVALID_CREDENTIALS');
        });
    });
});
