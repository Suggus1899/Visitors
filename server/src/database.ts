import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs';
import config from './config/AppConfig';
import logger from './config/logger';

// SQLCipher driver (drop-in replacement for sqlite3)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlcipher = require('@journeyapps/sqlcipher');

// Database folder from config
const dataFolder = config.dbPath;

// Create data folder if it doesn't exist
if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dataFolder, 'visits.sqlite'),
    dialectModule: sqlcipher,
    logging: false // Disable logging for cleaner output
});

export const initializeDatabaseEncryption = async () => {
    if (!config.dbEncryptionKey) {
        throw new Error('DB_ENCRYPTION_KEY is required to use SQLCipher');
    }

    // Validate key format: must be a 64-character hex string (32 bytes)
    if (!/^[a-f0-9]{64}$/i.test(config.dbEncryptionKey)) {
        throw new Error('DB_ENCRYPTION_KEY must be a 64-character hex string');
    }

    // Apply SQLCipher key using canonical hex literal format (prevents injection)
    await sequelize.query(`PRAGMA key = "x'${config.dbEncryptionKey}'";`);
    await sequelize.query('PRAGMA cipher_compatibility = 4;');
    await sequelize.query('PRAGMA cipher_migrate;');

    try {
        await sequelize.query('SELECT count(*) FROM sqlite_master');
    } catch (error) {
        throw new Error('Failed to open encrypted database. Verify DB_ENCRYPTION_KEY or migrate a plaintext database before startup.');
    }
};

export default sequelize;
