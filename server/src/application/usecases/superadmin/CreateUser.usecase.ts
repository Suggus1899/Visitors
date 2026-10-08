import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { User, UserRole } from '../../../domain/entities/User.entity';

export interface CreateUserDto {
  username: string;
  password: string;
  role: UserRole;
}

export class CreateUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService
  ) {}

  async execute(data: CreateUserDto): Promise<User> {
    // Check if username already exists
    const existingUser = await this.userRepository.findByUsername(data.username);
    if (existingUser) {
      throw new Error('USERNAME_EXISTS');
    }

    // Hash password
    const hashedPassword = await this.authService.hashPassword(data.password);

    // Create user entity
    const user = new User(
      data.username,
      data.role,
      hashedPassword,
      undefined,
      undefined,
      undefined,
      true // mustChangePassword
    );

    // Save to repository (save handles both create and update)
    const createdUser = await this.userRepository.save(user);
    
    return createdUser;
  }
}
