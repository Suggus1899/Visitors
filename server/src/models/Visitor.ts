import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import sequelize from '../database';
import Encryption from '../utils/Encryption';

class VisitorModel extends Model<InferAttributes<VisitorModel>, InferCreationAttributes<VisitorModel>> {
    declare cedula: string; // Will store the HASH of the cedula
    declare encrypted_cedula: CreationOptional<string | null>; // Will store the Encrypted Cedula for display
    declare first_name: string;
    declare last_name: string;
    declare company: string;
    declare job_title: CreationOptional<string | null>;
    declare photo_url: CreationOptional<string | null>;
    declare email: CreationOptional<string | null>;
    declare phone: CreationOptional<string | null>;

    // Helpers
    getDecrypted(): any {
        return {
            ...this.toJSON(),
            // cedula PK is a hash, so we return the decrypted version from encrypted_cedula if available
            cedula: this.encrypted_cedula ? Encryption.decrypt(this.encrypted_cedula) : this.cedula,
            first_name: Encryption.decrypt(this.first_name),
            last_name: Encryption.decrypt(this.last_name),
            job_title: this.job_title ? Encryption.decrypt(this.job_title) : null,
            email: this.email ? Encryption.decrypt(this.email) : null,
            phone: this.phone ? Encryption.decrypt(this.phone) : null,
        };
    }
}

VisitorModel.init({
    cedula: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    encrypted_cedula: {
        type: DataTypes.STRING,
        allowNull: true
    },
    first_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    last_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    company: {
        type: DataTypes.STRING,
        allowNull: false
    },
    job_title: {
        type: DataTypes.STRING,
        allowNull: true
    },
    photo_url: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'Visitors',
    modelName: 'Visitor',
    hooks: {
        beforeSave: (instance) => {
            // Logic: The 'cedula' field set by the application is likely the PLAIN TEXT or already HAShED?
            // If the App sets 'cedula' = '123', we must convert it to Hash and set encrypted_cedula.
            // But if it's already a Hash (migration), we skip.
            // How to distinguish? Plain '123' vs Hash (hex, 64 chars).
            // A simple check is length. SHA256 hex is 64 chars. real cedula is usually < 20.
            
            if (instance.changed('cedula')) {
                const val = instance.getDataValue('cedula');
                if (val.length !== 64) { // Assume simple length check for migration safety
                    instance.setDataValue('encrypted_cedula', Encryption.encrypt(val));
                    instance.setDataValue('cedula', Encryption.hash(val));
                }
            }
            
            // Other fields
            if (instance.changed('first_name')) {
                const val = instance.getDataValue('first_name');
                if (!val.includes(':')) instance.setDataValue('first_name', Encryption.encrypt(val));
            }
            if (instance.changed('last_name')) {
                const val = instance.getDataValue('last_name');
                if (!val.includes(':')) instance.setDataValue('last_name', Encryption.encrypt(val));
            }
            if (instance.changed('email') && instance.email) {
                const val = instance.getDataValue('email');
                if (val && !val.includes(':')) instance.setDataValue('email', Encryption.encrypt(val));
            }
            if (instance.changed('phone') && instance.phone) {
                const val = instance.getDataValue('phone');
                if (val && !val.includes(':')) instance.setDataValue('phone', Encryption.encrypt(val));
            }
            if (instance.changed('job_title') && instance.job_title) {
                const val = instance.getDataValue('job_title');
                if (val && !val.includes(':')) instance.setDataValue('job_title', Encryption.encrypt(val));
            }
        }
    }
});

export default VisitorModel;
