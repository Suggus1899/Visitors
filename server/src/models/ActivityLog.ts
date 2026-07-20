import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../database';
import logger from '../config/logger';

/**
 * ActivityLog model for audit trail
 * Tracks all important actions in the system
 */
class ActivityLog extends Model<InferAttributes<ActivityLog>, InferCreationAttributes<ActivityLog>> {
    declare id: CreationOptional<number>;
    declare tenantId: CreationOptional<number>;
    declare userId: number;
    declare username: string;
    declare action: string;
    declare entity: string;
    declare entityId: string;
    declare details: CreationOptional<string | null>;
    declare ipAddress: CreationOptional<string | null>;
    declare userAgent: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;

    // Extended audit fields (Requirements: 10.5)
    declare method: CreationOptional<string | null>;
    declare path: CreationOptional<string | null>;
    declare statusCode: CreationOptional<number | null>;
    declare duration: CreationOptional<number | null>;
    declare severity: CreationOptional<'low' | 'medium' | 'high' | 'critical'>;
    declare role: CreationOptional<string | null>;
    declare resource: CreationOptional<string | null>;
    declare resourceId: CreationOptional<number | null>;
    declare status: CreationOptional<'success' | 'failure'>;
}

ActivityLog.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    tenantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Tenants', key: 'id' }
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false
    },
    entity: {
        type: DataTypes.STRING,
        allowNull: false
    },
    entityId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    details: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: true
    },
    userAgent: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    method: {
        type: DataTypes.STRING(10),
        allowNull: true
    },
    path: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    statusCode: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    duration: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    severity: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        defaultValue: 'low'
    },
    role: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    resource: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    resourceId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('success', 'failure'),
        defaultValue: 'success'
    }
}, {
    sequelize,
    tableName: 'ActivityLogs',
    modelName: 'ActivityLog',
    updatedAt: false
});

export default ActivityLog;
