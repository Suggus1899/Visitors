import { User } from '../entities/User.entity';

export interface IUserRepository {
  findAll(): Promise<User[]>;
  findByUsername(username: string): Promise<User | null>;
  findById(id: number): Promise<User | null>;
  findByResetToken(token: string): Promise<User | null>;
  save(user: User): Promise<User>;
  delete(id: number): Promise<void>;
  updatePassword(id: number, hashedPassword: string): Promise<void>;
  updateResetToken(id: number, token: string | null, expiry: Date | null): Promise<void>;
}
