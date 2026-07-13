/**
 * Refresh Token Use Case
 * Generates a new access token using a valid refresh token
 * Requirements: 3.6, 3.10
 */

import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuthService } from '../../../domain/services/IAuthService';

export interface RefreshTokenResult {
    accessToken: string;
}

export class RefreshTokenUseCase {
    constructor(
        private authService: IAuthService,
        private userRepository: IUserRepository
    ) { }

    async execute(refreshToken: string): Promise<RefreshTokenResult> {
        const payload = this.authService.verifyRefreshToken(refreshToken);

        if (!payload) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const user = await this.userRepository.findById(payload.id);

        if (!user) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const accessToken = this.authService.generateAccessToken(user);

        return {
            accessToken
        };
    }
}
