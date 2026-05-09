import app from './app';
import sequelize from './database';
import { seedLoad, ensureBaseUsers } from './utils/seeder';
import { initRetentionScheduler } from './utils/retention';
import logger from './config/logger';
import './models/VisitInterval';

import config from './config/AppConfig';


const PORT = config.port;



const startServer = async () => {
    try {
        const useAlter = process.env.DB_SYNC_ALTER === '1';
        if (useAlter) {
            await sequelize.sync({ alter: true });
        } else {
            await sequelize.sync();
        }

        logger.info('Database synced (data persists).');

        // Ensure base users (admin, guard, auditor, demo) always exist
        await ensureBaseUsers();

        // Start daily retention cleanup (logs + photos)
        initRetentionScheduler();

        app.listen(PORT, () => {
            logger.info(`Server running on http://localhost:${PORT}`);
        });
    } catch (err: any) {
        logger.error('Unable to connect to the database:', err);
        try {
            const crashLogPath = require('path').join(config.dbPath, 'server_crash_log.txt');
            require('fs').writeFileSync(crashLogPath, String(err.stack || err));
        } catch (e) { }
    }
};

startServer();
