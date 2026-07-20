import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User, UserRole } from '../../../domain/entities/User.entity';

export interface UpdateUserDto {
  id: number;
  username?: string;
  role?: UserRole;
}

export class UpdateUserUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(data: UpdateUserDto): Promise<User> {
    // Find existing user
    const existingUser = await this.userRepository.findById(data.id);
    if (!existingUser) {
      throw new Error('USER_NOT_FOUND');
    }

    // Check if new username already exists (if username is being changed)
    if (data.username && data.username !== existingUser.username) {
      const userWithSameName = await this.userRepository.findByUsername(data.username);
      if (userWithSameName) {
        throw new Error('USERNAME_EXISTS');
      }
    }

    // Create updated user entity (preserve existing values if not provided)
    const updatedUser = new User(
      data.username || existingUser.username,
      data.role || existingUser.role,
      existingUser.password,
      existingUser.id,
      existingUser.resetToken,
      existingUser.resetTokenExpiry,
      existingUser.mustChangePassword,
      existingUser.passwordChangedAt,
      existingUser.loginAttempts,
      existingUser.lockedUntil
    );

    // Save to repository
    const savedUser = await this.userRepository.save(updatedUser);
    
    return savedUser;
  }
}
