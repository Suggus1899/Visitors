import { Sequelize } from 'sequelize';
import config from './config/AppConfig';
import logger from './config/logger';

// Initialize Sequelize with PostgreSQL
const sequelize = new Sequelize({
    dialect: 'postgres',
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbName,
    username: config.dbUser,
    password: config.dbPassword,
    logging: (msg) => logger.debug(msg),
    dialectOptions: {
        ssl: config.dbSsl ? { rejectUnauthorized: false } : false
    },
    pool: {
        max: 20,
        min: 2,
        acquire: 30000,
        idle: 10000,
        evict: 30000
    }
});

export default sequelize;
