import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../database';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
    declare id: CreationOptional<number>;
    declare username: string;
    declare password: string;
    declare role: CreationOptional<'admin' | 'guard' | 'auditor'>;
    declare resetToken: CreationOptional<string | null>;
    declare resetTokenExpiry: CreationOptional<Date | null>;

    // Password policy fields (Requirements: 5.1, 5.2)
    declare mustChangePassword: CreationOptional<boolean>;
    declare passwordChangedAt: CreationOptional<Date | null>;

    // Account lockout fields (Requirements: 9.1, 9.2)
    declare loginAttempts: CreationOptional<number>;
    declare lockedUntil: CreationOptional<Date | null>;
}

User.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('admin', 'guard', 'auditor'),
        defaultValue: 'guard'
    },
    resetToken: {
        type: DataTypes.STRING,
        allowNull: true
    },
    resetTokenExpiry: {
        type: DataTypes.DATE,
        allowNull: true
    },
    mustChangePassword: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    passwordChangedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    loginAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    sequelize,
    modelName: 'User'
});

export default User;
