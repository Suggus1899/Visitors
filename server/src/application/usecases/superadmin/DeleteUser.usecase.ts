import { IUserRepository } from '../../../domain/repositories/IUserRepository';

export class DeleteUserUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(userId: number): Promise<void> {
    // Find user to ensure they exist
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Prevent deleting root users
    if (user.role === 'root') {
      throw new Error('CANNOT_DELETE_ROOT');
    }

    // Delete user from repository
    await this.userRepository.delete(userId);
  }
}
