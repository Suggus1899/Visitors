import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';

export class ForgotPasswordUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService
  ) {}

  async execute(username: string): Promise<string> {
    const user = await this.userRepository.findByUsername(username);
    
    if (!user || !user.id) {
      // Generic error to avoid user enumeration?
      // Or explicit for now as per legacy controller
      throw new Error('USER_NOT_FOUND');
    }

    const token = this.authService.generateResetToken();
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    await this.userRepository.updateResetToken(user.id, token, expiry);

    // In a real system, send email here. 
    // For now, return token to console/response (as per requirements/legacy behavior for demo/local)
    console.log(`[EMAIL SIMULATION] Password Reset for ${username}. Token: ${token}`);
    
    return token;
  }
}
