import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import sequelize from '../database';
import VisitModel from './Visit';

class VisitIntervalModel extends Model<InferAttributes<VisitIntervalModel>, InferCreationAttributes<VisitIntervalModel>> {
    declare id: CreationOptional<number>;
    declare visit_id: ForeignKey<VisitModel['id']>;
    declare exit_time: Date;
    declare reentry_time: CreationOptional<Date | null>;
    declare notes: CreationOptional<string | null>;
}

VisitIntervalModel.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    visit_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    exit_time: {
        type: DataTypes.DATE,
        allowNull: false
    },
    reentry_time: {
        type: DataTypes.DATE,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'VisitIntervals',
    modelName: 'VisitInterval'
});

VisitIntervalModel.belongsTo(VisitModel, { foreignKey: 'visit_id' });
VisitModel.hasMany(VisitIntervalModel, { foreignKey: 'visit_id', as: 'intervals' });

export default VisitIntervalModel;
