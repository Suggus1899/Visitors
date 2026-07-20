/**
 * Unit Tests for JwtAuthService
 * Tests token generation, verification, and password hashing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JwtAuthService } from '../../infrastructure/services/JwtAuthService';
import jwt from 'jsonwebtoken';
import config from '../../config/AppConfig';

describe('JwtAuthService', () => {
    let authService: JwtAuthService;
    const mockUser = {
        id: 1,
        username: 'testuser',
        role: 'admin'
    };

    beforeEach(() => {
        authService = new JwtAuthService();
    });

    describe('Token Generation', () => {
        it('should generate access token with correct payload', () => {
            const token = authService.generateAccessToken(mockUser);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');

            const decoded = jwt.verify(token, config.jwtSecret) as any;
            expect(decoded.id).toBe(mockUser.id);
            expect(decoded.username).toBe(mockUser.username);
            expect(decoded.role).toBe(mockUser.role);
        });

        it('should generate refresh token with correct payload', () => {
            const token = authService.generateRefreshToken(mockUser);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');

            const decoded = jwt.verify(token, config.jwtRefreshSecret) as any;
            expect(decoded.id).toBe(mockUser.id);
            expect(decoded.username).toBe(mockUser.username);
            // Refresh tokens intentionally carry no role/tenant context
            expect(decoded.role).toBeUndefined();
        });

        it('should generate token pair with both tokens', () => {
            const tokenPair = authService.generateTokenPair(mockUser);
            expect(tokenPair.accessToken).toBeDefined();
            expect(tokenPair.refreshToken).toBeDefined();
            expect(tokenPair.accessToken).not.toBe(tokenPair.refreshToken);
        });

        it('should generate different tokens for different users', () => {
            const user1Token = authService.generateAccessToken(mockUser);
            const user2Token = authService.generateAccessToken({ ...mockUser, id: 2 });
            expect(user1Token).not.toBe(user2Token);
        });
    });

    describe('Token Verification', () => {
        it('should verify valid access token', () => {
            const token = authService.generateAccessToken(mockUser);
            const payload = authService.verifyAccessToken(token);

            expect(payload).not.toBeNull();
            expect(payload?.id).toBe(mockUser.id);
            expect(payload?.username).toBe(mockUser.username);
            expect(payload?.role).toBe(mockUser.role);
        });

        it('should verify valid refresh token', () => {
            const token = authService.generateRefreshToken(mockUser);
            const payload = authService.verifyRefreshToken(token);

            expect(payload).not.toBeNull();
            expect(payload?.id).toBe(mockUser.id);
        });

        it('should return null for invalid token', () => {
            const payload = authService.verifyAccessToken('invalid.token.here');
            expect(payload).toBeNull();
        });

        it('should return null for tampered token', () => {
            const token = authService.generateAccessToken(mockUser);
            const tamperedToken = token.slice(0, -5) + 'xxxxx';
            const payload = authService.verifyAccessToken(tamperedToken);
            expect(payload).toBeNull();
        });
    });

    describe('Token Refresh', () => {
        it('should generate new access token from valid refresh token', () => {
            const refreshToken = authService.generateRefreshToken(mockUser);
            const newAccessToken = authService.refreshAccessToken(refreshToken);

            expect(newAccessToken).not.toBeNull();
            expect(typeof newAccessToken).toBe('string');

            const payload = authService.verifyAccessToken(newAccessToken!);
            expect(payload?.id).toBe(mockUser.id);
        });

        it('should return null for invalid refresh token', () => {
            const newAccessToken = authService.refreshAccessToken('invalid.token');
            expect(newAccessToken).toBeNull();
        });
    });

    describe('Password Hashing', () => {
        it('should hash password with bcrypt', async () => {
            const password = 'MySecureP@ssw0rd123';
            const hash = await authService.hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.startsWith('$2')).toBe(true); // bcrypt hash prefix
        });

        it('should generate different hashes for same password', async () => {
            const password = 'MySecureP@ssw0rd123';
            const hash1 = await authService.hashPassword(password);
            const hash2 = await authService.hashPassword(password);

            expect(hash1).not.toBe(hash2); // bcrypt uses salt
        });

        it('should use configured bcrypt rounds', async () => {
            const password = 'MySecureP@ssw0rd123';
            const hash = await authService.hashPassword(password);

            const bcrypt = require('bcryptjs');
            const rounds = bcrypt.getRounds(hash);
            expect(rounds).toBe(config.bcryptRounds);
        });
    });

    describe('Password Verification', () => {
        it('should verify correct password', async () => {
            const password = 'MySecureP@ssw0rd123';
            const hash = await authService.hashPassword(password);
            const isValid = await authService.verifyPassword(password, hash);

            expect(isValid).toBe(true);
        });

        it('should reject incorrect password', async () => {
            const password = 'MySecureP@ssw0rd123';
            const hash = await authService.hashPassword(password);
            const isValid = await authService.verifyPassword('WrongPassword123!', hash);

            expect(isValid).toBe(false);
        });

        it('should be case-sensitive', async () => {
            const password = 'MySecureP@ssw0rd123';
            const hash = await authService.hashPassword(password);
            const isValid = await authService.verifyPassword('mysecurep@ssw0rd123', hash);

            expect(isValid).toBe(false);
        });
    });

    describe('Reset Token Generation', () => {
        it('should generate reset token', () => {
            const token = authService.generateResetToken();
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.length).toBe(64); // 32 bytes = 64 hex characters
        });

        it('should generate unique tokens', () => {
            const token1 = authService.generateResetToken();
            const token2 = authService.generateResetToken();
            expect(token1).not.toBe(token2);
        });

        it('should generate hex string', () => {
            const token = authService.generateResetToken();
            expect(/^[0-9a-f]+$/.test(token)).toBe(true);
        });
    });

    describe('Reset Token Hashing', () => {
        it('should hash reset token with SHA-256', () => {
            const token = authService.generateResetToken();
            const hash = authService.hashResetToken(token);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(token);
            expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
        });

        it('should produce consistent hash for same token', () => {
            const token = 'test-token-123';
            const hash1 = authService.hashResetToken(token);
            const hash2 = authService.hashResetToken(token);

            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different tokens', () => {
            const hash1 = authService.hashResetToken('token1');
            const hash2 = authService.hashResetToken('token2');

            expect(hash1).not.toBe(hash2);
        });
    });
});
