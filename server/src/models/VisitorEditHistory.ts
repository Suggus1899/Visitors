import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../database';
import Encryption from '../utils/Encryption';

/**
 * Fields whose oldValue/newValue are considered PII and must be encrypted
 * at rest in the edit history table. Mirrors the PII columns encrypted in
 * the Visitor model (Visitor.ts).
 */
export const PII_EDIT_FIELDS = new Set([
    'first_name',
    'last_name',
    'email',
    'phone',
    'job_title',
    'cedula',
]);

/**
 * VisitorEditHistory model
 * Tracks field-level changes to visitor data, linked to a specific visit context.
 */
class VisitorEditHistory extends Model<InferAttributes<VisitorEditHistory>, InferCreationAttributes<VisitorEditHistory>> {
    declare id: CreationOptional<number>;
    declare tenantId: CreationOptional<number>;
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
    tenantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Tenants', key: 'id' }
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
    updatedAt: false,
    hooks: {
        beforeSave: (instance) => {
            // Encrypt oldValue/newValue when the tracked field is PII, so
            // sensitive values are never stored in plain text in the audit
            // trail. Non-PII fields (e.g. company) remain plain text.
            if (PII_EDIT_FIELDS.has(instance.field)) {
                const oldVal = instance.getDataValue('oldValue');
                if (oldVal && !Encryption.isEncrypted(oldVal)) {
                    instance.setDataValue('oldValue', Encryption.encrypt(oldVal));
                }
                const newVal = instance.getDataValue('newValue');
                if (newVal && !Encryption.isEncrypted(newVal)) {
                    instance.setDataValue('newValue', Encryption.encrypt(newVal));
                }
            }
        }
    }
});

export default VisitorEditHistory;
