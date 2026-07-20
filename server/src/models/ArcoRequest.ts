import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../database';

export type ArcoRequestType = 'access' | 'rectification' | 'cancellation' | 'opposition';
export type ArcoRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

class ArcoRequest extends Model<InferAttributes<ArcoRequest>, InferCreationAttributes<ArcoRequest>> {
    declare id: CreationOptional<number>;
    declare tenantId: CreationOptional<number>;
    declare requestType: ArcoRequestType;
    declare subjectCedulaHash: string;
    declare subjectCedulaEncrypted: CreationOptional<string | null>;
    declare requestedByName: string;
    declare requestedByUserId: CreationOptional<number | null>;
    declare contactEmail: CreationOptional<string | null>;
    declare reason: CreationOptional<string | null>;
    declare requestPayload: CreationOptional<string | null>;
    declare status: CreationOptional<ArcoRequestStatus>;
    declare resolutionNotes: CreationOptional<string | null>;
    declare resolvedAt: CreationOptional<Date | null>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

ArcoRequest.init({
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
    requestType: {
        type: DataTypes.ENUM('access', 'rectification', 'cancellation', 'opposition'),
        allowNull: false
    },
    subjectCedulaHash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    subjectCedulaEncrypted: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    requestedByName: {
        type: DataTypes.STRING(120),
        allowNull: false
    },
    requestedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    contactEmail: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    reason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    requestPayload: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'rejected'),
        allowNull: false,
        defaultValue: 'pending'
    },
    resolutionNotes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    sequelize,
    tableName: 'ArcoRequests',
    modelName: 'ArcoRequest'
});

export default ArcoRequest;
