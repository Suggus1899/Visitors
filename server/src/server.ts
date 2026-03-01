import app from './app';
import sequelize, { initializeDatabaseEncryption } from './database';
import { seedLoad, ensureBaseUsers } from './utils/seeder';

// import { initScheduler } from './utils/scheduler'; // Legacy - commented out
import config from './config/AppConfig';
// import { migrateVisitSchema } from './migrations/migrate-visit-schema';


const PORT = config.port;



const startServer = async () => {
    try {
        // Run migration first (disabled for fresh start)
        // await migrateVisitSchema();

        await initializeDatabaseEncryption();

        // Cleanup potential leftover backup tables from failed migrations silently
        try {
            await sequelize.query('DROP TABLE IF EXISTS Visits_backup');
            await sequelize.query('DROP TABLE IF EXISTS Visitors_backup');
        } catch (e) {
            console.log('Ignore cleanup error');
        }

        const useAlter = process.env.DB_SYNC_ALTER === '1';
        if (useAlter) {
            try {
                await sequelize.sync({ alter: true });
            } catch (syncError) {
                console.error("Alter sync failed:", syncError);
                await sequelize.sync(); // fallback
            }
        } else {
            await sequelize.sync();
        }

        console.log('Database synced (data persists).');
        
        // Ensure base users (admin, guard, auditor, demo) always exist
        await ensureBaseUsers();

        app.listen(PORT, () => {
            console.log(`\n Server running on http://localhost:${PORT}`);
        });
    } catch (err: any) {
        console.error('Unable to connect to the database:', err);
        try {
            require('fs').writeFileSync('C:\\Users\\Gusgus\\Documents\\Proyectos\\Visitors\\server_crash_log.txt', String(err.stack || err));
        } catch(e) {}
    }
};

startServer();
