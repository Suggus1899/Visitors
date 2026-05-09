import sequelize from '../database';
import Visit from '../models/Visit';

const checkVisitsStatus = async () => {
    try {
        console.log('📊 Estado actual de las visitas:\n');

        const waitingCount = await Visit.count({ where: { status: 'waiting' } });
        const activeCount = await Visit.count({ where: { status: 'active' } });
        const completedCount = await Visit.count({ where: { status: 'completed' } });

        console.log(`⏳ Visitas en ESPERA: ${waitingCount}`);
        console.log(`✅ Visitas ACTIVAS: ${activeCount}`);
        console.log(`📋 Visitas COMPLETADAS: ${completedCount}`);
        console.log(`📈 Total: ${waitingCount + activeCount + completedCount}\n`);

        // Show some active visits
        if (activeCount > 0) {
            console.log('Primeras 5 visitas activas:');
            const activeVisits = await Visit.findAll({
                where: { status: 'active' },
                limit: 5,
                order: [['check_in_time', 'DESC']]
            });

            activeVisits.forEach((visit, index) => {
                console.log(`  ${index + 1}. ID: ${visit.id}, Cédula: ${visit.visitor_cedula.substring(0, 8)}..., Check-in: ${visit.check_in_time}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

checkVisitsStatus();
