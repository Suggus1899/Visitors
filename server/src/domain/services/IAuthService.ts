import { User } from '../entities/User.entity';

export interface IAuthService {
  generateToken(user: User): string;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  generateResetToken(): string;
}
