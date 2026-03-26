import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User } from '../../../domain/entities/User.entity';

export class ListUsersUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(): Promise<User[]> {
    const users = await this.userRepository.findAll();
    return users;
  }
}
