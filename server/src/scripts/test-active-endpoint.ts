import sequelize, { initializeDatabaseEncryption } from '../database';
import { container } from '../shared/Container';

const testActiveEndpoint = async () => {
    try {
        await initializeDatabaseEncryption();

        console.log('🧪 Probando endpoint /visits/active...\n');

        const useCase = container.createGetActiveVisitsUseCase();
        const visits = await useCase.execute();

        console.log(`✅ Visitas activas encontradas: ${visits.length}\n`);

        if (visits.length > 0) {
            console.log('Primera visita activa:');
            console.log(JSON.stringify(visits[0], null, 2));
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

testActiveEndpoint();
