import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import config from '../../config/AppConfig';
import { IAuthService, TokenUser, TokenPayload, TokenPair } from '../../domain/services/IAuthService';
import { User } from '../../domain/entities/User.entity';

export class JwtAuthService implements IAuthService {
  /**
   * Generate access token (short-lived: 15 minutes)
   * Requirements: 3.1, 3.4
   */
  generateAccessToken(user: TokenUser): string {
    const payload: TokenPayload = {
      sub: user.id!,
      id: user.id!, // legacy compatibility
      username: user.username,
      email: user.email,
      tid: user.tenantId,
      tslug: user.tenantSlug,
      role: user.role
    };
    return jwt.sign(
      payload,
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpiration as jwt.SignOptions['expiresIn'] }
    );
  }

  /**
   * Generate refresh token (long-lived: 7 days)
   * Requirements: 3.1, 3.5
   */
  generateRefreshToken(user: TokenUser): string {
    // Refresh tokens intentionally carry no tenant context; tenant selection is revalidated.
    const payload: TokenPayload = {
      sub: user.id!,
      id: user.id!,
      username: user.username,
      email: user.email
    };
    return jwt.sign(
      payload,
      config.jwtRefreshSecret,
      { expiresIn: config.jwtRefreshExpiration as jwt.SignOptions['expiresIn'] }
    );
  }

  /**
   * Generate both access and refresh tokens
   * Requirements: 3.1
   */
  generateTokenPair(user: TokenUser): TokenPair {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user)
    };
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use generateAccessToken or generateTokenPair instead
   */
  generateToken(user: TokenUser): string {
    return this.generateAccessToken(user);
  }

  /**
   * Verify access token
   * Requirements: 3.1
   */
  verifyAccessToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify refresh token
   * Requirements: 3.1
   */
  verifyRefreshToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, config.jwtRefreshSecret) as unknown as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   * Requirements: 3.6
   */
  refreshAccessToken(refreshToken: string): string | null {
    const payload = this.verifyRefreshToken(refreshToken);
    if (!payload) {
      return null;
    }

    // Create new payload without exp/iat fields
    const newPayload: TokenPayload = {
      sub: payload.sub || payload.id,
      id: payload.id,
      username: payload.username,
      email: payload.email,
      tid: payload.tid,
      tslug: payload.tslug,
      role: payload.role
    };

    // Generate new access token with fresh expiration
    return jwt.sign(
      newPayload,
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpiration as jwt.SignOptions['expiresIn'] }
    );
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Hash password with configurable bcrypt rounds
   * Requirements: 8.1, 8.4
   */
  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, config.bcryptRounds);
  }

  /**
   * Generate secure password reset token (32 bytes)
   * Requirements: 11.3
   */
  generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash reset token with SHA-256
   * Requirements: 11.4
   */
  hashResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
