import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IAuditLogRepository } from '../../../../audit/domain/repositories/IAuditLogRepository';
import { ITenantUserRepository, TenantMembershipWithTenant } from '../../../domain/repositories/ITenantUserRepository';
import { IAuthService, TokenUser } from '../../../domain/services/IAuthService';
import { LoginDto, AuthResponseDto, TenantSummaryDto } from '../../dto/AuthDto';
import { TenantEntity } from '../../../domain/entities/Tenant.entity';
import config from '../../../../config/AppConfig';
import bcrypt from 'bcryptjs';
import logger from '../../../../config/logger';

/**
 * Returns true when the tenant is usable for login (not suspended and, for demo
 * tenants, the demo window has not expired).
 */
export const isTenantAccessible = (tenant: TenantEntity): boolean => {
  if (tenant.status === 'suspended') return false;
  if (tenant.isDemo && tenant.demoExpiresAt && tenant.demoExpiresAt < new Date()) return false;
  return true;
};

export class LoginUseCase {
  constructor(
    private userRepository: IUserRepository,
    private authService: IAuthService,
    private auditLogRepository: IAuditLogRepository,
    private tenantUserRepository: ITenantUserRepository
  ) { }

  async execute(credentials: LoginDto): Promise<AuthResponseDto> {
    const user = await this.findUserByIdentifier(credentials.username);

    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.password) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      const error: any = new Error('ACCOUNT_LOCKED');
      error.minutesRemaining = minutesRemaining;
      error.lockedUntil = user.lockedUntil;
      throw error;
    }

    const isValid = await this.authService.verifyPassword(credentials.password, user.password);

    if (!isValid) {
      const newAttempts = (user.loginAttempts || 0) + 1;

      if (newAttempts >= config.maxLoginAttempts) {
        const lockoutDuration = config.lockoutDurationMinutes * 60 * 1000;
        const lockedUntil = new Date(Date.now() + lockoutDuration);

        await this.userRepository.updateLoginAttempts(user.id!, newAttempts, lockedUntil);

        try {
          await this.auditLogRepository.log({
            tenantId: 0,
            userId: user.id!,
            username: user.username,
            action: 'ACCOUNT_LOCKED',
            entity: 'User',
            entityId: user.id!.toString(),
            details: `Account locked after ${newAttempts} failed login attempts`
          });
        } catch (error) {
          logger.error('Failed to log account lockout:', error);
        }

        const error: any = new Error('ACCOUNT_LOCKED');
        error.minutesRemaining = config.lockoutDurationMinutes;
        error.lockedUntil = lockedUntil;
        throw error;
      } else {
        await this.userRepository.updateLoginAttempts(user.id!, newAttempts, user.lockedUntil || null);

        if (newAttempts >= 3) {
          const attemptsRemaining = config.maxLoginAttempts - newAttempts;
          const error: any = new Error('INVALID_CREDENTIALS');
          error.attemptsRemaining = attemptsRemaining;
          throw error;
        }
      }

      throw new Error('INVALID_CREDENTIALS');
    }

    await this.userRepository.updateLoginAttempts(user.id!, 0, null);

    try {
      const currentRounds = bcrypt.getRounds(user.password);
      if (currentRounds < config.bcryptRounds) {
        logger.info(`Re-hashing password for user ${user.username} (${currentRounds} -> ${config.bcryptRounds} rounds)`);
        const newHash = await this.authService.hashPassword(credentials.password);
        await this.userRepository.updatePassword(user.id!, newHash);
      }
    } catch (error) {
      logger.error('Failed to check/update bcrypt rounds:', error);
    }

    // Resolve tenant memberships to decide token context.
    const memberships = await this.tenantUserRepository.findByUserIdWithTenant(user.id!);
    const accessibleMemberships = memberships.filter(m => isTenantAccessible(m.tenant));

    const refreshToken = this.authService.generateRefreshToken(this.toTokenUser(user, undefined, undefined, undefined));

    let accessToken: string;
    let responseRole: AuthResponseDto['user']['role'];
    let tenants: TenantSummaryDto[] | undefined;
    let requiresTenantSelection = false;

    if (accessibleMemberships.length === 1) {
      const membership = accessibleMemberships[0];
      accessToken = this.authService.generateAccessToken(
        this.toTokenUser(user, membership.tenant.id!, membership.tenant.slug, membership.role)
      );
      responseRole = membership.role;
    } else if (accessibleMemberships.length > 1) {
      // Multiple tenants: issue a tenant-agnostic token so the frontend can
      // call /auth/select-tenant to pick the working context.
      accessToken = this.authService.generateAccessToken(this.toTokenUser(user, 0, '', undefined));
      responseRole = user.role;
      tenants = accessibleMemberships.map(m => this.toTenantSummary(m));
      requiresTenantSelection = true;
    } else {
      // No accessible memberships. Super admins get a root token; regular users
      // get a tenant-agnostic token with their legacy role (effectively unusable
      // for tenant-scoped operations until they are granted a membership).
      const role = user.isSuperAdmin ? 'root' : user.role;
      accessToken = this.authService.generateAccessToken(this.toTokenUser(user, 0, '', role));
      responseRole = role;
    }

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: responseRole,
        email: user.email,
        mustChangePassword: user.mustChangePassword || false
      },
      tenants,
      requiresTenantSelection
    };
  }

  /**
   * Resolve a login identifier to a user. Accepts either a username or an email
   * address (detected via the presence of `@`).
   */
  private async findUserByIdentifier(identifier: string) {
    if (identifier.includes('@')) {
      const byEmail = await this.userRepository.findByEmail(identifier);
      if (byEmail) return byEmail;
      // Fall back to username lookup in case a username legitimately contains `@`.
      return this.userRepository.findByUsername(identifier);
    }
    const byUsername = await this.userRepository.findByUsername(identifier);
    if (byUsername) return byUsername;
    return this.userRepository.findByEmail(identifier);
  }

  private toTokenUser(
    user: { id?: number; username: string; email?: string | null },
    tenantId: number | undefined,
    tenantSlug: string | undefined,
    role: TokenUser['role']
  ): TokenUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      tenantId,
      tenantSlug,
      role
    };
  }

  private toTenantSummary(membership: TenantMembershipWithTenant): TenantSummaryDto {
    return {
      id: membership.tenant.id!,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      role: membership.role,
      status: membership.tenant.status || 'active',
      isDemo: !!membership.tenant.isDemo,
      plan: membership.tenant.subscriptionPlan || 'free',
      subscriptionExpiresAt: membership.tenant.subscriptionExpiresAt || null
    };
  }
}
