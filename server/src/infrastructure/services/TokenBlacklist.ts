/**
 * In-memory token blacklist for JWT revocation
 * Tracks invalidated tokens until their natural expiry
 * Requirements: T-05 — Token Revocation
 */

interface BlacklistEntry {
  token: string;
  expiresAt: number; // Unix timestamp (ms)
}

class TokenBlacklistService {
  private blacklist: Map<string, BlacklistEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Add a token to the blacklist
   * @param token - The JWT token string
   * @param expiresInMs - Milliseconds until the token naturally expires
   */
  add(token: string, expiresInMs: number = 7 * 24 * 60 * 60 * 1000): void {
    this.blacklist.set(token, {
      token,
      expiresAt: Date.now() + expiresInMs,
    });
  }

  /**
   * Check if a token is blacklisted
   */
  isBlacklisted(token: string): boolean {
    const entry = this.blacklist.get(token);
    if (!entry) return false;

    // If expired, remove and return false
    if (Date.now() > entry.expiresAt) {
      this.blacklist.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Invalidate all tokens for a specific user by storing user ID marker
   * This is checked separately via invalidateUserTokens / isUserInvalidated
   */
  private userInvalidations: Map<number, number> = new Map(); // userId -> timestamp

  invalidateUserTokens(userId: number): void {
    this.userInvalidations.set(userId, Date.now());
  }

  /**
   * Check if a token was issued before the user's last invalidation
   * @param userId - User ID
   * @param tokenIssuedAt - Token iat claim (seconds since epoch)
   */
  isTokenInvalidatedForUser(userId: number, tokenIssuedAt: number): boolean {
    const invalidatedAt = this.userInvalidations.get(userId);
    if (!invalidatedAt) return false;
    // tokenIssuedAt is in seconds, invalidatedAt in ms
    return (tokenIssuedAt * 1000) < invalidatedAt;
  }

  /**
   * Remove expired entries from the blacklist
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.blacklist) {
      if (now > entry.expiresAt) {
        this.blacklist.delete(key);
      }
    }
    // Clean user invalidations older than 7 days (max refresh token lifetime)
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    for (const [userId, timestamp] of this.userInvalidations) {
      if (now - timestamp > maxAge) {
        this.userInvalidations.delete(userId);
      }
    }
  }

  /**
   * Get blacklist stats (for monitoring)
   */
  getStats(): { tokenCount: number; userInvalidationCount: number } {
    return {
      tokenCount: this.blacklist.size,
      userInvalidationCount: this.userInvalidations.size,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.blacklist.clear();
    this.userInvalidations.clear();
  }
}

export const tokenBlacklist = new TokenBlacklistService();
