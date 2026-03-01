import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User, UserEntity } from '../../../domain/entities/User.entity';
import UserModel from '../../../models/User';

export class SequelizeUserRepository implements IUserRepository {
  async findByUsername(username: string): Promise<User | null> {
    const userModel = await UserModel.findOne({ where: { username } });
    if (!userModel) return null;
    return this.toDomain(userModel);
  }

  async findByUsernameModel(username: string): Promise<typeof UserModel.prototype | null> {
    return await UserModel.findOne({ where: { username } });
  }

  async findByResetToken(token: string): Promise<User | null> {
    const userModel = await UserModel.findOne({ where: { resetToken: token } });
    if (!userModel) return null;
    return this.toDomain(userModel);
  }

  async findById(id: number): Promise<User | null> {
    const userModel = await UserModel.findByPk(id);
    if (!userModel) return null;
    return this.toDomain(userModel);
  }

  async findByIdModel(id: number): Promise<typeof UserModel.prototype | null> {
    return await UserModel.findByPk(id);
  }

  async save(user: User): Promise<User> {
    // If ID exists, update, else create
    if (user.id) {
      await UserModel.update({
        username: user.username,
        role: user.role,
        password: user.password, // Only if changed? Usually handled by separate method or careful mapping
        resetToken: user.resetToken,
        resetTokenExpiry: user.resetTokenExpiry
      }, { where: { id: user.id } });
      return user;
    } else {
      const newUser = await UserModel.create({
        username: user.username,
        role: user.role,
        password: user.password!, // Password required for new user
        resetToken: user.resetToken,
        resetTokenExpiry: user.resetTokenExpiry
      });
      return this.toDomain(newUser);
    }
  }

  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    await UserModel.update({ password: hashedPassword }, { where: { id } });
  }

  async updateResetToken(id: number, token: string | null, expiry: Date | null): Promise<void> {
    await UserModel.update({
      resetToken: token,
      resetTokenExpiry: expiry
    }, { where: { id } });
  }

  private toDomain(model: any): User {
    return new User(
      model.username,
      model.role,
      model.password,
      model.id,
      model.resetToken,
      model.resetTokenExpiry,
      model.mustChangePassword,
      model.passwordChangedAt,
      model.loginAttempts,
      model.lockedUntil
    );
  }
}
