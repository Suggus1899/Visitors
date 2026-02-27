import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';

export class ResetPasswordUseCase {
    constructor(
        private userRepository: IUserRepository,
        private authService: IAuthService
    ) { }

    async execute(token: string, newPassword: string): Promise<void> {
        const user = await this.userRepository.findByResetToken(token);
        
        if (!user || !user.id || !user.resetTokenExpiry) {
            throw new Error('INVALID_TOKEN');
        }

        if (user.resetTokenExpiry < new Date()) {
            throw new Error('TOKEN_EXPIRED');
        }

        const hashedPassword = await this.authService.hashPassword(newPassword);
        
        await this.userRepository.updatePassword(user.id, hashedPassword);
        await this.userRepository.updateResetToken(user.id, null, null);
    }
}
