import sequelize, { initializeDatabaseEncryption } from '../database';
import { seedComprehensive } from '../utils/seeder';
import logger from '../config/logger';

const runSeed = async () => {
    try {
        const isClean = process.argv.includes('--clean');
        
        await initializeDatabaseEncryption();
        
        if (isClean) {
            logger.info('🧹 Cleaning database before seeding...');
            await sequelize.query('PRAGMA foreign_keys = OFF;');
            await sequelize.sync({ force: true });
            await sequelize.query('PRAGMA foreign_keys = ON;');
            logger.info('✅ Database cleaned');
        } else {
            // Just ensure schema exists
            await sequelize.sync();
        }

        await seedComprehensive();
        
        logger.info('🎉 Seed process completed successfully!');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Error running seed:', error);
        process.exit(1);
    }
};

runSeed();
