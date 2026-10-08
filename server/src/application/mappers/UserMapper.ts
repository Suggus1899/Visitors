import { User, UserRole } from '../../domain/entities/User.entity';

export interface UserDto {
  id?: number;
  username: string;
  email: string | null;
  role: UserRole;
  mustChangePassword?: boolean;
}

export interface UserListDto extends UserDto {
  loginAttempts?: number;
  lockedUntil?: Date | null;
}

export class UserMapper {
  static toUserDto(user: User): UserDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  static toUserListDto(user: User): UserListDto {
    return {
      ...UserMapper.toUserDto(user),
      loginAttempts: user.loginAttempts,
      lockedUntil: user.lockedUntil,
    };
  }
}
