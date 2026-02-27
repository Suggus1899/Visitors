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

        // Cleanup potential leftover backup tables from failed migrations
        await sequelize.query('DROP TABLE IF EXISTS Visits_backup');
        await sequelize.query('DROP TABLE IF EXISTS Visitors_backup');

        const useAlter = process.env.DB_SYNC_ALTER === '1';
        if (useAlter) {
            // Disable foreign keys to allow table alterations (SQLite workaround)
            await sequelize.query('PRAGMA foreign_keys = OFF');
            await sequelize.sync({ alter: true });
            await sequelize.query('PRAGMA foreign_keys = ON');
        } else {
            await sequelize.sync();
        }

        console.log('Database synced (data persists).');
        
        // Create indices for better query performance
        console.log('Creating database indices...');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_visits_checkin ON Visits(check_in_time)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_visits_visitor ON Visits(visitor_cedula)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_visits_status ON Visits(status)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_visits_person_to_visit ON Visits(person_to_visit)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_visits_purpose ON Visits(purpose)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON ActivityLogs(createdAt)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON ActivityLogs(userId)');
        console.log('Indices created successfully');

        // Ensure base users (admin, guard, auditor, demo) always exist
        await ensureBaseUsers();

        // Auto-seed with fixed count (150) - Optional for prod, but good for demo
        // await seedLoad({ visitorCount: 150 });


        // Initialize backup scheduler (legacy - commented out)
        // initScheduler();

        app.listen(PORT, () => {
            console.log(`\n Server running on http://localhost:${PORT}`);
            console.log(` Client expected at http://localhost:5173\n`);
        });
    } catch (err) {
        console.error('Unable to connect to the database:', err);
    }
};

startServer();
