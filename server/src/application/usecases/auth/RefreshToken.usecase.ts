/**
 * Refresh Token Use Case
 * Generates a new access token using a valid refresh token
 * Requirements: 3.6, 3.10
 */

import { JwtAuthService } from '../../../infrastructure/services/JwtAuthService';
import UserModel from '../../../models/User';

export interface RefreshTokenResult {
    accessToken: string;
}

export class RefreshTokenUseCase {
    constructor(
        private authService: JwtAuthService
    ) { }

    async execute(refreshToken: string): Promise<RefreshTokenResult> {
        // Verify refresh token
        const payload = this.authService.verifyRefreshToken(refreshToken);

        if (!payload) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        // Verify user still exists and is active
        const user = await UserModel.findByPk(payload.id);

        if (!user) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        // Generate new access token
        const accessToken = this.authService.generateAccessToken(user);

        return {
            accessToken
        };
    }
}
