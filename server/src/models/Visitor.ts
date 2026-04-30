import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import sequelize from '../database';
import Encryption from '../utils/Encryption';

class VisitorModel extends Model<InferAttributes<VisitorModel>, InferCreationAttributes<VisitorModel>> {
    declare id: CreationOptional<number>;
    declare cedula: string; // Stored as hash
    declare encrypted_cedula: CreationOptional<string | null>;
    declare first_name: string; // Encrypted
    declare last_name: string; // Encrypted
    declare company: string;
    declare job_title: CreationOptional<string | null>;
    declare photo_url: CreationOptional<string | null>;
    declare id_photo_url: CreationOptional<string | null>;
    declare photo_blob: CreationOptional<Buffer | null>;
    declare id_photo_blob: CreationOptional<Buffer | null>;
    declare email: CreationOptional<string | null>; // Encrypted
    declare phone: CreationOptional<string | null>; // Encrypted
    declare isBlocked: CreationOptional<boolean>;
    declare observations: CreationOptional<string | null>;
    declare createdAt: CreationOptional<Date>;
    
    // Unencrypted virtual getters/setters (if needed)
    declare dec_cedula?: NonAttribute<string>;
    declare dec_first_name?: NonAttribute<string>;
    declare dec_last_name?: NonAttribute<string>;
    declare dec_email?: NonAttribute<string | null>;
    declare dec_phone?: NonAttribute<string | null>;

    getDecrypted(): Record<string, any> {
        return {
            id: this.id,
            cedula: this.encrypted_cedula ? Encryption.decrypt(this.encrypted_cedula) : this.cedula,
            first_name: this.first_name && Encryption.isEncrypted(this.first_name) ? Encryption.decrypt(this.first_name) : this.first_name,
            last_name: this.last_name && Encryption.isEncrypted(this.last_name) ? Encryption.decrypt(this.last_name) : this.last_name,
            company: this.company,
            job_title: this.job_title && Encryption.isEncrypted(this.job_title) ? Encryption.decrypt(this.job_title) : this.job_title,
            photo_url: this.photo_url,
            id_photo_url: this.id_photo_url,
            photo_blob: this.photo_blob,
            id_photo_blob: this.id_photo_blob,
            email: this.email && Encryption.isEncrypted(this.email) ? Encryption.decrypt(this.email) : this.email,
            phone: this.phone && Encryption.isEncrypted(this.phone) ? Encryption.decrypt(this.phone) : this.phone,
            isBlocked: this.isBlocked,
            observations: this.observations,
            createdAt: this.createdAt
        };
    }
}

VisitorModel.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    cedula: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    encrypted_cedula: {
        type: DataTypes.STRING,
        allowNull: true
    },
    first_name: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    last_name: {
        type: DataTypes.TEXT,
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
        type: DataTypes.STRING,
        allowNull: true
    },
    id_photo_url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    photo_blob: {
        type: DataTypes.BLOB,
        allowNull: true
    },
    id_photo_blob: {
        type: DataTypes.BLOB,
        allowNull: true
    },
    email: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    phone: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    isBlocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
    },
    observations: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false
    }
}, {
    sequelize,
    tableName: 'Visitors',
    modelName: 'Visitor',
    hooks: {
        beforeSave: (instance) => {
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
                if (!Encryption.isEncrypted(val)) instance.setDataValue('first_name', Encryption.encrypt(val));
            }
            if (instance.changed('last_name')) {
                const val = instance.getDataValue('last_name');
                if (!Encryption.isEncrypted(val)) instance.setDataValue('last_name', Encryption.encrypt(val));
            }
            if (instance.changed('email') && instance.email) {
                const val = instance.getDataValue('email');
                if (val && !Encryption.isEncrypted(val)) instance.setDataValue('email', Encryption.encrypt(val));
            }
            if (instance.changed('phone') && instance.phone) {
                const val = instance.getDataValue('phone');
                if (val && !Encryption.isEncrypted(val)) instance.setDataValue('phone', Encryption.encrypt(val));
            }
            if (instance.changed('job_title') && instance.job_title) {
                const val = instance.getDataValue('job_title');
                if (val && !Encryption.isEncrypted(val)) instance.setDataValue('job_title', Encryption.encrypt(val));
            }
        }
    }
});

export default VisitorModel;
