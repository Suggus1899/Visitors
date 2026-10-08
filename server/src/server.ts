import app from './app';
import sequelize from './database';
import { migrator } from './config/umzug';
import { initRetentionScheduler } from './utils/retention';
import logger from './config/logger';
import path from 'path';
import fs from 'fs';
import './models/IntermittentLog';
import './models/VisitorEditHistory';

import config from './config/AppConfig';

const PORT = config.port;

const startServer = async () => {
    try {
        await sequelize.authenticate();
        const tables = await sequelize.getQueryInterface().showAllTables();
        if (!tables.includes('SequelizeMeta')) throw new Error('Database is not prepared. Run explicit database preparation and migrations before starting the server.');
        const pending = await migrator.pending();
        if (pending.length) throw new Error(`Pending migrations: ${pending.map(m => m.name).join(', ')}. Run pnpm --dir server migrate.`);
        if (process.env.RETENTION_ENABLED !== 'false') initRetentionScheduler();

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
        process.exitCode = 1;
        await sequelize.close();
        logger.error('Unable to start server:', err);
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
