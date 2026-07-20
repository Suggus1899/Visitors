import { UserRole } from '../entities/User.entity';

export interface TokenUser {
  id?: number;
  username: string;
  role?: UserRole;
  email?: string | null;
  tenantId?: number;
  tenantSlug?: string;
}

export interface TokenPayload {
  /** JWT standard subject: user id. `id` remains for legacy middleware. */
  sub: number;
  id: number;
  username: string;
  email?: string | null;
  tid?: number;
  tslug?: string;
  role?: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface IAuthService {
  generateAccessToken(user: TokenUser): string;
  generateRefreshToken(user: TokenUser): string;
  generateTokenPair(user: TokenUser): TokenPair;
  generateToken(user: TokenUser): string;
  verifyAccessToken(token: string): TokenPayload | null;
  verifyRefreshToken(token: string): TokenPayload | null;
  refreshAccessToken(refreshToken: string): string | null;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  generateResetToken(): string;
  hashResetToken(token: string): string;
}
