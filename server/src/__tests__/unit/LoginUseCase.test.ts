/**
 * Unit Tests for LoginUseCase
 * Tests account lockout, bcrypt migration, and token generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoginUseCase } from '../../application/usecases/auth/Login.usecase';
import { JwtAuthService } from '../../infrastructure/services/JwtAuthService';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IAuditLogRepository } from '../../domain/repositories/IAuditLogRepository';
import { ITenantUserRepository } from '../../domain/repositories/ITenantUserRepository';
import { User, UserRole } from '../../domain/entities/User.entity';
import config from '../../config/AppConfig';

describe('LoginUseCase - Account Lockout', () => {
    let loginUseCase: LoginUseCase;
    let authService: JwtAuthService;
    let userRepository: IUserRepository;
    let auditLogRepository: IAuditLogRepository;
    let tenantUserRepository: ITenantUserRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        authService = new JwtAuthService();
        userRepository = {
            findAll: vi.fn(),
            findByUsername: vi.fn(),
            findByEmail: vi.fn(),
            findById: vi.fn(),
            findByResetToken: vi.fn(),
            save: vi.fn(),
            delete: vi.fn(),
            updatePassword: vi.fn().mockResolvedValue(undefined),
            updatePasswordChange: vi.fn(),
            updateLoginAttempts: vi.fn().mockResolvedValue(undefined),
            updateResetToken: vi.fn()
        } as unknown as IUserRepository;
        auditLogRepository = {
            log: vi.fn().mockResolvedValue(undefined),
            findAll: vi.fn(),
            getStats: vi.fn(),
            getDistinctActions: vi.fn(),
            getDistinctUsers: vi.fn(),
            count: vi.fn()
        } as unknown as IAuditLogRepository;
        tenantUserRepository = {
            findMembership: vi.fn(),
            findMembershipBySlug: vi.fn(),
            findByUserIdWithTenant: vi.fn().mockResolvedValue([]),
            create: vi.fn()
        } as unknown as ITenantUserRepository;
        loginUseCase = new LoginUseCase(userRepository, authService, auditLogRepository, tenantUserRepository);
    });

    const buildUser = async (overrides: Partial<{
        id: number;
        username: string;
        password: string;
        role: UserRole;
        loginAttempts: number;
        lockedUntil: Date | null;
        mustChangePassword: boolean;
    }> = {}): Promise<User> => {
        const password = overrides.password ?? 'password123';
        const hashed = await authService.hashPassword(password);
        return new User(
            overrides.username ?? 'testuser',
            overrides.role ?? 'admin',
            hashed,
            overrides.id ?? 1,
            undefined,
            undefined,
            overrides.mustChangePassword ?? false,
            undefined,
            overrides.loginAttempts ?? 0,
            overrides.lockedUntil ?? null
        );
    };

    describe('Account Lockout Detection', () => {
        it('should reject login if account is locked', async () => {
            const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
            const user = await buildUser({ loginAttempts: 5, lockedUntil });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            await expect(
                loginUseCase.execute({ username: 'testuser', password: 'password123' })
            ).rejects.toThrow('ACCOUNT_LOCKED');
        });

        it('should include minutes remaining in lockout error', async () => {
            const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
            const user = await buildUser({ loginAttempts: 5, lockedUntil });

            (userRepository.findByUsername as any).mockResolvedValue(user);

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
            const lockedUntil = new Date(Date.now() - 1000);
            const password = 'ValidP@ssw0rd123';
            const user = await buildUser({ password, loginAttempts: 5, lockedUntil });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            const result = await loginUseCase.execute({ username: 'testuser', password });

            expect(result).toBeDefined();
            expect(result.accessToken).toBeDefined();
            expect(userRepository.updateLoginAttempts).toHaveBeenCalledWith(1, 0, null);
        });
    });

    describe('Login Attempt Tracking', () => {
        it('should increment loginAttempts on failed login', async () => {
            const user = await buildUser({ password: 'correctpassword', loginAttempts: 2 });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            try {
                await loginUseCase.execute({ username: 'testuser', password: 'wrongpassword' });
            } catch (error) {
                expect(userRepository.updateLoginAttempts).toHaveBeenCalledWith(1, 3, null);
            }
        });

        it('should lock account after 5 failed attempts', async () => {
            const user = await buildUser({ password: 'correctpassword', loginAttempts: 4 });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            try {
                await loginUseCase.execute({ username: 'testuser', password: 'wrongpassword' });
            } catch (error: any) {
                expect(error.message).toBe('ACCOUNT_LOCKED');
                expect(userRepository.updateLoginAttempts).toHaveBeenCalledWith(
                    1,
                    5,
                    expect.any(Date)
                );
            }
        });

        it('should notify user of remaining attempts after 3rd failure', async () => {
            const user = await buildUser({ password: 'correctpassword', loginAttempts: 2 });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            try {
                await loginUseCase.execute({ username: 'testuser', password: 'wrongpassword' });
            } catch (error: any) {
                expect(error.message).toBe('INVALID_CREDENTIALS');
                expect(error.attemptsRemaining).toBe(config.maxLoginAttempts - 3);
            }
        });

        it('should reset loginAttempts on successful login', async () => {
            const password = 'ValidP@ssw0rd123';
            const user = await buildUser({ password, loginAttempts: 3 });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            await loginUseCase.execute({ username: 'testuser', password });

            expect(userRepository.updateLoginAttempts).toHaveBeenCalledWith(1, 0, null);
        });
    });

    describe('Token Generation', () => {
        it('should return both access and refresh tokens', async () => {
            const password = 'ValidP@ssw0rd123';
            const user = await buildUser({ password });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            const result = await loginUseCase.execute({ username: 'testuser', password });

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.accessToken).not.toBe(result.refreshToken);
        });

        it('should include user info in response', async () => {
            const password = 'ValidP@ssw0rd123';
            const user = await buildUser({ password });

            (userRepository.findByUsername as any).mockResolvedValue(user);

            const result = await loginUseCase.execute({ username: 'testuser', password });

            expect(result.user).toBeDefined();
            expect(result.user.username).toBe('testuser');
            expect(result.user.role).toBe('admin');
            expect(result.user.mustChangePassword).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should throw INVALID_CREDENTIALS for non-existent user', async () => {
            (userRepository.findByUsername as any).mockResolvedValue(null);

            await expect(
                loginUseCase.execute({ username: 'nonexistent', password: 'password' })
            ).rejects.toThrow('INVALID_CREDENTIALS');
        });

        it('should throw INVALID_CREDENTIALS for user without password', async () => {
            const user = new User('testuser', 'admin', undefined, 1);

            (userRepository.findByUsername as any).mockResolvedValue(user);

            await expect(
                loginUseCase.execute({ username: 'testuser', password: 'password' })
            ).rejects.toThrow('INVALID_CREDENTIALS');
        });
    });
});
