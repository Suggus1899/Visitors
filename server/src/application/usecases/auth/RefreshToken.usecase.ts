/**
 * Refresh Token Use Case
 * Generates a new access token using a valid refresh token.
 * When `tenantSlug` is provided, the new access token is scoped to that tenant
 * (membership and tenant availability are revalidated). When omitted, the
 * access token is issued without tenant context (tenant-agnostic).
 * Requirements: 3.6, 3.10
 */

import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { ITenantUserRepository } from '../../../domain/repositories/ITenantUserRepository';
import { IAuthService, TokenUser } from '../../../domain/services/IAuthService';
import { RefreshTokenResult } from '../../dto/AuthDto';
import { isTenantAccessible } from './Login.usecase';

export class RefreshTokenUseCase {
    constructor(
        private authService: IAuthService,
        private userRepository: IUserRepository,
        private tenantUserRepository: ITenantUserRepository
    ) { }

    async execute(refreshToken: string, tenantSlug?: string): Promise<RefreshTokenResult> {
        const payload = this.authService.verifyRefreshToken(refreshToken);

        if (!payload) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const user = await this.userRepository.findById(payload.id);

        if (!user) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const tokenUser: TokenUser = {
            id: user.id,
            username: user.username,
            email: user.email,
            tenantId: 0,
            tenantSlug: ''
        };

        if (tenantSlug) {
            const membership = await this.tenantUserRepository.findMembershipBySlug(user.id!, tenantSlug);
            if (!membership) {
                throw new Error('TENANT_MEMBERSHIP_REQUIRED');
            }
            // Revalidate tenant availability (not suspended / demo not expired).
            const memberships = await this.tenantUserRepository.findByUserIdWithTenant(user.id!);
            const match = memberships.find(m => m.tenant.slug === tenantSlug);
            if (!match || !isTenantAccessible(match.tenant)) {
                throw new Error('TENANT_UNAVAILABLE');
            }
            tokenUser.tenantId = match.tenant.id;
            tokenUser.tenantSlug = match.tenant.slug;
            tokenUser.role = membership.role;
        } else {
            // Tenant-agnostic token (for tenant selection flows).
            tokenUser.role = user.isSuperAdmin ? 'root' : user.role;
        }

        const accessToken = this.authService.generateAccessToken(tokenUser);

        return { accessToken };
    }
}
