import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { passwordPolicy } from '../../../domain/services/PasswordPolicy';
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

    const validation = passwordPolicy.validate(data.newPassword);
    if (!validation.isValid) throw new Error('PASSWORD_POLICY_VIOLATION');

    // Hash the new password
    const hashedPassword = await this.authService.hashPassword(data.newPassword);

    // Update password and reset security fields
    await this.userRepository.updatePasswordChange(data.userId, hashedPassword, true, new Date());

  }
}
