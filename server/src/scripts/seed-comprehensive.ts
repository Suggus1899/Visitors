import sequelize, { initializeDatabaseEncryption } from '../database';
import { seedDatabase } from '../utils/seeder';
import Visit from '../models/Visit';
import Visitor from '../models/Visitor';

const runComprehensiveSeed = async () => {
    try {
        console.log('🌱 Iniciando seed completo del sistema...\n');

        await initializeDatabaseEncryption();

        // Optional: Clean existing data
        const shouldClean = process.argv.includes('--clean');
        if (shouldClean) {
            console.log('🗑️  Limpiando datos existentes...');
            await Visit.destroy({ where: {}, truncate: true });
            await Visitor.destroy({ where: {}, truncate: true });
            console.log('✅ Datos limpiados.\n');
        }

        // Run comprehensive seed
        await seedDatabase();

        // Show summary
        const waitingCount = await Visit.count({ where: { status: 'waiting' } });
        const activeCount = await Visit.count({ where: { status: 'active' } });
        const completedCount = await Visit.count({ where: { status: 'completed' } });
        const visitorCount = await Visitor.count();

        console.log('\n📊 Resumen de datos generados:');
        console.log('================================');
        console.log(`👥 Visitantes: ${visitorCount}`);
        console.log(`⏳ Visitas en espera: ${waitingCount}`);
        console.log(`✅ Visitas activas: ${activeCount}`);
        console.log(`📋 Visitas completadas: ${completedCount}`);
        console.log(`📈 Total de visitas: ${waitingCount + activeCount + completedCount}`);
        console.log('================================\n');

        console.log('✨ Seed completo ejecutado exitosamente!');
        console.log('\n💡 Casos de prueba disponibles:');
        console.log('   - Visitas en ESPERA: Visitantes esperando autorización de ingreso');
        console.log('   - Visitas ACTIVAS: Visitantes actualmente dentro de las instalaciones');
        console.log('   - Visitas COMPLETADAS: Historial de visitas finalizadas');
        console.log('   - Datos completos: Acompañantes, vehículos, áreas, acciones, departamentos');
        console.log('   - Visitantes con: Títulos de trabajo, emails, teléfonos, empresas\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error ejecutando seed:', error);
        process.exit(1);
    }
};

runComprehensiveSeed();
