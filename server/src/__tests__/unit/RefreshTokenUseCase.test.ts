/**
 * Unit Tests for RefreshTokenUseCase
 * Tests refresh token validation and new access token generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefreshTokenUseCase } from '../../application/usecases/auth/RefreshToken.usecase';
import { JwtAuthService } from '../../infrastructure/services/JwtAuthService';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { ITenantUserRepository } from '../../domain/repositories/ITenantUserRepository';
import { User, UserRole } from '../../domain/entities/User.entity';

describe('RefreshTokenUseCase', () => {
    let refreshTokenUseCase: RefreshTokenUseCase;
    let authService: JwtAuthService;
    let userRepository: IUserRepository;
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
            updatePassword: vi.fn(),
            updatePasswordChange: vi.fn(),
            updateLoginAttempts: vi.fn(),
            updateResetToken: vi.fn()
        } as unknown as IUserRepository;
        tenantUserRepository = {
            findMembership: vi.fn(),
            findMembershipBySlug: vi.fn(),
            findByUserIdWithTenant: vi.fn().mockResolvedValue([]),
            create: vi.fn()
        } as unknown as ITenantUserRepository;
        refreshTokenUseCase = new RefreshTokenUseCase(authService, userRepository, tenantUserRepository);
    });

    const buildUser = (overrides: Partial<{
        id: number;
        username: string;
        role: UserRole;
    }> = {}): User => {
        return new User(
            overrides.username ?? 'testuser',
            overrides.role ?? 'admin',
            undefined,
            overrides.id ?? 1
        );
    };

    describe('Successful Token Refresh', () => {
        it('should generate new access token from valid refresh token', async () => {
            const mockUser = { id: 1, username: 'testuser', role: 'admin' };
            const refreshToken = authService.generateRefreshToken(mockUser);
            const user = buildUser(mockUser);

            (userRepository.findById as any).mockResolvedValue(user);

            const result = await refreshTokenUseCase.execute(refreshToken);

            expect(result.accessToken).toBeDefined();
            expect(typeof result.accessToken).toBe('string');
        });

        it('should return valid access token that can be verified', async () => {
            const mockUser = { id: 1, username: 'testuser', role: 'admin' };
            const refreshToken = authService.generateRefreshToken(mockUser);
            const user = buildUser(mockUser);

            (userRepository.findById as any).mockResolvedValue(user);

            const result = await refreshTokenUseCase.execute(refreshToken);

            const payload = authService.verifyAccessToken(result.accessToken);
            expect(payload).not.toBeNull();
            expect(payload?.id).toBe(mockUser.id);
            expect(payload?.username).toBe(mockUser.username);
            expect(payload?.role).toBe(mockUser.role);
        });

        it('should generate different access tokens on multiple refreshes', async () => {
            const mockUser = { id: 1, username: 'testuser', role: 'admin' };
            const refreshToken = authService.generateRefreshToken(mockUser);
            const user = buildUser(mockUser);

            (userRepository.findById as any).mockResolvedValue(user);

            const result1 = await refreshTokenUseCase.execute(refreshToken);

            await new Promise(resolve => setTimeout(resolve, 1100));

            const result2 = await refreshTokenUseCase.execute(refreshToken);

            expect(result1.accessToken).not.toBe(result2.accessToken);
        });
    });

    describe('Error Handling', () => {
        it('should throw INVALID_REFRESH_TOKEN for invalid refresh token', async () => {
            await expect(
                refreshTokenUseCase.execute('invalid.token.here')
            ).rejects.toThrow('INVALID_REFRESH_TOKEN');
        });

        it('should throw INVALID_REFRESH_TOKEN for tampered refresh token', async () => {
            const mockUser = { id: 1, username: 'testuser', role: 'admin' };
            const refreshToken = authService.generateRefreshToken(mockUser);
            const tamperedToken = refreshToken.slice(0, -5) + 'xxxxx';

            await expect(
                refreshTokenUseCase.execute(tamperedToken)
            ).rejects.toThrow('INVALID_REFRESH_TOKEN');
        });

        it('should throw INVALID_REFRESH_TOKEN if user no longer exists', async () => {
            const mockUser = { id: 1, username: 'testuser', role: 'admin' };
            const refreshToken = authService.generateRefreshToken(mockUser);

            (userRepository.findById as any).mockResolvedValue(null);

            await expect(
                refreshTokenUseCase.execute(refreshToken)
            ).rejects.toThrow('INVALID_REFRESH_TOKEN');
        });

        it('should throw INVALID_REFRESH_TOKEN for expired refresh token', async () => {
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJ0ZXN0IiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';

            await expect(
                refreshTokenUseCase.execute(expiredToken)
            ).rejects.toThrow('INVALID_REFRESH_TOKEN');
        });
    });

    describe('Token Payload Integrity', () => {
        it('should preserve user id in new access token', async () => {
            const mockUser = { id: 42, username: 'testuser', role: 'admin' };
            const refreshToken = authService.generateRefreshToken(mockUser);
            const user = buildUser(mockUser);

            (userRepository.findById as any).mockResolvedValue(user);

            const result = await refreshTokenUseCase.execute(refreshToken);
            const payload = authService.verifyAccessToken(result.accessToken);

            expect(payload?.id).toBe(42);
        });

        it('should preserve username in new access token', async () => {
            const mockUser = { id: 1, username: 'johndoe', role: 'admin' };
            const refreshToken = authService.generateRefreshToken(mockUser);
            const user = buildUser(mockUser);

            (userRepository.findById as any).mockResolvedValue(user);

            const result = await refreshTokenUseCase.execute(refreshToken);
            const payload = authService.verifyAccessToken(result.accessToken);

            expect(payload?.username).toBe('johndoe');
        });

        it('should preserve role in new access token', async () => {
            const mockUser = { id: 1, username: 'testuser', role: 'operador' };
            const refreshToken = authService.generateRefreshToken(mockUser);
            const user = buildUser(mockUser);

            (userRepository.findById as any).mockResolvedValue(user);

            const result = await refreshTokenUseCase.execute(refreshToken);
            const payload = authService.verifyAccessToken(result.accessToken);

            expect(payload?.role).toBe('operador');
        });
    });
});
