import sequelize from '../database';
import VisitorModel from '../models/Visitor';
import Encryption from '../utils/Encryption';

const fix = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const visitors = await VisitorModel.findAll();
        console.log(`Found ${visitors.length} visitors to check.`);

        let updatedCount = 0;

        for (const v of visitors) {
            let changed = false;

            // Check encrypted_cedula
            // If it's plain text (no colons), encrypt it.
            // Note: encrypted_cedula might be null in some migration edge cases? NO, we set it.
            // But if migration failed partially...
            // Actually migration used: "UPDATE ... encrypted_cedula = :newEncrypted".
            // newEncrypted was plain text.
            
            if (v.encrypted_cedula && !Encryption.isEncrypted(v.encrypted_cedula)) {
                v.setDataValue('encrypted_cedula', Encryption.encrypt(v.encrypted_cedula));
                changed = true;
            }

            // Check other fields
            if (v.first_name && !Encryption.isEncrypted(v.first_name)) {
                v.setDataValue('first_name', Encryption.encrypt(v.first_name));
                changed = true;
            }
            if (v.last_name && !Encryption.isEncrypted(v.last_name)) {
                v.setDataValue('last_name', Encryption.encrypt(v.last_name));
                changed = true;
            }
            if (v.email && !Encryption.isEncrypted(v.email)) {
                v.setDataValue('email', Encryption.encrypt(v.email));
                changed = true;
            }
            if (v.phone && !Encryption.isEncrypted(v.phone)) {
                v.setDataValue('phone', Encryption.encrypt(v.phone));
                changed = true;
            }

            if (changed) {
                // We must use 'silent: true' or disable hooks to avoid double hashing/encryption logic in beforeSave?
                // beforeSave logic:
                // if (changed('cedula')) ... -> We are NOT changing cedula PK.
                // if (changed('first_name')) -> Encryption.encrypt(val).
                // Wait, if I set it to Encrypted value here, and save, beforeSave might Encrypt AGAIN?
                // beforeSave: if (!val.includes(':')) encrypt().
                // valid.
                // So if I set it to Encrypted string here, beforeSave sees colons and skips.
                // BUT, `v.first_name` setter might triggered?
                // I am using `setDataValue`.
                // VisitorModel hooks uses `getDataValue`.
                // It should be fine.
                
                await v.save({ hooks: false }); // SKIP HOOKS to be safe and just save what I set.
                updatedCount++;
            }
        }

        console.log(`Fixed encryption for ${updatedCount} visitors.`);
        process.exit(0);
    } catch (e) {
        console.error('Fix failed:', e);
        process.exit(1);
    }
};

fix();
