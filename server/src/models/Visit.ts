import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import sequelize from '../database';
import VisitorModel from './Visitor';

class VisitModel extends Model<InferAttributes<VisitModel>, InferCreationAttributes<VisitModel>> {
    declare id: CreationOptional<number>;
    declare visitor_cedula: ForeignKey<VisitorModel['cedula']>;
    declare purpose: string;
    declare person_to_visit: string;
    declare check_in_time: CreationOptional<Date>;
    declare check_out_time: CreationOptional<Date | null>;
    declare status: CreationOptional<'waiting' | 'active' | 'completed'>;
    declare notes: CreationOptional<string | null>;
    
    // New fields for 'Pase de Entrada'
    declare companion_name: CreationOptional<string | null>;
    declare companion_cedula: CreationOptional<string | null>;
    declare vehicle_brand: CreationOptional<string | null>;
    declare vehicle_model: CreationOptional<string | null>;
    declare vehicle_plate: CreationOptional<string | null>;
    declare area: CreationOptional<'Oficina' | 'Planta' | 'Almacén' | 'Ninguna'>;
    declare action: CreationOptional<'Carga' | 'Descarga' | 'Ninguna'>;
    declare department: CreationOptional<string | null>;

    // Associations
    declare Visitor?: VisitorModel;
}

VisitModel.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    visitor_cedula: {
        type: DataTypes.STRING,
        allowNull: false
    },
    purpose: {
        type: DataTypes.STRING,
        allowNull: false
    },
    person_to_visit: {
        type: DataTypes.STRING,
        allowNull: false
    },
    check_in_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    check_out_time: {
        type: DataTypes.DATE,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('waiting', 'active', 'completed'),
        defaultValue: 'active'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    companion_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    companion_cedula: {
        type: DataTypes.STRING,
        allowNull: true
    },
    vehicle_brand: {
        type: DataTypes.STRING,
        allowNull: true
    },
    vehicle_model: {
        type: DataTypes.STRING,
        allowNull: true
    },
    vehicle_plate: {
        type: DataTypes.STRING,
        allowNull: true
    },
    area: {
        type: DataTypes.ENUM('Oficina', 'Planta', 'Almacén', 'Ninguna'),
        defaultValue: 'Ninguna'
    },
    action: {
        type: DataTypes.ENUM('Carga', 'Descarga', 'Ninguna'),
        defaultValue: 'Ninguna'
    },
    department: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'Visits',
    modelName: 'Visit'
});

// Define Associations
VisitModel.belongsTo(VisitorModel, { foreignKey: 'visitor_cedula' });
VisitorModel.hasMany(VisitModel, { foreignKey: 'visitor_cedula' });

export default VisitModel;
