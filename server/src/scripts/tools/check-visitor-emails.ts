import sequelize from '../database';
import Visitor from '../models/Visitor';

const checkEmails = async () => {
    try {
        console.log('🔍 Verificando emails de visitantes...\n');

        const visitors = await Visitor.findAll({ limit: 10 });

        visitors.forEach((visitor, index) => {
            const decrypted = visitor.getDecrypted();
            console.log(`${index + 1}. Cédula: ${decrypted.cedula}`);
            console.log(`   Email: "${decrypted.email}"`);
            console.log(`   Email type: ${typeof decrypted.email}`);
            console.log(`   Email length: ${decrypted.email?.length || 0}`);
            console.log(`   Has colon: ${decrypted.email?.includes(':')}`);
            console.log('');
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

checkEmails();
