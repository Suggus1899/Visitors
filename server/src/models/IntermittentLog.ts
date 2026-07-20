import {
    DataTypes, Model,
    InferAttributes, InferCreationAttributes,
    CreationOptional, ForeignKey
} from 'sequelize';
import sequelize from '../database';
import VisitModel from './Visit';

/**
 * IntermittentLog — records each temporary exit and re-entry event
 * during an active visit.
 *
 * Relation: Many IntermittentLogs belong to one Visit (visit_id FK).
 *
 * Schema:
 *   id          — auto PK
 *   visit_id    — FK → Visits.id
 *   check_out   — ISO 8601 timestamp of temporary exit (required)
 *   re_entry    — ISO 8601 timestamp of re-entry (null = still outside)
 *   notes       — optional free-text note for the event
 */
class IntermittentLogModel extends Model<
    InferAttributes<IntermittentLogModel>,
    InferCreationAttributes<IntermittentLogModel>
> {
    declare id: CreationOptional<number>;
    declare tenantId: CreationOptional<number>;
    declare visit_id: ForeignKey<VisitModel['id']>;
    declare check_out: Date;
    declare re_entry: CreationOptional<Date | null>;
    declare notes: CreationOptional<string | null>;
    declare registered_by: CreationOptional<string | null>;

    // Association helper
    declare Visit?: VisitModel;
}

IntermittentLogModel.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        tenantId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Tenants', key: 'id' },
        },
        visit_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Visits',
                key: 'id',
            },
            onDelete: 'CASCADE',
        },
        check_out: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'ISO 8601 — timestamp when the visitor temporarily left the premises',
        },
        re_entry: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'ISO 8601 — timestamp of re-entry; NULL means visitor is still outside',
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        registered_by: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Username of the security staff who registered this event',
        },
    },
    {
        sequelize,
        tableName: 'IntermittentLogs',
        modelName: 'IntermittentLog',
    }
);

// Associations
IntermittentLogModel.belongsTo(VisitModel, { foreignKey: 'visit_id', as: 'Visit' });
VisitModel.hasMany(IntermittentLogModel, { foreignKey: 'visit_id', as: 'intermittent_logs' });

export default IntermittentLogModel;
