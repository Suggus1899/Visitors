import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User, UserEntity } from '../../../domain/entities/User.entity';
import { literal, Op } from 'sequelize';
import UserModel from '../../../models/User';

export class SequelizeUserRepository implements IUserRepository {
  async findAll(): Promise<User[]> {
    const users = await UserModel.findAll();
    return users.map(user => this.toDomain(user));
  }

  async delete(id: number): Promise<void> {
    await UserModel.destroy({ where: { id } });
  }

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
    if (user.id) {
      await UserModel.update({
        username: user.username,
        role: user.role,
        password: user.password,
        resetToken: user.resetToken,
        resetTokenExpiry: user.resetTokenExpiry,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
        passwordChangedAt: user.passwordChangedAt
      }, { where: { id: user.id } });
      return user;
    } else {
      const newUser = await UserModel.create({
        username: user.username,
        role: user.role,
        password: user.password!,
        resetToken: user.resetToken,
        resetTokenExpiry: user.resetTokenExpiry,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
        passwordChangedAt: user.passwordChangedAt
      });
      return this.toDomain(newUser);
    }
  }

  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    await this.updatePasswordChange(id, hashedPassword, true, new Date());
  }

  async updatePasswordChange(id: number, hashedPassword: string, mustChangePassword: boolean, passwordChangedAt: Date): Promise<void> {
    await UserModel.update({
      password: hashedPassword,
      mustChangePassword,
      passwordChangedAt,
      tokenVersion: literal('"tokenVersion" + 1'),
      resetToken: null, resetTokenExpiry: null, loginAttempts: 0, lockedUntil: null
    }, { where: { id } });
  }

  async updateLoginAttempts(id: number, loginAttempts: number, lockedUntil: Date | null): Promise<void> {
    await UserModel.update({
      loginAttempts,
      lockedUntil
    }, { where: { id } });
  }

  async consumeResetToken(token: string, hashedPassword: string): Promise<boolean> {
    const [count] = await UserModel.update({ password: hashedPassword, mustChangePassword: false,
      passwordChangedAt: new Date(), tokenVersion: literal('"tokenVersion" + 1'), resetToken: null,
      resetTokenExpiry: null, loginAttempts: 0, lockedUntil: null },
      { where: { resetToken: token, resetTokenExpiry: { [Op.gt]: new Date() } } });
    return count === 1;
  }

  async updateResetToken(id: number, token: string | null, expiry: Date | null): Promise<void> {
    await UserModel.update({
      resetToken: token,
      resetTokenExpiry: expiry
    }, { where: { id } });
  }

  private toDomain(model: InstanceType<typeof UserModel>): User {
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
      model.lockedUntil,
      model.email,
      model.tokenVersion
    );
  }
}
