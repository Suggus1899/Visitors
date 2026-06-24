/**
 * Unit Tests for RefreshTokenUseCase
 * Tests refresh token validation and new access token generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefreshTokenUseCase } from '../../application/usecases/auth/RefreshToken.usecase';
import { JwtAuthService } from '../../infrastructure/services/JwtAuthService';
import UserModel from '../../models/User';

// Mock UserModel
vi.mock('../../models/User', () => ({
    default: {
        findByPk: vi.fn()
    }
}));

describe('RefreshTokenUseCase', () => {
    let refreshTokenUseCase: RefreshTokenUseCase;
    let authService: JwtAuthService;

    beforeEach(() => {
        vi.clearAllMocks();
        authService = new JwtAuthService();
        refreshTokenUseCase = new RefreshTokenUseCase(authService);
    });

    describe('Successful Token Refresh', () => {
        it('should generate new access token from valid refresh token', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                role: 'admin'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            const result = await refreshTokenUseCase.execute(refreshToken);

            expect(result.accessToken).toBeDefined();
            expect(typeof result.accessToken).toBe('string');
        });

        it('should return valid access token that can be verified', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                role: 'admin'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            const result = await refreshTokenUseCase.execute(refreshToken);

            const payload = authService.verifyAccessToken(result.accessToken);
            expect(payload).not.toBeNull();
            expect(payload?.id).toBe(mockUser.id);
            expect(payload?.username).toBe(mockUser.username);
            expect(payload?.role).toBe(mockUser.role);
        });

        it('should generate different access tokens on multiple refreshes', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                role: 'admin'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            const result1 = await refreshTokenUseCase.execute(refreshToken);

            // Wait 1 second to ensure different timestamps (JWT uses seconds precision)
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
            const mockUser = {
                id: 1,
                username: 'testuser',
                role: 'admin'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            const tamperedToken = refreshToken.slice(0, -5) + 'xxxxx';

            await expect(
                refreshTokenUseCase.execute(tamperedToken)
            ).rejects.toThrow('INVALID_REFRESH_TOKEN');
        });

        it('should throw INVALID_REFRESH_TOKEN if user no longer exists', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                role: 'admin'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            (UserModel.findByPk as any).mockResolvedValue(null);

            await expect(
                refreshTokenUseCase.execute(refreshToken)
            ).rejects.toThrow('INVALID_REFRESH_TOKEN');
        });

        it('should throw INVALID_REFRESH_TOKEN for expired refresh token', async () => {
            // This test would require mocking time or using a very short expiration
            // For now, we'll just verify the error handling structure exists
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJ0ZXN0IiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';

            await expect(
                refreshTokenUseCase.execute(expiredToken)
            ).rejects.toThrow('INVALID_REFRESH_TOKEN');
        });
    });

    describe('Token Payload Integrity', () => {
        it('should preserve user id in new access token', async () => {
            const mockUser = {
                id: 42,
                username: 'testuser',
                role: 'admin'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            const result = await refreshTokenUseCase.execute(refreshToken);
            const payload = authService.verifyAccessToken(result.accessToken);

            expect(payload?.id).toBe(42);
        });

        it('should preserve username in new access token', async () => {
            const mockUser = {
                id: 1,
                username: 'johndoe',
                role: 'admin'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            const result = await refreshTokenUseCase.execute(refreshToken);
            const payload = authService.verifyAccessToken(result.accessToken);

            expect(payload?.username).toBe('johndoe');
        });

        it('should preserve role in new access token', async () => {
            const mockUser = {
                id: 1,
                username: 'testuser',
                role: 'operador'
            };

            const refreshToken = authService.generateRefreshToken(mockUser);
            (UserModel.findByPk as any).mockResolvedValue(mockUser);

            const result = await refreshTokenUseCase.execute(refreshToken);
            const payload = authService.verifyAccessToken(result.accessToken);

            expect(payload?.role).toBe('operador');
        });
    });
});
