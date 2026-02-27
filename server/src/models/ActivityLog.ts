import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../database';

/**
 * ActivityLog model for audit trail
 * Tracks all important actions in the system
 */
class ActivityLog extends Model<InferAttributes<ActivityLog>, InferCreationAttributes<ActivityLog>> {
    declare id: CreationOptional<number>;
    declare userId: number;
    declare username: string;
    declare action: string;
    declare entity: string;
    declare entityId: string;
    declare details: CreationOptional<string | null>;
    declare ipAddress: CreationOptional<string | null>;
    declare userAgent: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
}

ActivityLog.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
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
    }
}, {
    sequelize,
    tableName: 'ActivityLogs',
    modelName: 'ActivityLog',
    updatedAt: false
});

/**
 * Helper function to log an activity
 */
export async function logActivity(
    userId: number,
    username: string,
    action: string,
    entity: string,
    entityId: string,
    details?: string,
    ipAddress?: string,
    userAgent?: string
): Promise<void> {
    try {
        await ActivityLog.create({
            userId,
            username,
            action,
            entity,
            entityId,
            details: details || null,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
        // Don't throw - logging failure shouldn't break the main operation
    }
}

export default ActivityLog;
