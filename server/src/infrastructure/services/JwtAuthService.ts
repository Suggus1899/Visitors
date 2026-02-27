import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import config from '../../config/AppConfig';
import { IAuthService } from '../../domain/services/IAuthService';
import { User } from '../../domain/entities/User.entity';

export class JwtAuthService implements IAuthService {
  generateToken(user: User): string {
    const payload: object = {
      id: user.id!,
      username: user.username,
      role: user.role
    };
    return jwt.sign(
      payload,
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpiration as jwt.SignOptions['expiresIn'] }
    );
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 8);
  }

  generateResetToken(): string {
    return crypto.randomBytes(20).toString('hex');
  }
}
