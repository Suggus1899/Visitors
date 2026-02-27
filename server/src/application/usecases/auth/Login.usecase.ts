import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';
import { LoginDto, AuthResponseDto } from '../../dto/AuthDto';

export class LoginUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService
  ) {}

  async execute(credentials: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByUsername(credentials.username);
    
    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.password) {
      // Should not happen for normal users
      throw new Error('INVALID_CREDENTIALS'); 
    }

    const isValid = await this.authService.verifyPassword(credentials.password, user.password);
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const token = this.authService.generateToken(user);

    return {
      token,
      user: {
        username: user.username,
        role: user.role
      }
    };
  }
}
