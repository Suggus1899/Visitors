import app from './app';
import sequelize from './database';
import { ensureBaseUsers } from './utils/seeder';
import { initRetentionScheduler } from './utils/retention';
import logger from './config/logger';
import path from 'path';
import fs from 'fs';
import './models/IntermittentLog';

import config from './config/AppConfig';

const PORT = config.port;

const startServer = async () => {
    try {
        const useAlter = process.env.DB_SYNC_ALTER === '1';
        if (useAlter && process.env.NODE_ENV === 'production') {
            logger.warn('DB_SYNC_ALTER=1 is dangerous in production — forcing safe sync');
            await sequelize.sync();
        } else if (useAlter) {
            await sequelize.sync({ alter: true });
        } else {
            await sequelize.sync();
        }

        logger.info('Database synced (data persists).');

        // Ensure base users (root, admin, operador, auditor, demo) always exist
        await ensureBaseUsers();

        // Start daily retention cleanup (logs + photos)
        initRetentionScheduler();

        const server = app.listen(PORT, () => {
            logger.info(`Server running on http://localhost:${PORT}`);
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info(`${signal} received — shutting down gracefully`);
            server.close(() => {
                logger.info('HTTP server closed');
            });
            try {
                await sequelize.close();
                logger.info('Database connections closed');
            } catch (err) {
                logger.error('Error closing database:', err);
            }
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (err: any) {
        logger.error('Unable to connect to the database:', err);
        try {
            const crashLogPath = path.join(config.dbPath, 'server_crash_log.txt');
            const errMsg = err?.message || String(err);
            fs.writeFileSync(crashLogPath, errMsg);
        } catch (e) {
            console.error('Failed to write crash log:', e);
        }
    }
};

startServer();
