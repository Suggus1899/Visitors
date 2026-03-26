import { IUserRepository } from '../../../domain/repositories/IUserRepository';

export class DeleteUserUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(userId: number): Promise<void> {
    // Find user to ensure they exist
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Prevent deleting superadmin users
    if (user.role === 'superadmin') {
      throw new Error('CANNOT_DELETE_SUPERADMIN');
    }

    // Delete user from repository
    await this.userRepository.delete(userId);
  }
}
