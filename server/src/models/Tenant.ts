import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import sequelize from '../database';

export type TenantStatus = 'active' | 'suspended' | 'trial';
export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';

class Tenant extends Model<InferAttributes<Tenant>, InferCreationAttributes<Tenant>> {
  declare id: CreationOptional<number>;
  declare slug: string;
  declare name: string;
  declare domain: CreationOptional<string | null>;
  declare status: CreationOptional<TenantStatus>;
  declare subscriptionPlan: CreationOptional<SubscriptionPlan>;
  declare maxUsers: CreationOptional<number>;
  declare maxVisitors: CreationOptional<number>;
  declare subscriptionExpiresAt: CreationOptional<Date | null>;
  declare isDemo: CreationOptional<boolean>;
  declare demoExpiresAt: CreationOptional<Date | null>;
  declare settings: CreationOptional<Record<string, unknown>>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Tenant.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(200), allowNull: false },
  domain: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  status: { type: DataTypes.ENUM('active', 'suspended', 'trial'), allowNull: false, defaultValue: 'active' },
  subscriptionPlan: { type: DataTypes.ENUM('free', 'starter', 'professional', 'enterprise'), allowNull: false, defaultValue: 'free' },
  maxUsers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  maxVisitors: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1000 },
  subscriptionExpiresAt: { type: DataTypes.DATE, allowNull: true },
  isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  demoExpiresAt: { type: DataTypes.DATE, allowNull: true },
  settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { sequelize, tableName: 'Tenants', modelName: 'Tenant' });

export default Tenant;
