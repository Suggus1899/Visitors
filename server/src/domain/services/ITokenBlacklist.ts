export interface ITokenBlacklist {
  add(token: string, expiresInMs?: number): void;
  isBlacklisted(token: string): boolean;
  invalidateUserTokens(userId: number): void;
  isTokenInvalidatedForUser(userId: number, tokenIssuedAt: number): boolean;
  getStats(): { tokenCount: number; userInvalidationCount: number };
  destroy(): void;
}
