import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';

export interface ResetPasswordDto {
  userId: number;
  newPassword: string;
}

export class ResetUserPasswordUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService
  ) {}

  async execute(data: ResetPasswordDto): Promise<void> {
    // Find user to ensure they exist
    const user = await this.userRepository.findById(data.userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Hash the new password
    const hashedPassword = await this.authService.hashPassword(data.newPassword);

    // Update password and reset security fields
    await this.userRepository.updatePassword(data.userId, hashedPassword);

    // Note: We should also reset mustChangePassword, loginAttempts, lockedUntil
    // but those would need to be handled via the save method or additional repository methods
  }
}
