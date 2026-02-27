import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, NonAttribute } from 'sequelize';
import sequelize from '../database';
import Encryption from '../utils/Encryption';

class VisitorModel extends Model<InferAttributes<VisitorModel>, InferCreationAttributes<VisitorModel>> {
    declare cedula: string; // Stored as hash
    declare encrypted_cedula: CreationOptional<string | null>;
    declare first_name: string; // Encrypted
    declare last_name: string; // Encrypted
    declare company: string;
    declare job_title: CreationOptional<string | null>;
    declare photo_url: CreationOptional<string | null>;
    declare id_photo_url: CreationOptional<string | null>;
    declare email: CreationOptional<string | null>; // Encrypted
    declare phone: CreationOptional<string | null>; // Encrypted
    
    // Unencrypted virtual getters/setters (if needed)
    declare dec_cedula?: NonAttribute<string>;
    declare dec_first_name?: NonAttribute<string>;
    declare dec_last_name?: NonAttribute<string>;
    declare dec_email?: NonAttribute<string | null>;
    declare dec_phone?: NonAttribute<string | null>;

    getDecrypted(): Record<string, any> {
        return {
            cedula: this.encrypted_cedula ? Encryption.decrypt(this.encrypted_cedula) : this.cedula,
            first_name: this.first_name && this.first_name.includes(':') ? Encryption.decrypt(this.first_name) : this.first_name,
            last_name: this.last_name && this.last_name.includes(':') ? Encryption.decrypt(this.last_name) : this.last_name,
            company: this.company,
            job_title: this.job_title && this.job_title.includes(':') ? Encryption.decrypt(this.job_title) : this.job_title,
            photo_url: this.photo_url,
            id_photo_url: this.id_photo_url,
            email: this.email && this.email.includes(':') ? Encryption.decrypt(this.email) : this.email,
            phone: this.phone && this.phone.includes(':') ? Encryption.decrypt(this.phone) : this.phone
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
    email: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    phone: {
        type: DataTypes.TEXT,
        allowNull: true
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
