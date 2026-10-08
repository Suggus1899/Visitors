import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey } from 'sequelize';
import sequelize from '../database';
import VisitorModel from './Visitor';

class VisitModel extends Model<InferAttributes<VisitModel>, InferCreationAttributes<VisitModel>> {
    declare id: CreationOptional<number>;
    declare visitor_id: ForeignKey<VisitorModel['id']>;
    declare visitor_cedula: string;
    declare purpose: string;
    declare person_to_visit: string;
    declare check_in_time: CreationOptional<Date>;
    declare check_out_time: CreationOptional<Date | null>;
    declare status: CreationOptional<'waiting' | 'active' | 'intermittent' | 'completed'>;
    declare notes: CreationOptional<string | null>;

    // Timestamp lifecycle fields (ISO 8601)
    declare arrival_time: CreationOptional<Date | null>;  // When visitor arrives at reception
    declare entry_time: CreationOptional<Date | null>;    // When visitor enters the premises
    declare exit_time: CreationOptional<Date | null>;     // When visitor fully departs

    // Explicit relational fields (complements department / person_to_visit)
    declare target_department: CreationOptional<string | null>;  // Area/Department to visit
    declare host_person: CreationOptional<string | null>;        // Specific person to visit
    
    // Pase de Entrada fields
    declare companion_name: CreationOptional<string | null>;
    declare companion_cedula: CreationOptional<string | null>;
    declare vehicle_brand: CreationOptional<string | null>;
    declare vehicle_model: CreationOptional<string | null>;
    declare vehicle_plate: CreationOptional<string | null>;
    declare area: CreationOptional<string | null>;
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
        type: DataTypes.ENUM('waiting', 'active', 'intermittent', 'completed'),
        defaultValue: 'active'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    // --- Timestamp Lifecycle ---
    arrival_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'ISO 8601 — when the visitor arrived at the reception gate'
    },
    entry_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'ISO 8601 — when the visitor was authorized and entered the premises'
    },
    exit_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'ISO 8601 — when the visitor fully departed the premises'
    },
    // --- Relational Fields ---
    target_department: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'The department or area the visitor is heading to'
    },
    host_person: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'The specific person the visitor has an appointment with'
    },
    // --- Pase de Entrada ---
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
        type: DataTypes.STRING,
        allowNull: true
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
VisitModel.belongsTo(VisitorModel, { foreignKey: 'visitor_id' });
VisitorModel.hasMany(VisitModel, { foreignKey: 'visitor_id' });

export default VisitModel;
