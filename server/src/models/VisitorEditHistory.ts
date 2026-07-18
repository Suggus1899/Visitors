import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../database';

/**
 * VisitorEditHistory model
 * Tracks field-level changes to visitor data, linked to a specific visit context.
 */
class VisitorEditHistory extends Model<InferAttributes<VisitorEditHistory>, InferCreationAttributes<VisitorEditHistory>> {
    declare id: CreationOptional<number>;
    declare visitId: number;
    declare visitorId: number;
    declare field: string;
    declare oldValue: CreationOptional<string | null>;
    declare newValue: CreationOptional<string | null>;
    declare editedBy: number;
    declare editedByUsername: string;
    declare editedAt: CreationOptional<Date>;
}

VisitorEditHistory.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    visitId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    visitorId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    field: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    oldValue: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    newValue: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    editedBy: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    editedByUsername: {
        type: DataTypes.STRING,
        allowNull: false
    },
    editedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false
    }
}, {
    sequelize,
    tableName: 'VisitorEditHistories',
    modelName: 'VisitorEditHistory',
    updatedAt: false
});

export default VisitorEditHistory;
