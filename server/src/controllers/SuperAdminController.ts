import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import logger from '../config/logger';
import { CreateUserUseCase, CreateUserDto } from '../application/usecases/superadmin/CreateUser.usecase';
import { UpdateUserUseCase, UpdateUserDto } from '../application/usecases/superadmin/UpdateUser.usecase';
import { DeleteUserUseCase } from '../application/usecases/superadmin/DeleteUser.usecase';
import { ListUsersUseCase } from '../application/usecases/superadmin/ListUsers.usecase';
import { ResetUserPasswordUseCase, ResetPasswordDto } from '../application/usecases/superadmin/ResetUserPassword.usecase';
import { GetAuditLogsUseCase, AuditLogFilters } from '../application/usecases/superadmin/GetAuditLogs.usecase';
import { User } from '../domain/entities/User.entity';
import { UserMapper } from '../application/mappers/UserMapper';
import { getClientInfo } from '../middleware/ipCapture';

const getActor = (req: Request) => {
  return { id: req.user?.id ?? 0, username: req.user?.username ?? 'system' };
};

export class SuperAdminController {
  /**
    * GET /api/v1/root/users
   * List all users
   */
  async listUsers(req: Request, res: Response) {
    try {
      const useCase = new ListUsersUseCase(container.userRepository);
      const users = await useCase.execute();

      // Remove password from response
      const sanitizedUsers = users.map((user: User) => UserMapper.toUserListDto(user));

      res.json(ResponseBuilder.success(sanitizedUsers));
    } catch (error) {
      logger.error('List users error:', error);
      res.status(500).json(ResponseBuilder.error('LIST_USERS_FAILED', 'Failed to list users'));
    }
  }

  /**
   * POST /api/v1/root/users
   * Create a new user
   */
  async createUser(req: Request, res: Response) {
    try {
      const data: CreateUserDto = {
        username: req.body.username as string,
        password: req.body.password as string,
        role: req.body.role as any
      };

      // Validate required fields
      if (!data.username || !data.password || !data.role) {
        return res.status(400).json(ResponseBuilder.error('MISSING_FIELDS', 'Username, password, and role are required'));
      }

      const useCase = new CreateUserUseCase(container.userRepository, container.authService);
      const user = await useCase.execute(data);

      // C-07: Audit log for user creation
      const actor = getActor(req);
      const clientInfo = getClientInfo(req);
      await container.auditLogRepository.log({
        userId: actor.id, username: actor.username, action: 'SUPERADMIN_CREATE_USER', entity: 'User', entityId: String(user.id),
        details: `Created user: ${user.username} (role: ${user.role})`, ipAddress: clientInfo.ip, userAgent: clientInfo.userAgent
      });

      res.status(201).json(ResponseBuilder.success(UserMapper.toUserDto(user)));
    } catch (error: any) {
      logger.error('Create user error:', error);
      if (error.message === 'USERNAME_EXISTS') {
        return res.status(409).json(ResponseBuilder.error('USERNAME_EXISTS', 'Username already exists'));
      }
      res.status(500).json(ResponseBuilder.error('CREATE_USER_FAILED', 'Failed to create user'));
    }
  }

  /**
    * PUT /api/v1/root/users/:id
   * Update a user
   */
  async updateUser(req: Request, res: Response) {
    try {
      const userId = parseInt(req.params.id as string);
      if (isNaN(userId)) {
        return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
      }

      const data: UpdateUserDto = {
        id: userId,
        username: req.body.username as string | undefined,
        role: req.body.role as any
      };

      const useCase = new UpdateUserUseCase(container.userRepository);
      const user = await useCase.execute(data);

      // C-07: Audit log for user update
      const actor = getActor(req);
      const clientInfo = getClientInfo(req);
      await container.auditLogRepository.log({
        userId: actor.id, username: actor.username, action: 'SUPERADMIN_UPDATE_USER', entity: 'User', entityId: String(userId),
        details: `Updated user: ${user.username} (role: ${user.role})`, ipAddress: clientInfo.ip, userAgent: clientInfo.userAgent
      });

      // T-05: Invalidate tokens for updated user (role may have changed)
      container.tokenBlacklist.invalidateUserTokens(userId);

      res.json(ResponseBuilder.success(UserMapper.toUserDto(user)));
    } catch (error: any) {
      logger.error('Update user error:', error);
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
      }
      if (error.message === 'USERNAME_EXISTS') {
        return res.status(409).json(ResponseBuilder.error('USERNAME_EXISTS', 'Username already exists'));
      }
      res.status(500).json(ResponseBuilder.error('UPDATE_USER_FAILED', 'Failed to update user'));
    }
  }

  /**
    * DELETE /api/v1/root/users/:id
   * Delete a user
   */
  async deleteUser(req: Request, res: Response) {
    try {
      const userId = parseInt(req.params.id as string);
      if (isNaN(userId)) {
        return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
      }

      const useCase = new DeleteUserUseCase(container.userRepository);
      await useCase.execute(userId);

      // C-07: Audit log for user deletion
      const actor = getActor(req);
      const clientInfo = getClientInfo(req);
      await container.auditLogRepository.log({
        userId: actor.id, username: actor.username, action: 'SUPERADMIN_DELETE_USER', entity: 'User', entityId: String(userId),
        details: `Deleted user ID: ${userId}`, ipAddress: clientInfo.ip, userAgent: clientInfo.userAgent
      });

      // T-05: Invalidate all tokens for deleted user
      container.tokenBlacklist.invalidateUserTokens(userId);

      res.json(ResponseBuilder.success({ message: 'User deleted successfully' }));
    } catch (error: any) {
      logger.error('Delete user error:', error);
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
      }
      if (error.message === 'CANNOT_DELETE_ROOT') {
        return res.status(403).json(ResponseBuilder.error('CANNOT_DELETE_ROOT', 'Cannot delete root users'));
      }
      res.status(500).json(ResponseBuilder.error('DELETE_USER_FAILED', 'Failed to delete user'));
    }
  }

  /**
    * POST /api/v1/root/users/:id/reset-password
   * Reset user password
   */
  async resetPassword(req: Request, res: Response) {
    try {
      const userId = parseInt(req.params.id as string);
      if (isNaN(userId)) {
        return res.status(400).json(ResponseBuilder.error('INVALID_ID', 'Invalid user ID'));
      }

      const { newPassword } = req.body as { newPassword: string };
      if (!newPassword) {
        return res.status(400).json(ResponseBuilder.error('MISSING_PASSWORD', 'New password is required'));
      }

      const data: ResetPasswordDto = {
        userId,
        newPassword
      };

      const useCase = new ResetUserPasswordUseCase(container.userRepository, container.authService);
      await useCase.execute(data);

      // C-07: Audit log for password reset
      const actor = getActor(req);
      const clientInfo = getClientInfo(req);
      await container.auditLogRepository.log({
        userId: actor.id, username: actor.username, action: 'SUPERADMIN_RESET_PASSWORD', entity: 'User', entityId: String(userId),
        details: `Password reset for user ID: ${userId}`, ipAddress: clientInfo.ip, userAgent: clientInfo.userAgent
      });

      // T-05: Invalidate all tokens for user whose password was reset
      container.tokenBlacklist.invalidateUserTokens(userId);

      res.json(ResponseBuilder.success({ message: 'Password reset successfully' }));
    } catch (error: any) {
      logger.error('Reset password error:', error);
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json(ResponseBuilder.error('USER_NOT_FOUND', 'User not found'));
      }
      res.status(500).json(ResponseBuilder.error('RESET_PASSWORD_FAILED', 'Failed to reset password'));
    }
  }

  /**
    * GET /api/v1/root/audit-logs
   * Get audit logs
   */
  async getAuditLogs(req: Request, res: Response) {
    try {
      const filter: AuditLogFilters = {
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        action: req.query.action as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      const useCase = container.createGetAuditLogsUseCase();
      const result = await useCase.execute(filter);

      res.json(ResponseBuilder.success({
        logs: result.logs,
        total: result.total,
        limit: filter.limit,
        offset: filter.offset
      }));
    } catch (error) {
      logger.error('Get audit logs error:', error);
      res.status(500).json(ResponseBuilder.error('GET_AUDIT_LOGS_FAILED', 'Failed to get audit logs'));
    }
  }
}

export const superAdminController = new SuperAdminController();
