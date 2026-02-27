import { UserRole } from '../../domain/entities/User.entity';

export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthResponseDto {
  token: string;
  user: {
    username: string;
    role: UserRole;
  };
}
