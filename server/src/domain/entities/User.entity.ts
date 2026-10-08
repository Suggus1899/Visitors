export type UserRole = 'root' | 'admin' | 'operador' | 'auditor' | 'demo';

export interface UserEntity {
  id?: number;
  username: string;
  email?: string | null;
  tokenVersion?: number;
  password?: string; // Hashed
  role: UserRole;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  // Password policy fields
  mustChangePassword?: boolean;
  passwordChangedAt?: Date | null;
  // Account lockout fields
  loginAttempts?: number;
  lockedUntil?: Date | null;
}

export class User {
  constructor(
    public readonly username: string,
    public readonly role: UserRole,
    public readonly password?: string,
    public readonly id?: number,
    public readonly resetToken?: string | null,
    public readonly resetTokenExpiry?: Date | null,
    public readonly mustChangePassword?: boolean,
    public readonly passwordChangedAt?: Date | null,
    public readonly loginAttempts?: number,
    public readonly lockedUntil?: Date | null,
    public readonly email: string | null = null,
    public readonly tokenVersion: number = 0
  ) { }

  isAdmin(): boolean {
    return this.role === 'admin' || this.role === 'root';
  }

  // Factory
  static fromObject(obj: UserEntity): User {
    return new User(
      obj.username,
      obj.role,
      obj.password,
      obj.id,
      obj.resetToken,
      obj.resetTokenExpiry,
      obj.mustChangePassword,
      obj.passwordChangedAt,
      obj.loginAttempts,
      obj.lockedUntil,
      obj.email,
      obj.tokenVersion
    );
  }
}
