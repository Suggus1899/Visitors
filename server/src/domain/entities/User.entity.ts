export type UserRole = 'admin' | 'guard';

export interface UserEntity {
  id?: number;
  username: string;
  password?: string; // Hashed
  role: UserRole;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
}

export class User {
  constructor(
    public readonly username: string,
    public readonly role: UserRole,
    public readonly password?: string,
    public readonly id?: number,
    public readonly resetToken?: string | null,
    public readonly resetTokenExpiry?: Date | null
  ) {}

  isAdmin(): boolean {
    return this.role === 'admin';
  }

  // Factory
  static fromObject(obj: UserEntity): User {
    return new User(
      obj.username,
      obj.role,
      obj.password,
      obj.id,
      obj.resetToken,
      obj.resetTokenExpiry
    );
  }
}
