import { CreationOptional, DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import sequelize from '../database';
import Tenant from './Tenant';
import User from './User';

export type TenantRole = 'admin' | 'operador' | 'auditor' | 'demo';

class TenantUser extends Model<InferAttributes<TenantUser>, InferCreationAttributes<TenantUser>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare tenantId: ForeignKey<Tenant['id']>;
  declare role: TenantRole;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

TenantUser.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
  tenantId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Tenants', key: 'id' }, onDelete: 'CASCADE' },
  role: { type: DataTypes.ENUM('admin', 'operador', 'auditor', 'demo'), allowNull: false, defaultValue: 'operador' },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  sequelize,
  tableName: 'TenantUsers',
  modelName: 'TenantUser',
  indexes: [{ unique: true, fields: ['userId', 'tenantId'] }],
  hooks: {
    beforeCreate: async membership => {
      const { usageCounterService } = await import('../services/UsageCounterService');
      await usageCounterService.assertCanCreateUser(membership.tenantId, membership.role);
    }
  }
});

Tenant.belongsToMany(User, { through: TenantUser, foreignKey: 'tenantId', otherKey: 'userId' });
User.belongsToMany(Tenant, { through: TenantUser, foreignKey: 'userId', otherKey: 'tenantId' });
TenantUser.belongsTo(Tenant, { foreignKey: 'tenantId' });
TenantUser.belongsTo(User, { foreignKey: 'userId' });

export default TenantUser;
