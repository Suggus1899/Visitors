import { migrator } from '../config/umzug';
import sequelize, { initializeDatabaseEncryption } from '../database';

async function applyMigrations() {
    try {
        console.log('Connecting to database...');
        await initializeDatabaseEncryption();
        await sequelize.authenticate();
        console.log('✓ Database connection established');

        console.log('Running migrations...');
        const migrations = await migrator.up();
        
        if (migrations.length === 0) {
            console.log('✓ No new migrations to apply');
        } else {
            console.log(`✓ Applied ${migrations.length} migrations:`);
            migrations.forEach(m => console.log(`  - ${m.name}`));
        }

        console.log('\n✓ All migrations applied successfully');
        process.exit(0);
    } catch (error) {
        console.error('✗ Migration failed:', error);
        process.exit(1);
    }
}

applyMigrations();
