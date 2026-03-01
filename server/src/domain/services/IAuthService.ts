import { User } from '../entities/User.entity';

// Interface for user-like objects that can be used for token generation
export interface TokenUser {
  id?: number;
  username: string;
  role: string;
}

export interface IAuthService {
  generateToken(user: TokenUser): string;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  generateResetToken(): string;
}
