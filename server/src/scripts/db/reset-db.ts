import sequelize from '../database';
import Visit from '../models/Visit';
import Visitor from '../models/Visitor';

const resetDb = async () => {
    try {
        console.log('🗑️  Limpiando base de datos...');
        
        // Delete all visits first (foreign key constraint)
        await Visit.destroy({ where: {}, truncate: true });
        console.log('✅ Tabla Visitas vaciada.');

        // Delete all visitors
        await Visitor.destroy({ where: {}, truncate: true });
        console.log('✅ Tabla Visitantes vaciada.');

        console.log('✨ Base de datos limpia. Los usuarios administradores se han conservado.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error limpiando la base de datos:', error);
        process.exit(1);
    }
};

resetDb();
